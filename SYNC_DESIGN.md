# SmartBackup V0.4.0 备份中心（方案 A：无 NAS）

## 目标
移动硬盘是原文件总库；来源可以是手机经电脑中转目录、百度网盘下载目录、Google Photos Takeout 导出目录、或任意用户自行选择的云盘下载目录。所有导入都走同一 SHA-256 去重和复制后校验流程。不会删源、不会自动删除硬盘照片。

## 真实的同步能力

| 方向 | 实现 |
| --- | --- |
| 手机 → 电脑目录 → 移动硬盘 | 可用：选择从手机导出的目录 |
| 百度网盘 → 移动硬盘 | 可用：先用百度网盘下载，再选择目录导入；尚非 API 直连 |
| Google Photos → 移动硬盘 | 可用：先使用 Google Takeout 导出并解压，再选择目录；尚非自动全库同步 |
| 自定义网盘 → 移动硬盘 | 可用：通过网盘客户端下载目录后导入 |
| 移动硬盘 → Google Drive | 可在桌面使用已配置的 rclone Google Drive（drive 类型）remote 增量上传；首次使用需用户授权 |
| 手机 → Google Photos / 百度网盘 | 手机端可使用相应官方客户端或网页。SmartBackup 内直接上传模块尚未完成 |
| 手机 OTG → 移动硬盘 | 不属于当前电脑端开发范围；手机照片统一经电脑中转 |

## Google Photos 导入限制
2025-03-31 后 Google Photos Library API 只能自动列出和读取**由该应用创建**的媒体。第三方程序不能通过旧 API 自动下载全部既有 Google Photos 照片。完整迁移请使用 Google Takeout；用户主动选择部分照片可研究 Picker API。

官方：https://developers.google.com/photos/support/updates
Rclone Google Drive：https://rclone.org/drive/

## Google Drive 上传准备
1. 在 Windows 或 Mac 安装 rclone，确保终端输入 rclone 可运行。
2. 使用 rclone config 创建类型为 **Google Drive**（rclone 类型名 `drive`）的 remote，例如 gdrive，并按官方说明自行设置 OAuth Client ID。默认共享 Client ID 会在 2026 年退出。
3. 在桌面 SmartBackup 选择移动硬盘，打开「备份中心」→「检测 Google Drive 连接」→ 选择已存在的配置 → 点击「备份新增照片和视频」。仅上传未在该硬盘的云端上传账本中标记成功的照片和视频。
4. 照片和视频分别写入 `SmartBackup/Photos/YYYY/MM/` 与 `SmartBackup/Videos/YYYY/MM/`；文件名包含完整 SHA-256，并使用 rclone `--immutable` 防止覆盖内容不同的同名云端文件。原件不改动。
5. 云端账本位于 \`.smartbackup/cloud-uploads.json\`；不存 OAuth token，rclone 授权文件放在运行电脑的 rclone 配置目录。换电脑时需要重新配置授权。
6. 如 Google Drive 上传成功但在本地写入账本前断电/拔盘，下次会再次尝试相同 SHA-256 文件名；`--immutable` 会避免覆盖内容不同的云端对象。上传流程不使用 `rclone sync`、`delete` 或 `move`。

如导入 Google Takeout，先解压到电脑临时文件夹；目前按文件修改时间分组，不能完整保留 Takeout JSON sidecar 中的元数据。

## 后续扩展
百度网盘 API 和 Google Photos Picker 均要单独授权与测试，不能把手动导入伪装成已实现的云端自动同步。后续连接器应遵循：读取/写入能力声明、可恢复队列、原文件 SHA-256、每个目标独立状态、最小授权、失败不删除。

## 独立的完整性核验
每次本地导入保留任务摘要于 `.smartbackup/history.json`；`verifyArchive` 逐个比较原始索引记录与硬盘实际媒体文件 SHA-256，发现损坏、缺失或未收录文件时只报告，不自动删除或覆盖。目录刷新时将消失的索引项放在 `index.missing` 中，防止静默删除历史证据。检查大量文件会占用较多硬盘读取时间。
