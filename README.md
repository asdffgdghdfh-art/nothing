> **V0.4.0 方案 A（电脑中转、移动硬盘、Google Drive 双份备份）：** 手机/百度网盘下载目录 → 电脑临时文件夹 → 移动硬盘，移动硬盘 → Google Drive（rclone 已配置并授权时增量上传），详见 [SYNC_DESIGN.md](SYNC_DESIGN.md)。百度网盘 API 直连仍未实现；Google Drive 上传需在电脑配置 rclone 的 drive 类型连接。

# SmartBackup V0.4.0 · 便携照片库

> **当前为无 NAS / 无服务器的离线方案 A。** 桌面端界面已重新设计为参考 [Immich](https://github.com/immich-app/immich) 体验的明亮相册：时间轴、照片与视频统一浏览、日期分组、全屏预览（支持前后切换、Esc 退出）、收藏、来源与本地备份状态。
>
> 本项目**不是 Immich 官方客户端或 Immich 源码移植**，界面是针对 Electron 的独立重新实现。官方 Immich 采用 SvelteKit、服务端和数据库，不能作为无服务器应用简单放入移动硬盘。参考了界面交互思路，未移植其 AGPL 源代码。只有完成的能力才会显示为可用。
>
> **数据安全：** 原有 SHA-256 严格去重、原文件复制、哈希校验、硬盘内索引依旧保留。请先使用空文件夹验证；不开发 Android 直接备份 APK / OTG；Windows MTP 直读暂不支持；Google Drive 上传需在电脑配置 rclone。

## V0.4.0 已实施

- 明亮的双栏照片资料库；顶部搜索、导入入口、备份按钮、硬盘连接状态。
- 照片与视频混合时间轴，按照**文件修改时间**分组（尚未读取 EXIF 拍摄时间）。
- 每页最多展示 240 项并支持按需加载，避免初次打开过多图片。
- 原位全屏预览，方向键切换、Esc 关闭、系统外部打开和收藏；浏览器/系统不支持的 HEIC 或视频编码可能只显示占位图。
- 文件级增量备份、SHA-256 去重和复制后校验逻辑保持不变。
- Google Drive 单向增量备份：识别 rclone `drive` remote，按原有 Photos/Videos 目录上传，使用完整 SHA-256 文件名和硬盘内上传账本；不删除原件，并通过 `--immutable` 避免覆盖不同内容。
- 照片浏览、硬盘导入和完整性核验可离线运行；仅在用户主动点击 Google Drive 上传时访问云端，不删除来源照片或硬盘原件。

## 接下来尚未完成

Windows MTP 直读；可靠的 EXIF 拍摄时间索引；原文件 HEIC 与视频缩略图优化；Google Drive 云端完整性复核和更细致的断点续传状态；百度网盘 API 直连。Android / OTG 不属于当前电脑端开发范围。

Google Drive 单向增量上传已接入桌面端，但首次使用必须在电脑配置 rclone 的 Google Drive（drive 类型）remote 并完成 OAuth 授权。
---

跨平台、离线优先的照片和视频备份工具。旧版说明：**V0.1 桌面版 MVP**。将打包后的 Windows 便携 EXE 或 macOS App 放在 WD Elements/移动 SSD 上，在对应电脑上运行即可；媒体和去重索引均保存到所选择的外置硬盘目录内。

> 当前状态：桌面端文件夹备份可用；**Android APK、Windows MTP 手机直接访问、Mac Android 桥接、GPS 地点、原生 EXIF 日期整理尚未实现**。目前可先用手机的文件传输方式将照片复制到电脑文件夹，再通过 SmartBackup 备份；Windows MTP 直接扫描是后续目标。

## 功能

- 明亮 Immich 风格相册界面：**照片、视频、合集、收藏夹、地点（占位）、来源、存储空间**。集合根据文件修改年月分组；地点暂不读取 GPS。
- 选择来源文件夹、选择备份目标；按 `Photos/YYYY/MM` 和 `Videos/YYYY/MM` 归档（目前以文件修改时间为依据）。
- SHA-256 严格去重：内容完全相同即使改名也跳过；保留无损原件，不转码压缩。
- 复制到隐藏的临时文件、校验来源和目标哈希、一致后才正式命名；任务中断不会把半截文件当成成功备份。
- 每次扫描 `Photos/` 和 `Videos/` 中实际存在的媒体；即使手工拷入硬盘也能补进索引。
- 索引放在硬盘内 `.smartbackup/index.json`，损坏时可以扫描媒体重建；切勿手动修改索引文件。硬盘上的普通媒体可直接用系统文件管理器查看。
- 照片浏览、硬盘导入和完整性核验可离线运行；仅在用户主动点击 Google Drive 上传时访问云端，不删除来源照片或硬盘原件。收藏标记存放在索引中。

## Windows 一键启动（推荐首次试用）

1. 在 GitHub Desktop 中点击 **Fetch origin**，如果出现 **Pull origin** 再点击它，把仓库更新到最新版。
2. 打开克隆目录（例如 `E:\Projects\smartbackup`），双击 **`启动SmartBackup.cmd`**。
3. 第一次启动需要 Windows 已安装 **Node.js LTS（包含 npm）**，可从 [Node.js 官网](https://nodejs.org/en/download) 获取；安装后关闭并重新打开启动脚本。
4. 如果依赖尚未安装，脚本自动运行 `npm install`；首次需要联网并会在项目内生成 `node_modules`。之后双击同一个脚本直接启动，不再重复安装。
5. 界面出现后，先点「选择硬盘」选外置盘根目录（例如 `E:\`），再点「选择来源」选择**普通本地文件夹**，建议用测试照片试备份。

注意：目前 Windows 上的 Android 手机通过 USB 连接后显示为 MTP 设备，**暂时不能直接作为此版本的来源文件夹选择**。可先把手机照片从 `DCIM/Camera` 复制到电脑的临时文件夹，再用 SmartBackup 备份。之后会继续开发 MTP 直连扫描。

未来更方便的使用方式：到 GitHub **Actions → Desktop builds → Artifacts** 下载构建成功的 **SmartBackup-Windows-portable**，解压后将其中的便携 EXE 放到 WD Elements 根目录，双击 EXE 即可；它不需要 Node.js，也不需要保存开发源码。需注意便携版仍可能写入 Windows 的临时目录或程序设置。

## 本地运行

需要 Node.js 22（或兼容版本）。

```bash
npm install
npm start
```

运行核心回归测试：

```bash
npm test
```

## 打包与安装

- Windows：`npm run pack:win` 生成便携 `.exe`。
- Mac：`npm run pack:mac` 生成含 `.app` 的 ZIP（当前未签名/公证，macOS 可能拦截首次运行）。
- GitHub Actions 在每次推送 `main` 后分别在 Windows/macOS 构建，并上传到该次工作流的 **Artifacts**。这是构建产物而非已发布正式安装包，必须等构建成功后下载。

Windows/Mac 客户端不要求管理员权限，但打包运行仍可能生成系统缓存、配置或解压临时文件；“便携”不代表完全不写入宿主电脑。用前请先用一个空的测试目录或备用盘验证，勿在唯一一份重要照片上首测。

## 操作

1. 将 WD Elements 连接电脑，在 SmartBackup 点 **选择硬盘**，选外置硬盘根目录（切勿误选电脑系统盘）。
2. 点 **选择来源**，选择电脑中存放照片视频的文件夹。
3. 点 **立即备份**，等待校验完成后检查相册。重新备份同一内容将跳过重复文件。
4. 在相册界面双击缩略图/单击卡片，可以通过系统默认程序打开原文件；点星标可收藏。**视频卡片当前用占位图，点击可在系统播放器打开原视频**。

## 当前限制与数据安全

- **不是整机/相册自动扫描**：当前只扫描用户明确选择的普通文件夹，暂不支持 MTP 设备直接识别、Android App 私有目录、iCloud 云端读取或 Google Photos API 直连；Google Photos Takeout 导出目录可以作为普通文件夹导入。
- 断点续传是**文件级**：已复制且校验成功的文件下次会跳过，未完成的文件会重传；不支持单一超大视频精确到字节续传。
- 复制过程会重新读取文件以校验，扫描大量照片或机械硬盘时可能较慢。最好不要同时从多个电脑运行并写入同一个硬盘（索引目前是单写者模型）。
- 相似图识别、GPS、EXIF 拍摄日期、MTP、Android 直连、失败文件详细日志面板均在后续阶段。
- 外置机械硬盘不适合手机供电时，可以继续用 Windows 电脑作中转。
- exFAT 对 Windows/macOS 兼容较好，但**不要为了软件格式化已经存储资料的硬盘**；若已有 NTFS 数据，先在 Windows 用现有文件系统进行测试。macOS 对 NTFS 通常只读。
- 重要数据请维持**另外一份独立备份**，不要把单块移动硬盘当成唯一副本。

## 目录规范

```text
WD Elements/
  SmartBackup-0.1.0-Windows-x64.exe   # 打包后自行放入
  Photos/
    2026/11/IMG_001.jpg
  Videos/
    2026/11/VID_001.mp4
  .smartbackup/
    index.json
    index.json.bak
```

## 界面组件

桌面端使用独立的 `src/components.js` 组件层，统一生成 SVG 图标、概览指标、媒体卡片、合集卡片和空状态；`src/renderer.js` 负责页面状态与交互，`src/styles.css` 负责统一的明亮视觉规范。照片首页按概念稿展示照片主网格与视频分区，左侧固定资料库导航和 WD Elements 存储卡片。


## 方案 A：按顺序备份（无 NAS）
1. 手机 USB 连接 Windows，或者先用系统相册/文件管理器将照片视频复制到电脑上的临时文件夹。**不能在当前版本直接把 Windows MTP 手机当作普通来源目录**。
2. 打开 SmartBackup，选择外置硬盘。点左侧 **备份中心**，选「手机（经过电脑）」或相应来源，再选择电脑上的文件夹。
3. 点 **开始导入硬盘**。SmartBackup 按字节计算 SHA-256 去重，复制后对目标文件再次计算 SHA-256，仅验证一致才写入索引。复制过程不删除来源。
4. 点 **检查硬盘文件完整性**，重新读取、校验每一个已保存媒体文件；损坏/缺失会报告。历史记录保存在硬盘的 \`.smartbackup/history.json\`。
5. 点 **检测 Google Drive 连接**，选择已授权的 rclone remote，再点 **备份新增照片和视频**；也可打开 Google Drive 网页检查云端文件。
6. 手机和百度网盘中的原始照片不要因为云端有副本就立即清理，先在网页核对上传数量和可查看/下载情况。

重要：网页手工上传无法由 SmartBackup 确认每个文件的云端成功状态。Google Photos 旧图库导入仍应使用 Google Takeout；它与 Google Drive 作为第二份备份是两条独立流程。

> 安全优化：即使索引显示 SHA-256 已存在，重新备份时也会读取至少一份已存文件的实际内容进行校验，防止硬盘文件损坏后把新导入的原件误判为重复。这会增加硬盘读取量。

> 完整性核验会区分「SHA-256 不一致」与「备份后曾被修改」。文件被外部程序修改并在刷新时重新索引，改动警告仍会保存在 `index.integrityAlerts` 中供人工检查；目前不会自动修复。
