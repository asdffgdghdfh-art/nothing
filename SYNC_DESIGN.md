# SmartBackup V0.3 备份中心（方案 A：无 NAS）

## 目标
移动硬盘是原文件总库；来源可以是手机（通过电脑文件夹或 OTG）、百度网盘下载目录、Google Photos Takeout 导出目录、或任意用户自行选择的云盘下载目录。所有导入都走同一 SHA-256 去重和复制后校验流程。不会删源、不会自动删除硬盘照片。

## 真实的同步能力

| 方向 | 实现 |
| --- | --- |
| 手机 → 电脑目录 → 移动硬盘 | 可用：选择从手机导出的目录 |
| 百度网盘 → 移动硬盘 | 可用：先用百度网盘下载，再选择目录导入；尚非 API 直连 |
| Google Photos → 移动硬盘 | 可用：先使用 Google Takeout 导出并解压，再选择目录；尚非自动全库同步 |
| 自定义网盘 → 移动硬盘 | 可用：通过网盘客户端下载目录后导入 |
| 移动硬盘 → Google Photos | 可在桌面使用已配置的 rclone Google Photos remote 一键上传；真实上传需用户安装配置 rclone；不支持免授权 |
| 手机 → Google Photos / 百度网盘 | 手机端可使用相应官方客户端或网页。SmartBackup 内直接上传模块尚未完成 |
| 手机 OTG → 移动硬盘 | 预定 Android 原生应用实现，目前尚无正式 APK |

## Google Photos 的官方限制
2025-03-31 后 Google Photos Library API 只能自动列出和读取**由该应用创建**的媒体。第三方程序不能通过旧 API 自动下载全部既有 Google Photos 照片。完整迁移请使用 Google Takeout；用户主动选择部分照片可研究 Picker API。

官方：https://developers.google.com/photos/support/updates
Rclone：https://rclone.org/googlephotos/

## Google Photos 上传准备
1. 在 Windows 或 Mac 安装 rclone，确保终端输入 rclone 可运行。
2. 使用 rclone config 创建类型为 **Google Photos** 的 remote，例如 gphotos，并按官方说明自行设置 OAuth Client ID。默认共享 Client ID 会在 2026 年退出。
3. 在桌面 SmartBackup 选择移动硬盘，打开「同步中心」→「检查 Google Photos 连接」→ 选择已存在的配置 → 开始上传。仅上传未在该硬盘的云端上传账本中标记成功的文件。
4. 照片以 \`SHA-256 前缀-文件名\` 写入 Google Photos 的 upload 虚拟目录；原件不改动，云端是否有原本存在的同一照片无法完整检索，不能承诺与旧图库零重复。
5. 云端账本位于 \`.smartbackup/cloud-uploads.json\`；不存 OAuth token，rclone 授权文件放在运行电脑的 rclone 配置目录。换电脑时需要重新配置授权。
6. 如 Google Photos 上传成功但在本地写入账本前断电/拔盘，下次可能重传；这属于当前版本限制。上传流程不使用 \`rclone sync\`、\`delete\` 或 \`move\`。

如导入 Google Takeout，先解压到电脑临时文件夹；目前已读取 Takeout JSON sidecar 中的拍摄时间；GPS 仅在用户开启地点整理后读取。其他 sidecar 字段仍未完整迁移。

## 后续扩展
百度网盘 API 和 Google Photos Picker 均要单独授权与测试，不能把手动导入伪装成已实现的云端自动同步。后续连接器应遵循：读取/写入能力声明、可恢复队列、原文件 SHA-256、每个目标独立状态、最小授权、失败不删除。

## 独立的完整性核验
每次本地导入保留任务摘要于 `.smartbackup/history.json`；`verifyArchive` 逐个比较原始索引记录与硬盘实际媒体文件 SHA-256，发现损坏、缺失或未收录文件时只报告，不自动删除或覆盖。目录刷新时将消失的索引项放在 `index.missing` 中，防止静默删除历史证据。检查大量文件会占用较多硬盘读取时间。


## V0.4 私人照片管家路线
已加入桌面端元数据索引基础：
- 照片优先使用 EXIF / Google Takeout sidecar 拍摄时间；MP4 / MOV / M4V / 3GP 读取 QuickTime 容器创建时间；缺少元数据时回退文件修改时间。
- 相机品牌、型号、镜头信息用于设备分组。
- GPS 地点整理默认关闭；用户主动开启后只在本机解析并写入移动硬盘索引；关闭时清除索引中的 GPS 坐标。
- 不反向地理编码，不联网查询地点，不上传 GPS。

后续阶段：
1. 可选本地人物检测与聚类；只产生“人物 1 / 人物 2”分组，用户手动命名，不做身份识别。
2. 相似照片 / 连拍 / 截图分类，采用本地特征与可解释阈值。
3. 地点名称可选离线地图包或用户手动命名；默认不向第三方发送坐标。
4. MKV / AVI / MTS 等其他视频容器元数据，以及侧车元数据、索引迁移和跨电脑偏好兼容测试。

所有新功能必须保持原件不改写、无自动删除、元数据默认本地处理、可关闭并清除索引副本。


### 跨时区拍摄时间
EXIF `DateTimeOriginal` 常常不带时区信息，索引对这类时间保留本地墙上时间（不强行转成 UTC），避免移动硬盘在不同国家/时区的电脑之间切换时出现拍摄日期偏移。Google Takeout Unix 时间戳、QuickTime 容器创建时间和文件修改时间仍按绝对时间保存。


### 视频拍摄时间索引
桌面端新增对 MP4 / MOV / M4V / 3GP QuickTime/ISO-BMFF `moov/mvhd` 创建时间的本地读取。时间优先级为 Google Takeout sidecar 时间，其次容器创建时间，最后文件修改时间。MKV / AVI / MTS 等格式暂未解析容器元数据，仍回退文件修改时间。读取采用文件随机访问并跳过媒体数据块，不把整段视频载入内存。
