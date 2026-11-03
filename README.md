# SmartBackup V0.7.0 · 跨设备便携照片库（集成开发版）

> 目标：同一块移动硬盘作为唯一照片库，在 Windows、macOS 和 Android OTG 之间共享原始照片、视频、SHA-256 去重索引、历史记录和设备身份。现有 V0.4 照片目录与索引保持兼容，不重新复制已有文件。

## V0.7.0 本轮集成范围

- **移动硬盘身份：** 首次选择硬盘时创建 `.smartbackup/device.json`，生成稳定 UUID；旧版 `Photos/`、`Videos/`、`index.json` 不迁移、不重命名。
- **Windows / macOS 自动匹配：** 桌面端扫描已挂载卷中的设备标识。只有一个已登记硬盘时自动连接；多块硬盘时优先匹配当前便携程序所在的硬盘，否则要求用户手动选择，避免选错库。
- **配置随盘：** 主题、GPS 索引设置、索引、收藏和备份历史写入硬盘的 `.smartbackup/`。从可移动卷启动桌面便携程序时，Electron 的 userData / sessionData 也指向该卷。
- **Android OTG companion：** 新增原生 Android 应用。首次使用需在系统文件选择器中选中移动硬盘根目录并授权；应用保存 SAF 持久 URI 授权，后续尝试恢复同一硬盘。
- **Android 原件备份：** 读取用户授权的 MediaStore 照片和视频，按拍摄日期归档，SHA-256 去重，复制到临时文件后校验再改为正式文件名；同步更新桌面端可识别的 V1 索引和备份历史。
- **不删除原件：** 所有平台均不自动删除手机或电脑来源文件；遇到无法安全写入或校验失败时不把文件记为成功。

## 目录结构

```text
移动硬盘/
  SmartBackup-0.7.0-Windows-x64.exe
  SmartBackup.app/
  Photos/
    2026/11/IMG_001.jpg
  Videos/
    2026/11/VID_001.mp4
  .smartbackup/
    device.json
    index.json
    index.json.bak
    settings.json
    history.json
    runtime/                 # 从此硬盘启动桌面端时的 Electron 配置
```

Android APK 需要安装到手机的应用空间，不能像 Windows EXE 一样直接从 U 盘双击运行；照片数据和索引仍保存在移动硬盘。

## 首次使用

### Windows
1. 将便携 EXE 放到移动硬盘根目录或其子文件夹。
2. 双击运行；第一次会在硬盘创建 `.smartbackup/device.json`。
3. 如果硬盘已有 V0.4 照片库，选择它的根目录即可登记身份，原文件与索引不会被清空。
4. 以后在同一台电脑或另一台电脑插入已登记硬盘，程序会尝试自动匹配。应用运行期间也会定期检测新插入的硬盘。

### macOS
1. 解压 ARM64 ZIP，将 `SmartBackup.app` 放在移动硬盘上。
2. 首次启动时授权访问硬盘；如果 macOS 安全机制阻止未签名应用，需要在系统设置中确认允许。
3. 同一硬盘可以与 Windows 共用目录和索引。当前 CI 产物针对 Apple Silicon（M 系列）构建。

### Android OTG
1. 在 Android 手机安装 SmartBackup APK。
2. 用支持数据传输的 OTG 转接头连接移动硬盘；机械硬盘可能需要带独立供电的 OTG Hub。
3. 首次打开应用，点击「连接移动硬盘」，在系统文件选择器中选中**移动硬盘根目录**，并授予读写权限。
4. 授权照片和视频读取权限，再点击「开始备份到移动硬盘」。
5. 备份完成后，在 Windows / macOS 桌面端打开同一硬盘即可浏览 Android 写入的照片库。

Android 的 USB 访问遵循 SAF 授权模型：系统不允许应用在插入 USB 时无提示地自动启动或绕过用户授权。每台新手机都需要首次授权一次；同一手机会尝试恢复持久授权。部分 Android 厂商文件选择器对外置卷根目录的支持不同，若无法选择根目录，需要更新系统组件或换用支持 USB OTG 的文件管理器/系统选择器。

## 自动匹配规则与安全边界

- 设备身份以 `.smartbackup/device.json` 中的 UUID 为准，不依赖盘符（E: / F:）或卷标。
- 桌面端自动扫描 Windows 盘符、macOS `/Volumes` 和常见 Linux 挂载目录。若发现多块已登记硬盘，不会随意选一块。
- 从移动硬盘启动时，桌面端尽可能把 Electron 用户配置和会话缓存写入该盘；系统临时目录、操作系统日志和杀毒软件扫描记录仍可能留在主机上，因此不能承诺绝对零本地痕迹。
- Android 的 SAF 授权记录由 Android 系统保存在手机本地；这是操作系统权限凭据，不是照片库数据。
- 多台设备不能同时写入同一块硬盘。请先安全弹出硬盘，再换设备使用，避免索引并发覆盖。
- 设备标识文件若存在但内容损坏，程序会停止自动重建，以免把旧照片库误认成新设备。
- 本轮 Android 版本读取系统媒体库中的照片和视频；云端网盘直连、后台自动备份、USB 插入自动启动、MTP 文件夹浏览仍不属于本轮已完成能力。
- 首次测试请使用少量照片和备用盘；重要照片至少保留另一份独立副本。

