package io.smartbackup.android

import android.content.ContentUris
import android.content.Context
import android.net.Uri
import android.provider.MediaStore
import androidx.documentfile.provider.DocumentFile
import org.json.JSONArray
import org.json.JSONObject
import java.io.InputStream
import java.security.MessageDigest
import java.time.Instant
import java.time.ZoneId
import java.util.UUID

data class MediaRow(
    val uri: Uri,
    val name: String,
    val mime: String,
    val size: Long,
    val dateTaken: Long,
    val kind: String
)
data class BackupResult(val scanned: Int, val copied: Int, val duplicates: Int, val failed: Int)

object OtgBackup {
    fun ensureDeviceIdentity(context: Context, treeUri: Uri): JSONObject {
        val root = DocumentFile.fromTreeUri(context, treeUri) ?: error("无法读取移动硬盘目录")
        val meta = directory(root, ".smartbackup")
        val marker = meta.findFile("device.json")
        if (marker != null && marker.isFile) {
            val value = JSONObject(context.contentResolver.openInputStream(marker.uri)!!.bufferedReader().use { it.readText() })
            require(value.optInt("schemaVersion") == 1 && value.optString("deviceId").isNotBlank()) {
                "硬盘 device.json 格式异常。为保护已有照片库，不会自动重建。"
            }
            return value
        }
        val value = JSONObject()
            .put("schemaVersion", 1)
            .put("deviceId", UUID.randomUUID().toString())
            .put("createdAt", Instant.now().toString())
            .put("app", "SmartBackup")
        writeDocument(context, meta, "device.json", "application/json", value.toString(2).toByteArray())
        return value
    }

    fun backup(context: Context, treeUri: Uri, onProgress: (String) -> Unit): BackupResult {
        val root = DocumentFile.fromTreeUri(context, treeUri) ?: error("移动硬盘不可用")
        require(root.exists() && root.isDirectory) { "请重新连接移动硬盘" }
        ensureDeviceIdentity(context, treeUri)
        val meta = directory(root, ".smartbackup")
        val indexFile = meta.findFile("index.json")
        val index = if (indexFile != null && indexFile.isFile) {
            try { JSONObject(context.contentResolver.openInputStream(indexFile.uri)!!.bufferedReader().use { it.readText() }) }
            catch (_: Exception) { readBackupIndex(context, meta) }
        } else readBackupIndex(context, meta)
        val items = index.optJSONArray("items") ?: JSONArray()
        val known = HashMap<String, MutableList<String>>()
        for (i in 0 until items.length()) {
            val item = items.optJSONObject(i) ?: continue
            val hash = item.optString("sha256")
            val relative = item.optString("relativePath")
            if (hash.isNotBlank() && relative.isNotBlank()) known.getOrPut(hash) { mutableListOf() }.add(relative)
        }
        val media = queryMedia(context)
        var copied = 0
        var duplicates = 0
        var failed = 0
        for ((position, row) in media.withIndex()) {
            try {
                onProgress("正在检查 ${position + 1} / ${media.size}：${row.name}")
                val sourceHash = hashInput(context.contentResolver.openInputStream(row.uri) ?: error("无法读取原件"))
                val copies = known[sourceHash].orEmpty()
                val intact = copies.any { relative ->
                    val existing = findRelative(root, relative)
                    existing != null && existing.isFile && runCatching {
                        hashInput(context.contentResolver.openInputStream(existing.uri)!!) == sourceHash
                    }.getOrDefault(false)
                }
                if (intact) {
                    duplicates++
                    continue
                }
                val date = if (row.dateTaken > 0) row.dateTaken else System.currentTimeMillis()
                val zoned = Instant.ofEpochMilli(date).atZone(ZoneId.systemDefault())
                val year = "%04d".format(zoned.year)
                val month = "%02d".format(zoned.monthValue)
                val folder = directory(directory(root, row.kind), year).let { directory(it, month) }
                val targetName = uniqueName(folder, row.name)
                val tempName = ".smartbackup-part-${UUID.randomUUID()}"
                val temp = folder.createFile(row.mime, tempName) ?: error("无法创建临时文件")
                val copiedHash = copyAndHash(context, context.contentResolver.openInputStream(row.uri) ?: error("无法再次读取原件"), temp)
                if (copiedHash != sourceHash) {
                    temp.delete()
                    error("复制后 SHA-256 校验不一致")
                }
                if (!temp.renameTo(targetName)) {
                    temp.delete()
                    error("移动硬盘不支持安全重命名，未将未校验文件记为成功")
                }
                val relative = "${row.kind}/$year/$month/$targetName"
                val metadata = JSONObject()
                    .put("dateTaken", Instant.ofEpochMilli(date).toString())
                    .put("dateSource", "file")
                    .put("cameraMake", JSONObject.NULL)
                    .put("cameraModel", JSONObject.NULL)
                    .put("lensModel", JSONObject.NULL)
                    .put("latitude", JSONObject.NULL)
                    .put("longitude", JSONObject.NULL)
                    .put("gpsAvailable", false)
                    .put("gpsIndexed", false)
                val record = JSONObject()
                    .put("relativePath", relative)
                    .put("size", row.size)
                    .put("mtimeMs", date)
                    .put("sha256", sourceHash)
                    .put("kind", row.kind)
                    .put("source", "Android OTG")
                    .put("metadata", metadata)
                items.put(record)
                known.getOrPut(sourceHash) { mutableListOf() }.add(relative)
                copied++
            } catch (_: Exception) {
                failed++
            }
        }
        index.put("version", 1)
            .put("items", items)
            .put("missing", index.optJSONArray("missing") ?: JSONArray())
            .put("integrityAlerts", index.optJSONArray("integrityAlerts") ?: JSONArray())
            .put("favorites", index.optJSONArray("favorites") ?: JSONArray())
            .put("updatedAt", Instant.now().toString())
        saveIndex(context, meta, index)
        appendHistory(context, meta, media.size, copied, duplicates, failed)
        return BackupResult(media.size, copied, duplicates, failed)
    }

