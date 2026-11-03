package io.smartbackup.android

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.documentfile.provider.DocumentFile
import java.util.concurrent.Executors

class MainActivity : ComponentActivity() {
    private val worker = Executors.newSingleThreadExecutor()
    private lateinit var status: TextView
    private lateinit var driveLabel: TextView
    private lateinit var backupButton: Button
    private var treeUri: Uri? = null
    private var busy = false

    private val chooseDrive = registerForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri ->
        if (uri != null) {
            try {
                val flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                contentResolver.takePersistableUriPermission(uri, flags)
                getSharedPreferences("portable", MODE_PRIVATE).edit().putString("treeUri", uri.toString()).apply()
                treeUri = uri
                worker.execute {
                    val identity = OtgBackup.ensureDeviceIdentity(this, uri)
                    runOnUiThread {
                        driveLabel.text = "已连接 · ${identity.optString("deviceId").take(8)}…"
                        status.text = "移动硬盘已登记。以后重新插入这块硬盘，应用会尝试恢复授权。"
                        updateButtons()
                    }
                }
            } catch (error: Exception) {
                status.text = "连接失败：${error.message}"
            }
        }
    }

    private val requestMedia = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
        val granted = grants.values.any { it }
        status.text = if (granted) "照片/视频读取权限已更新。" else "尚未获得媒体读取权限。"
        updateButtons()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.rgb(17, 23, 32)
        window.navigationBarColor = Color.rgb(17, 23, 32)
        setContentView(buildUi())
        treeUri = getSharedPreferences("portable", MODE_PRIVATE).getString("treeUri", null)?.let(Uri::parse)
        restoreDrive()
        updateButtons()
    }

    private fun buildUi(): View {
        val page = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(22), dp(26), dp(22), dp(26))
            setBackgroundColor(Color.rgb(17, 23, 32))
        }
        val scroll = ScrollView(this)
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
        }
        val title = TextView(this).apply {
            text = "SmartBackup"
            textSize = 30f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
        }
        val subtitle = TextView(this).apply {
            text = "你的私人照片库 · Android OTG"
            textSize = 15f
            setTextColor(Color.rgb(164, 178, 198))
            gravity = Gravity.CENTER
            setPadding(0, dp(8), 0, dp(22))
        }
        driveLabel = TextView(this).apply {
            text = "尚未连接移动硬盘"
            textSize = 16f
            setTextColor(Color.rgb(130, 205, 165))
            setPadding(dp(16), dp(18), dp(16), dp(18))
            setBackgroundColor(Color.rgb(31, 43, 57))
        }
        status = TextView(this).apply {
            text = "先连接支持 OTG 的移动硬盘，再授权读取手机照片和视频。"
            textSize = 14f
            setTextColor(Color.rgb(202, 211, 224))
            setPadding(dp(4), dp(18), dp(4), dp(22))
        }
        val connect = makeButton("① 连接移动硬盘（首次授权）") { chooseDrive.launch(null) }
        val permission = makeButton("② 授权读取照片和视频") { requestMedia.launch(requiredPermissions()) }
        backupButton = makeButton("③ 开始备份到移动硬盘") { startBackup() }
        backupButton.isEnabled = false
        val note = TextView(this).apply {
            text = "备份规则\n• 保留照片和视频原文件，不压缩、不删除手机原件\n• SHA-256 内容去重，复制后再次校验\n• 索引和设备身份写入硬盘 .smartbackup 目录\n• 支持与 Windows / macOS 桌面版共用同一照片库\n\n首次连接时，请在系统文件选择器中选择移动硬盘的根目录。机械硬盘可能需要带独立供电的 OTG Hub。"
            textSize = 13f
            setTextColor(Color.rgb(151, 164, 183))
            setPadding(dp(4), dp(22), dp(4), dp(8))
        }
        content.addView(title)
        content.addView(subtitle)
        content.addView(driveLabel, LinearLayout.LayoutParams(-1, -2))
        content.addView(status, LinearLayout.LayoutParams(-1, -2))
        content.addView(connect, matchWidth())
        content.addView(permission, matchWidth())
        content.addView(backupButton, matchWidth())
        content.addView(note, matchWidth())
        scroll.addView(content)
        page.addView(scroll)
        return page
    }

    private fun makeButton(label: String, action: () -> Unit): Button =
        Button(this).apply {
            text = label
            textSize = 14f
            isAllCaps = false
            setOnClickListener { action() }
            setPadding(dp(8), dp(10), dp(8), dp(10))
        }

    private fun matchWidth() = LinearLayout.LayoutParams(-1, -2).apply {
        bottomMargin = dp(10)
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private fun requiredPermissions(): Array<String> = when {
        Build.VERSION.SDK_INT >= 34 -> arrayOf(
            Manifest.permission.READ_MEDIA_IMAGES,
            Manifest.permission.READ_MEDIA_VIDEO,
            Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED
        )
        Build.VERSION.SDK_INT >= 33 -> arrayOf(
            Manifest.permission.READ_MEDIA_IMAGES,
            Manifest.permission.READ_MEDIA_VIDEO
        )
        else -> arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE)
    }

    private fun hasMediaPermission(): Boolean {
        return when {
            Build.VERSION.SDK_INT >= 33 ->
                checkSelfPermission(Manifest.permission.READ_MEDIA_IMAGES) == PackageManager.PERMISSION_GRANTED &&
                checkSelfPermission(Manifest.permission.READ_MEDIA_VIDEO) == PackageManager.PERMISSION_GRANTED
            else -> checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED
        }
    }

    private fun restoreDrive() {
        val uri = treeUri ?: return
        worker.execute {
            try {
                val root = DocumentFile.fromTreeUri(this, uri)
                if (root != null && root.exists() && root.isDirectory) {
                    val identity = OtgBackup.ensureDeviceIdentity(this, uri)
                    runOnUiThread {
                        driveLabel.text = "已恢复连接 · ${identity.optString("deviceId").take(8)}…"
                        status.text = "已恢复上次移动硬盘授权。确认硬盘已连接后即可备份。"
                        updateButtons()
                    }
                } else {
                    runOnUiThread {
                        driveLabel.text = "等待移动硬盘重新连接"
                        status.text = "未找到上次授权的硬盘。重新插入后重试，或重新选择硬盘根目录。"
                        updateButtons()
                    }
                }
            } catch (error: Exception) {
                runOnUiThread {
                    driveLabel.text = "需要重新授权"
                    status.text = "系统未能恢复 USB 授权：${error.message}。请重新选择移动硬盘。"
                    updateButtons()
                }
            }
        }
    }

    private fun updateButtons() {
        backupButton.isEnabled = !busy && treeUri != null && hasMediaPermission()
    }

    private fun startBackup() {
        if (busy) return
        val uri = treeUri ?: run {
            status.text = "请先连接移动硬盘。"
            return
        }
        if (!hasMediaPermission()) {
            requestMedia.launch(requiredPermissions())
            return
        }
        busy = true
        updateButtons()
        status.text = "正在扫描手机照片和视频……"
        worker.execute {
            try {
                val result = OtgBackup.backup(this, uri) { message ->
                    runOnUiThread { status.text = message }
                }
                runOnUiThread {
                    status.text = "备份完成：扫描 ${result.scanned} 项 · 新增 ${result.copied} 项 · 去重 ${result.duplicates} 项 · 失败 ${result.failed} 项。手机原件未删除。"
                    busy = false
                    updateButtons()
                }
            } catch (error: Exception) {
                runOnUiThread {
                    status.text = "备份中止：${error.message}"
                    busy = false
                    updateButtons()
                }
            }
        }
    }

    override fun onDestroy() {
        worker.shutdown()
        super.onDestroy()
    }
}