## 构建与测试

桌面端：
```bash
npm install
npm test
npm run pack:win
npm run pack:mac
```

Android：
```bash
cd android
gradle assembleDebug
```

GitHub Actions 在 Ubuntu、Windows x64、macOS ARM64 和 Android 构建 APK，并将产物上传为 14 天有效的 Actions Artifacts。构建成功后再下载测试，不把未通过构建的提交标记为可发布版本。

---

> **V0.4.0：私人照片管家基础版。** 在 V0.3 的原画备份、SHA-256 去重和完整性核验之上，新增 EXIF / Google Takeout 拍摄时间、相机型号整理，以及默认关闭、可随时清除的本地 GPS 地点分组。人物聚类仍在规划中。

# SmartBackup V0.4.0 · 私人照片管家（桌面测试版）

> **当前为无 NAS / 无服务器的离线方案 A。** 桌面端界面参考 [Immich](https://github.com/immich-app/immich) 的照片浏览体验，默认深色并可切换浅色：时间轴、照片与视频统一浏览、日期分组、全屏预览（支持前后切换、Esc 退出）、收藏、来源与本地备份状态。
>
> 本项目**不是 Immich 官方客户端或 Immich 源码移植**，界面是针对 Electron 的独立重新实现。官方 Immich 采用 SvelteKit、服务端和数据库，不能作为无服务器应用简单放入移动硬盘。参考了界面交互思路，未移植其 AGPL 源代码。只有完成的能力才会显示为可用。
>
> **数据安全：** 原有 SHA-256 严格去重、原文件复制、哈希校验、硬盘内索引依旧保留。请先使用空文件夹验证；Android 直接备份 APK 和 MTP 直读尚未实现。

## V0.4.0 已实施（桌面测试版）

- 默认深色、可切换浅色的双栏照片资料库；顶部搜索、导入入口、备份按钮、硬盘连接状态。
- 照片与视频混合时间轴：照片优先使用 EXIF / Takeout 拍摄时间；MP4、MOV、M4V、3GP 视频读取 QuickTime 容器创建时间；其他格式缺少元数据时回退到文件修改时间。
- 自动读取相机品牌 / 型号 / 镜头等 EXIF 信息，支持按拍摄设备分组。
- 地点整理默认关闭；用户主动开启后才读取 GPS，并仅将坐标写入移动硬盘的隐藏索引。关闭时会从索引移除坐标，原照片不改动、不上传。
- Google Takeout JSON sidecar 的拍摄时间与 GPS 信息可参与本地整理（GPS 仍需用户主动开启）。
- 每页最多展示 240 项并支持按需加载，避免初次打开过多图片。
- 原位全屏预览，方向键切换、Esc 关闭、系统外部打开和收藏；浏览器/系统不支持的 HEIC 或视频编码可能只显示占位图。
- 文件级增量备份、SHA-256 去重和复制后校验逻辑保持不变。
- 界面与存储能力完全离线，无需 NAS、账号、Docker、数据库或云端服务。

## 接下来尚未完成

人物本地聚类、MKV / AVI / MTS 等其他视频容器的拍摄时间、MTP / Android 直连

---

跨平台、离线优先的照片和视频备份工具。旧版说明：**V0.1 桌面版 MVP**。将打包后的 Windows 便携 EXE 或 macOS App 放在 WD Elements/移动 SSD 上，在对应电脑上运行即可；媒体和去重索引均保存到所选择的外置硬盘目录内。

 > 当前状态：桌面端文件夹备份可用；EXIF / Takeout 拍摄时间、相机型号整理已加入；GPS 地点默认关闭并可选择开启。**Android APK、Windows MTP 手机直读、Mac Android 桥接、人物聚类尚未实现**。目前可先用手机的文件传输方式将照片复制到电脑文件夹，再通过 SmartBackup 备份；Windows MTP 直接扫描是后续目标。

## 功能

- 深色 Google Photos 风格相册界面：**照片、视频、合集、收藏夹、地点、人物（规划中）、来源、存储空间**。合集优先按拍摄年月分组；地点 GPS 默认关闭。
按 EXIF / Takeout / 支持的视频容器拍摄年月归档
- SHA-256 严格去重：内容完全相同即使改名也跳过；保留无损原件，不转码压缩。
- 复制到隐藏的临时文件、校验来源和目标哈希、一致后才正式命名；任务中断不会把半截文件当成成功备份。
- 每次扫描 `Photos/` 和 `Videos/` 中实际存在的媒体；即使手工拷入硬盘也能补进索引。
- 索引放在硬盘内 `.smartbackup/index.json`，损坏时可以扫描媒体重建；切勿手动修改索引文件。硬盘上的普通媒体可直接用系统文件管理器查看。
- 本地离线运行，不上传到云端、不删除来源照片。收藏标记存放在索引中。

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

- **不是整机/相册自动扫描**：当前只扫描用户明确选择的普通文件夹，暂不支持 MTP 设备直接识别、Android App 私有目录、iCloud/Google Photos 云端内容。
- 断点续传是**文件级**：已复制且校验成功的文件下次会跳过，未完成的文件会重传；不支持单一超大视频精确到字节续传。
- 复制过程会重新读取文件以校验，扫描大量照片或机械硬盘时可能较慢。最好不要同时从多个电脑运行并写入同一个硬盘（索引目前是单写者模型）。
相似图识别、人物本地聚类、MKV / AVI / MTS 视频容器元数据、MTP
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

桌面端使用独立的 `src/components.js` 组件层，统一生成 SVG 图标、概览指标、媒体卡片、合集卡片和空状态；`src/renderer.js` 负责页面状态与交互，`src/styles.css` 负责统一的深色视觉规范。照片首页按概念稿展示照片主网格与视频分区，左侧固定资料库导航和 WD Elements 存储卡片。


## 方案 A：按顺序备份（无 NAS）
1. 手机 USB 连接 Windows，或者先用系统相册/文件管理器将照片视频复制到电脑上的临时文件夹。**不能在当前版本直接把 Windows MTP 手机当作普通来源目录**。
2. 打开 SmartBackup，选择外置硬盘。点左侧 **备份中心**，选「手机（经过电脑）」或相应来源，再选择电脑上的文件夹。
3. 点 **开始导入硬盘**。SmartBackup 按字节计算 SHA-256 去重，复制后对目标文件再次计算 SHA-256，仅验证一致才写入索引。复制过程不删除来源。
4. 点 **检查硬盘文件完整性**，重新读取、校验每一个已保存媒体文件；损坏/缺失会报告。历史记录保存在硬盘的 \`.smartbackup/history.json\`。
5. 点 **打开硬盘照片目录** 和 **打开 Google Photos 网页**，从磁盘手工选择照片/视频上传到 Google Photos。最初建议走这条路径；之后需要批量自动化再配置 rclone。
6. 手机和百度网盘中的原始照片不要因为云端有副本就立即清理，先在网页核对上传数量和可查看/下载情况。

重要：**网页手工上传无法由 SmartBackup 确认每个文件的云端成功状态**，所以不要在程序中把手动上传当作「已验证」；Google Photos 也不能通过现行 API 自动枚举全部历史照片。

> 安全优化：即使索引显示 SHA-256 已存在，重新备份时也会读取至少一份已存文件的实际内容进行校验，防止硬盘文件损坏后把新导入的原件误判为重复。这会增加硬盘读取量。

> 完整性核验会区分「SHA-256 不一致」与「备份后曾被修改」。文件被外部程序修改并在刷新时重新索引，改动警告仍会保存在 `index.integrityAlerts` 中供人工检查；目前不会自动修复。


## 深色模式
SmartBackup V0.3.1 默认采用柔和深色主题（深石墨蓝灰，不使用刺眼纯黑）。窗口顶部的太阳/月亮按钮可以随时切换浅色和深色模式，偏好保存在当前电脑的本地应用设置中；重启应用后仍然保留，不会写入移动硬盘或上传云端。


## 私人照片管家：隐私与整理规则
拍摄时间优先级：照片 EXIF → Google Takeout sidecar → MP4 / MOV / M4V / 3GP QuickTime 容器创建时间 → 文件修改时间。
Takeout Unix 时间戳、QuickTime 容器创建时间与文件修改时间则保留绝对时间。
- 拍摄设备：读取 EXIF Make / Model / LensModel；无相机 EXIF 时优先使用 Takeout 设备目录，再回退到导入来源分组。
- 地点：GPS 默认关闭。用户在「地点」页明确开启后，坐标才会被读取并保存在移动硬盘 `.smartbackup/index.json`；关闭会清除索引中的 GPS 坐标。原照片的 EXIF 不会被改写。
- 如果 Google Takeout 的 GPS 只保存在独立 JSON sidecar 中，建议先开启 GPS 整理，再选择原 Takeout 导出目录重新导入一次；关闭 GPS 时会同时清理主索引与 `.bak` 索引中的坐标。
- 人物：尚未实现。规划为可选的本地人脸聚类，默认关闭、不上传照片、不自动识别真实身份；人物名称由用户自己标注。
- SmartBackup 不会单独上传索引中的 GPS 坐标或元数据；但用户主动把原照片上传到 Google Photos 时，原文件内自带的 EXIF 仍会随原文件一起上传，因为 SmartBackup 不会改写原片。


## 本机运行测试与打包
GitHub-hosted runner 暂不可用时，可以在对应系统本机完成构建。请先拉取 feature/dark-mode-v0-3 分支：

**Windows PowerShell**
```powershell
npm install
npm test
npm run pack:win
```

**macOS 终端**
```bash
npm install
npm test
npm run pack:mac
```

打包产物位于项目 dist/ 目录。Windows 和 macOS 请分别在对应系统上构建；首次安装依赖需要网络。当前版本未配置代码签名，macOS 首次打开可能需要在系统安全设置中手动允许。