    private fun queryMedia(context: Context): List<MediaRow> {
        val result = mutableListOf<MediaRow>()
        val resolver = context.contentResolver
        val projection = arrayOf(
            MediaStore.MediaColumns._ID,
            MediaStore.MediaColumns.DISPLAY_NAME,
            MediaStore.MediaColumns.MIME_TYPE,
            MediaStore.MediaColumns.SIZE,
            MediaStore.Images.ImageColumns.DATE_TAKEN,
            MediaStore.MediaColumns.DATE_ADDED
        )
        val sources = listOf(
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI to "Photos",
            MediaStore.Video.Media.EXTERNAL_CONTENT_URI to "Videos"
        )
        for ((collection, kind) in sources) {
            resolver.query(collection, projection, null, null, "${MediaStore.Images.ImageColumns.DATE_TAKEN} DESC")?.use { cursor ->
                val idColumn = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns._ID)
                val nameColumn = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.DISPLAY_NAME)
                val mimeColumn = cursor.getColumnIndex(MediaStore.MediaColumns.MIME_TYPE)
                val sizeColumn = cursor.getColumnIndex(MediaStore.MediaColumns.SIZE)
                val dateColumn = cursor.getColumnIndex(MediaStore.Images.ImageColumns.DATE_TAKEN)
                val addedColumn = cursor.getColumnIndex(MediaStore.MediaColumns.DATE_ADDED)
                while (cursor.moveToNext()) {
                    val id = cursor.getLong(idColumn)
                    val uri = ContentUris.withAppendedId(collection, id)
                    val name = cursor.getString(nameColumn) ?: "$id"
                    val mime = if (mimeColumn >= 0) cursor.getString(mimeColumn) ?: "application/octet-stream" else "application/octet-stream"
                    val size = if (sizeColumn >= 0) cursor.getLong(sizeColumn) else 0L
                    val taken = if (dateColumn >= 0) cursor.getLong(dateColumn) else 0L
                    val added = if (addedColumn >= 0) cursor.getLong(addedColumn) * 1000L else 0L
                    val date = if (taken > 0) taken else added
                    result.add(MediaRow(uri, name, mime, size, date, kind))
                }
            }
        }
        return result
    }

    private fun directory(parent: DocumentFile, name: String): DocumentFile {
        val existing = parent.findFile(name)
        if (existing != null && existing.isDirectory) return existing
        require(existing == null) { "目标位置存在同名非文件夹：$name" }
        return parent.createDirectory(name) ?: error("无法创建目录：$name")
    }

    private fun uniqueName(folder: DocumentFile, original: String): String {
        val clean = original.replace("/", "_").replace("\\", "_").ifBlank { "media" }
        if (folder.findFile(clean) == null) return clean
        val dot = clean.lastIndexOf('.')
        val base = if (dot > 0) clean.substring(0, dot) else clean
        val ext = if (dot > 0) clean.substring(dot) else ""
        var n = 2
        while (folder.findFile("$base ($n)$ext") != null) n++
        return "$base ($n)$ext"
    }

    private fun findRelative(root: DocumentFile, relative: String): DocumentFile? {
        if (relative.startsWith("/") || relative.split('/').any { it == ".." || it == ".smartbackup" }) return null
        var current = root
        for (part in relative.split('/')) current = current.findFile(part) ?: return null
        return current
    }

    private fun hashInput(input: InputStream): String {
        val digest = MessageDigest.getInstance("SHA-256")
        input.use { stream ->
            val buffer = ByteArray(1024 * 1024)
            while (true) {
                val count = stream.read(buffer)
                if (count < 0) break
                digest.update(buffer, 0, count)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    private fun copyAndHash(context: Context, input: InputStream, target: DocumentFile): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val output = context.contentResolver.openOutputStream(target.uri, "w") ?: error("无法写入移动硬盘")
        input.use { source ->
            output.use { sink ->
                val buffer = ByteArray(1024 * 1024)
                while (true) {
                    val count = source.read(buffer)
                    if (count < 0) break
                    digest.update(buffer, 0, count)
                    sink.write(buffer, 0, count)
                }
                sink.flush()
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    private fun writeDocument(context: Context, parent: DocumentFile, name: String, mime: String, bytes: ByteArray) {
        val tempName = ".$name.tmp-${UUID.randomUUID()}"
        val temp = parent.createFile(mime, tempName) ?: error("无法创建临时文件：$name")
        try {
            context.contentResolver.openOutputStream(temp.uri, "w")!!.use { it.write(bytes) }
            val current = parent.findFile(name)
            if (current != null) {
                parent.findFile("$name.bak")?.delete()
                if (!current.renameTo("$name.bak")) error("无法保留旧文件：$name")
            }
            if (!temp.renameTo(name)) {
                current?.renameTo(name)
                error("无法安全更新文件：$name")
            }
        } catch (error: Exception) {
            temp.delete()
            throw error
        }
    }

    private fun readBackupIndex(context: Context, meta: DocumentFile): JSONObject {
        val backup = meta.findFile("index.json.bak") ?: return JSONObject()
        return runCatching {
            JSONObject(context.contentResolver.openInputStream(backup.uri)!!.bufferedReader().use { it.readText() })
        }.getOrElse { JSONObject() }
    }

    private fun saveIndex(context: Context, meta: DocumentFile, index: JSONObject) {
        val temp = writeTemp(context, meta, "index.json.tmp", index.toString().toByteArray())
        val current = meta.findFile("index.json")
        val backup = meta.findFile("index.json.bak")
        backup?.delete()
        if (current != null && !current.renameTo("index.json.bak")) {
            temp.delete()
            error("无法创建索引恢复副本，已停止更新")
        }
        if (!temp.renameTo("index.json")) {
            current?.renameTo("index.json")
            temp.delete()
            error("无法安全更新硬盘索引")
        }
    }

    private fun writeTemp(context: Context, parent: DocumentFile, name: String, bytes: ByteArray): DocumentFile {
        parent.findFile(name)?.delete()
        val file = parent.createFile("application/json", name) ?: error("无法创建临时索引")
        context.contentResolver.openOutputStream(file.uri, "w")!!.use { it.write(bytes) }
        return file
    }

    private fun appendHistory(context: Context, meta: DocumentFile, scanned: Int, copied: Int, duplicates: Int, failed: Int) {
        val file = meta.findFile("history.json")
        val history = if (file != null) runCatching {
            JSONObject(context.contentResolver.openInputStream(file.uri)!!.bufferedReader().use { it.readText() })
        }.getOrElse { JSONObject() } else JSONObject()
        val entries = history.optJSONArray("entries") ?: JSONArray()
        val entry = JSONObject()
            .put("id", UUID.randomUUID().toString())
            .put("time", Instant.now().toString())
            .put("type", "import")
            .put("status", if (failed > 0) "partial" else "ok")
            .put("source", "Android OTG")
            .put("scanned", scanned)
            .put("copied", copied)
            .put("duplicates", duplicates)
            .put("failed", failed)
            .put("checked", 0)
            .put("corrupt", 0)
            .put("modified", 0)
            .put("missing", 0)
            .put("unindexed", 0)
            .put("uploaded", 0)
        val next = JSONArray().put(entry)
        for (i in 0 until minOf(entries.length(), 39)) next.put(entries.getJSONObject(i))
        writeDocument(context, meta, "history.json", "application/json", JSONObject().put("version", 1).put("entries", next).toString().toByteArray())
    }
}
