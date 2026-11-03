'use strict';
const api = window.smartbackup;
const UI = window.SBComponents;
const $ = id => document.getElementById(id);

const state = {
  drive: null,
  source: null,
  items: [],
  storage: null,
  tab: 'photos',
  group: null,
  filter: '',
  busy: false,
  lastCopied: 0,
  duplicates: 0,
  failed: 0,
  expandedPhotos: false,
  expandedVideos: false,
  photoPage: 1,
  videoPage: 1,
  viewerItem: null,
  cloudBusy: false,
  cloudRemotes: [],
  history: [],
  verifyBusy: false,
  verifyMessage: '尚未进行完整性检查。首次检查较慢，大量照片需要读取整块硬盘。',
  cloudMessage: '需要先在电脑安装 rclone 并配置 Google Drive OAuth 授权。'
};

function formatSize(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  let n = Number(value);
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let index = 0;
  while (n >= 1024 && index < units.length - 1) { n /= 1024; index += 1; }
  return n.toFixed(index === 0 ? 0 : 1) + ' ' + units[index];
}

function toast(message) {
  const node = $('toast');
  node.textContent = message;
  node.classList.add('visible');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove('visible'), 4200);
}

function basename(path) {
  return String(path || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path || '';
}

function driveName(path) {
  if (!path) return '未连接存储设备';
  const name = basename(path);
  return (/elements/i.test(path) || /^[a-z]:$/i.test(name)) ? 'WD Elements 外置硬盘' : name;
}

function monthOf(item) {
  const date = new Date(item.mtimeMs);
  if (!Number.isFinite(date.getTime())) return '未知日期';
  return date.getFullYear() + '年' + String(date.getMonth() + 1).padStart(2, '0') + '月';
}

function visibleItems() {
  let items = state.items.slice();
  if (state.filter) {
    const query = state.filter.toLocaleLowerCase();
    items = items.filter(item => {
      const filename = basename(item.relativePath);
      return (filename + ' ' + (item.source || '') + ' ' + monthOf(item)).toLocaleLowerCase().includes(query);
    });
  }
  return items;
}

function setIcon(node, name) {
  node.replaceChildren(UI.icon(name, 20));
}

function renderMetrics() {
  const photos = state.items.filter(item => item.kind === 'Photos').length;
  const videos = state.items.filter(item => item.kind === 'Videos').length;
  const total = photos + videos;
  const connected = Boolean(state.drive);
  const data = [
    {
      icon: connected ? 'shield-check' : 'hard-drive',
      label: '备份状态',
      value: connected ? '备份就绪' : '等待连接',
      detail: connected ? '外置存储设备已连接' : '连接移动硬盘开始使用',
      tone: connected ? 'success' : ''
    },
    {
      icon: 'layers',
      label: '已收录媒体',
      value: total.toLocaleString('zh-CN'),
      detail: photos.toLocaleString('zh-CN') + ' 张照片 · ' + videos.toLocaleString('zh-CN') + ' 个视频'
    },
    {
      icon: 'file-plus',
      label: '上次新增',
      value: state.lastCopied.toLocaleString('zh-CN'),
      detail: '上次备份成功写入'
    },
    {
      icon: 'copy-check',
      label: '已跳过重复',
      value: state.duplicates.toLocaleString('zh-CN'),
      detail: 'SHA-256 内容完全一致'
    },
    {
      icon: 'hard-drive',
      label: '存储设备',
      value: connected ? driveName(state.drive) : '尚未连接',
      detail: state.storage && state.storage.total ? '总容量 ' + formatSize(state.storage.total) : '照片与索引均存储在硬盘中'
    }
  ];
  const strip = $('summary-strip');
  strip.replaceChildren();
  data.forEach(metric => strip.append(UI.createMetric(metric)));
}

function renderStorage() {
  const connected = Boolean(state.drive);
  const storage = state.storage || {};
  const total = Number(storage.total || 0);
  const used = Number(storage.used || 0);
  const free = Number(storage.free || 0);
  const percent = total > 0 ? Math.min(100, used / total * 100) : 0;

  $('drive-label').textContent = driveName(state.drive);
  $('drive-state').textContent = connected ? basename(state.drive) + ' · 已连接' : '等待连接 · 选择备份目标';
  $('storage-used').textContent = total ? formatSize(used) + ' / ' + formatSize(total) : '— / —';
  $('storage-percent').textContent = total ? percent.toFixed(1) + '%' : '—';
  $('storage-free').textContent = total ? '可用 ' + formatSize(free) : '可用空间 —';
  $('storage-bar').style.width = percent + '%';
  $('storage-live-dot').classList.toggle('is-connected', connected);
  $('connection-dot').classList.toggle('is-connected', connected);
  $('connection-label').textContent = connected ? '本地硬盘已连接' : '未连接硬盘';
  $('connect-drive-top').replaceChildren(UI.icon('hard-drive', 16), document.createTextNode(connected ? ' 更换硬盘' : ' 选择硬盘'));
  $('backup-action').disabled = state.busy;
  $('choose-drive').disabled = state.busy;
}

function renderNav() {
  const photos = state.items.filter(item => item.kind === 'Photos').length;
  const videos = state.items.filter(item => item.kind === 'Videos').length;
  $('nav-photo-count').textContent = photos > 999 ? '999+' : String(photos);
  $('nav-video-count').textContent = videos > 999 ? '999+' : String(videos);
  document.querySelectorAll('.nav-item').forEach(button => {
    button.classList.toggle('active', button.dataset.tab === state.tab);
  });
}

function renderProgressPanel() {
  const visible = (state.busy && !state.cloudBusy) || Boolean(state.source) || state.lastCopied > 0 || state.duplicates > 0;
  $('backup-progress-panel').hidden = !visible;
  $('source-label').textContent = state.source ? '备份来源：' + state.source : '尚未选择来源文件夹';
  $('cancel').hidden = !state.busy;
  $('progress-state').textContent = state.busy ? '正在处理' : (state.lastCopied || state.duplicates ? '上次任务已完成' : '等待开始');
}

function showEmpty(container, title, description, actionText, onAction, iconName) {
  container.replaceChildren(UI.createEmptyState({
    icon: iconName || 'image',
    title,
    description,
    actionText,
    onAction
  }));
}

function mediaOptions() {
  return {
    formatSize,
    monthLabel: monthOf,
    onOpen: item => openViewer(item),
    onFavorite: async item => {
      try {
        item.favorite = await api.toggleFavorite(item.relativePath);
        render();
      } catch (error) {
        toast('收藏操作失败：' + error.message);
      }
    }
  };
}

function fillMediaGrid(container, items, options) {
  const opts = options || {};
  container.replaceChildren();
  if (!items.length) {
    showEmpty(
      container,
      opts.emptyTitle || '这里还没有内容',
      opts.emptyDescription || '选择照片来源并运行一次备份，媒体文件就会出现在这里。',
      opts.actionText,
      opts.onAction,
      opts.icon || 'image'
    );
    return;
  }
  const callbacks = mediaOptions();
  items.forEach((item, index) => {
    let hero = null;
    if (opts.hero && index === 0) hero = 'wide';
    else if (opts.hero && index === 1) hero = 'wide';
    else if (opts.hero && index === 2) hero = 'tall';
    container.append(UI.createMediaCard(item, Object.assign({}, callbacks, { hero })));
  });
}


function ordered(items) {
  return items.slice().sort((a, b) => (b.mtimeMs || 0) - (a.mtimeMs || 0));
}
function dateLabel(item) {
  const d = new Date(item.mtimeMs);
  if (!Number.isFinite(d.getTime())) return '日期未知';
  return d.toLocaleDateString('zh-CN', {year:'numeric',month:'long',day:'numeric',weekday:'long'});
}
function fillTimelineGrid(container, items, options = {}) {
  container.replaceChildren();
  if (!items.length) {
    showEmpty(container, options.emptyTitle || '这里还没有照片', options.emptyDescription || '选择移动硬盘并导入照片，原文件将安全地保存到你的硬盘里。', options.actionText, options.onAction, options.icon || 'image');
    return;
  }
  const callbacks = mediaOptions();
  let prev = null;
  let count = 0;
  for (const item of ordered(items)) {
    const date = dateLabel(item);
    if (date !== prev) {
      const label = document.createElement('div');
      label.className = 'timeline-group';
      const title = document.createElement('span');
      title.textContent = date;
      const hint = document.createElement('small');
      hint.textContent = '按文件修改时间排列';
      label.append(title, hint);
      container.append(label);
      prev = date;
    }
    container.append(UI.createMediaCard(item, callbacks));
    count += 1;
  }
}

function renderPhotoAndVideoHome(items) {
  $('photo-section').hidden = false;
  $('video-section').hidden = true;
  $('collection-view').hidden = true;
  const all = ordered(items);
  const cap = state.photoPage * 240;
  $('photo-heading').replaceWith(UI.createSectionHeading({
    title: '时间轴',
    count: all.length.toLocaleString('zh-CN') + ' 项',
    icon: 'calendar',
    actionText: '',
  }));
  $('photo-section').querySelector('.section-head').id = 'photo-heading';
  fillTimelineGrid($('photo-grid'), state.drive ? all.slice(0, cap) : [], {
    emptyTitle: state.drive ? (state.filter ? '没有匹配的文件' : '你的照片库还空着') : '让照片重新回到你手中',
    emptyDescription: state.drive
      ? (state.filter ? '试试搜索其他文件名、日期或来源。' : '点击左侧「导入照片与视频」选择来源，再点击「开始备份」。文件将原样保存在移动硬盘中。')
      : '只需要连接一块移动硬盘，就能建立自己的离线照片资料库。无需注册、无需服务器，也不需要 NAS。',
    actionText: state.drive ? '选择照片来源' : '连接移动硬盘',
    onAction: state.drive ? chooseSource : chooseDrive,
    icon: 'image'
  });
  const button = $('view-all-photos');
  button.hidden = all.length <= cap || !state.drive;
  button.textContent = '加载更多 · 还剩 ' + (all.length - cap).toLocaleString('zh-CN') + ' 项';
  button.onclick = () => { state.photoPage += 1; render(); };
  $('view-all-videos').hidden = true;
}

let viewerItems = [];
function openViewer(item) {
  viewerItems = ordered(visibleItems().filter(x => state.tab === 'videos' ? x.kind === 'Videos' : (state.tab === 'favorites' ? x.favorite : x.kind === item.kind)));
  if (!viewerItems.some(x => x.relativePath === item.relativePath)) viewerItems.unshift(item);
  state.viewerItem = item;
  $('viewer').hidden = false;
  showViewerItem();
}
function closeViewer() {
  $('viewer').hidden = true;
  $('viewer-content').replaceChildren();
  state.viewerItem = null;
}
function showViewerItem() {
  const item = state.viewerItem;
  if (!item) return;
  const position = viewerItems.findIndex(x => x.relativePath === item.relativePath);
  $('viewer-title').textContent = basename(item.relativePath);
  $('viewer-meta').textContent = dateLabel(item) + ' · ' + formatSize(item.size) + ' · ' + (item.source || '本地文件');
  $('viewer-counter').textContent = (position + 1) + ' / ' + viewerItems.length;
  $('viewer-favorite').classList.toggle('is-active', !!item.favorite);
  $('viewer-favorite').setAttribute('aria-label', item.favorite ? '取消收藏' : '添加收藏');
  $('viewer-prev').disabled = position <= 0;
  $('viewer-next').disabled = position >= viewerItems.length - 1;
  const node = document.createElement(item.kind === 'Videos' ? 'video' : 'img');
  node.src = item.mediaUrl;
  if (item.kind === 'Videos') { node.controls = true; node.playsInline = true; }
  else node.alt = basename(item.relativePath);
  $('viewer-content').replaceChildren(node);
}
function moveViewer(step) {
  if (!state.viewerItem) return;
  const pos = viewerItems.findIndex(x => x.relativePath === state.viewerItem.relativePath);
  const next = viewerItems[pos + step];
  if (next) { state.viewerItem = next; showViewerItem(); }
}

function renderCollectionTab(items) {
  $('photo-section').hidden = true;
  $('video-section').hidden = true;
  $('collection-view').hidden = false;
  const grid = $('collection-grid');
  grid.replaceChildren();
  grid.className = 'collection-grid';

  if (!state.drive) {
    $('collection-heading').replaceWith(UI.createSectionHeading({
      title: state.tab === 'favorites' ? '收藏夹' : state.tab === 'albums' ? '合集' : state.tab === 'sources' ? '来源' : '地点',
      count: '',
      icon: state.tab === 'places' ? 'map-pin' : 'layers'
    }));
    $('collection-view').querySelector('.section-head').id = 'collection-heading';
    showEmpty(grid, '先连接备份硬盘', '连接 WD Elements 后，就可以浏览这块硬盘里的相册资料库。', '选择备份硬盘', chooseDrive, 'hard-drive');
    return;
  }

  if (state.tab === 'places') {
    $('collection-heading').replaceWith(UI.createSectionHeading({ title: '地点', count: '即将推出', icon: 'map-pin' }));
    $('collection-view').querySelector('.section-head').id = 'collection-heading';
    showEmpty(grid, '地点整理正在开发中', '后续版本会读取照片 EXIF / GPS 信息，将照片按拍摄地点归类。当前版本不会猜测地点，也不会修改原始照片。', '', null, 'map-pin');
    return;
  }

  if (state.tab === 'favorites') {
    const favorites = items.filter(item => item.favorite);
    $('collection-heading').replaceWith(UI.createSectionHeading({ title: '收藏夹', count: favorites.length + ' 项', icon: 'star' }));
    $('collection-view').querySelector('.section-head').id = 'collection-heading';
    grid.className = 'media-grid collection-media-grid';
    fillMediaGrid(grid, favorites, {
      emptyTitle: '还没有收藏内容',
      emptyDescription: '在照片或视频卡片上点击星标，就能把它们收进收藏夹。',
      icon: 'star'
    });
    return;
  }

  const isAlbums = state.tab === 'albums';
  const title = isAlbums ? '合集' : '来源';
  const iconName = isAlbums ? 'layers' : 'folder-down';
  const keyOf = item => isAlbums ? monthOf(item) : (item.source || '导入文件');
  if (state.group) {
    const groupItems = items.filter(item => keyOf(item) === state.group);
    $('collection-heading').replaceWith(UI.createSectionHeading({
      title: state.group,
      count: groupItems.length + ' 项',
      icon: isAlbums ? 'calendar' : 'folder',
      actionText: '返回全部' ,
      onAction: () => { state.group = null; render(); }
    }));
    $('collection-view').querySelector('.section-head').id = 'collection-heading';
    grid.className = 'media-grid collection-media-grid';
    fillMediaGrid(grid, groupItems, {
      emptyTitle: '这个合集里还没有媒体',
      emptyDescription: '返回合集列表，查看其他月份或来源。',
      icon: iconName
    });
    return;
  }

  const groups = new Map();
  items.forEach(item => {
    const key = keyOf(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  const sorted = Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0], 'zh-CN'));
  $('collection-heading').replaceWith(UI.createSectionHeading({ title, count: sorted.length + ' 个', icon: iconName }));
  $('collection-view').querySelector('.section-head').id = 'collection-heading';
  if (!sorted.length) {
    showEmpty(grid, isAlbums ? '还没有可整理的合集' : '还没有来源记录', '备份照片和视频后，SmartBackup 会自动按文件时间和来源建立合集。', '选择来源文件夹', chooseSource, iconName);
    return;
  }
  sorted.forEach(([name, groupItems]) => {
    const folder = UI.createFolderCard({
      icon: isAlbums ? 'calendar' : 'folder',
      name,
      count: groupItems.length,
      detail: groupItems.filter(item => item.kind === 'Photos').length + ' 张照片 · ' + groupItems.filter(item => item.kind === 'Videos').length + ' 个视频',
      onClick: () => { state.group = name; render(); }
    });
    grid.append(folder);
  });
}

function renderSyncView() {
  $('sync-selected-folder').textContent = state.source || '暂未选择文件夹。手机照片需要先复制到电脑。';
  $('sync-cloud-progress').textContent = state.cloudMessage;
  $('sync-pick').disabled = state.busy;
  $('sync-import').disabled = state.busy || !state.drive || !state.source;
  $('sync-refresh-gdrive').disabled = state.busy;
  $('sync-upload').disabled = state.busy || !state.drive || !$('sync-gdrive-remote').value;
  $('sync-cancel-cloud').hidden = !state.cloudBusy;
  $('sync-verify').disabled = state.busy || !state.drive;
  $('sync-open-library').disabled = !state.drive;
  $('sync-cancel-verify').hidden = !state.verifyBusy;
  $('sync-verify-message').textContent = state.verifyMessage;
  const history = $('sync-history');
  history.replaceChildren();
  if (!state.drive || state.history.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'sync-history-empty';
    empty.textContent = '尚无备份记录。每次导入、核验和自动上传完成后，会在移动硬盘内保存记录。';
    history.append(empty);
  } else {
    state.history.slice(0, 8).forEach(item => {
      const node=document.createElement('div');
      node.className='sync-history-item';
      const dt=document.createElement('time');
      const when=new Date(item.time);
      dt.textContent=Number.isFinite(when.getTime())?when.toLocaleString('zh-CN'):'未知时间';
      const summary=document.createElement('span');
      summary.textContent=item.type==='verify'
        ? '完整性核验 · 通过 '+item.checked+' 项检查中的 '+Math.max(0,item.checked-item.corrupt-item.missing-item.failed)+' 项 · 损坏 '+item.corrupt+' · 缺失 '+item.missing+' · 曾修改 '+(item.modified||0)+' · 未收录 '+item.unindexed
        : item.type==='cloud'
          ? 'Google Drive 上传 · 新增 '+item.uploaded+' · 失败 '+item.failed
          : '本地备份 · 新增 '+item.copied+' · 重复 '+item.duplicates+' · 失败 '+item.failed;
      const status=document.createElement('b');
      status.textContent=item.status==='ok'?'已完成':item.status==='cancelled'?'已取消':'需检查';
      status.className=item.status==='ok'?'history-ok':'history-warning';
      node.append(dt,summary,status);
      history.append(node);
    });
  }
}
function render() {
  renderStorage();
  renderMetrics();
  renderNav();
  renderProgressPanel();
  const items = visibleItems();
  const syncTab = state.tab === 'sync';
  $('sync-view').hidden = !syncTab;

  if (syncTab) {
    $('photo-section').hidden = true;
    $('video-section').hidden = true;
    $('collection-view').hidden = true;
    renderSyncView();
  } else if (state.tab === 'photos') {
    renderPhotoAndVideoHome(items);
  } else if (state.tab === 'videos') {
    $('photo-section').hidden = true;
    $('video-section').hidden = false;
    $('collection-view').hidden = true;
    const videos = items.filter(item => item.kind === 'Videos');
    $('video-heading').replaceWith(UI.createSectionHeading({ title: '视频', count: videos.length.toLocaleString('zh-CN') + ' 个', icon: 'video' }));
    $('video-section').querySelector('.section-head').id = 'video-heading';
    fillTimelineGrid($('video-grid'), state.drive ? ordered(videos).slice(0, state.videoPage * 240) : [], {
      emptyTitle: state.drive ? '还没有备份视频' : '先连接备份硬盘',
      emptyDescription: state.drive ? '选择包含视频的文件夹，视频备份后会出现在这里。' : '连接 WD Elements 后，就可以浏览视频资料库。',
      actionText: state.drive ? '选择视频来源' : '选择备份硬盘',
      onAction: state.drive ? chooseSource : chooseDrive,
      icon: 'video'
    });
    const more = $('view-all-videos');
    more.hidden = videos.length <= state.videoPage * 240 || !state.drive;
    more.textContent = '加载更多 · 还剩 ' + Math.max(0, videos.length - state.videoPage * 240).toLocaleString('zh-CN') + ' 项';
    more.onclick = () => { state.videoPage += 1; render(); };
  } else {
    renderCollectionTab(items);
  }
  const labels = {photos:['照片','按时间整理的照片与视频'],videos:['视频','浏览你保存的所有视频'],albums:['相册','按照月份整理你的回忆'],favorites:['收藏夹','你珍藏的每一个瞬间'],places:['地点','地图与拍摄位置功能开发中'],sources:['来源设备','查看不同导入来源'],sync:['备份中心','手机经电脑到硬盘，云端作为第二份独立备份']};
  const label = labels[state.tab] || labels.photos;
  $('page-title').textContent = label[0];
  $('page-subtitle').textContent = label[1];
}

async function chooseDrive() {
  try {
    const result = await api.chooseDrive();
    if (!result) return;
    state.drive = result.drive;
    state.source = result.source;
    state.storage = result.storage;
    state.items = result.items || [];
    state.history = result.history || [];
    state.group = null;
    state.expandedPhotos = false;
    state.expandedVideos = false;
    state.photoPage = 1;
    state.videoPage = 1;
    render();
    toast('硬盘连接成功，相册资料库已读取');
  } catch (error) {
    toast('选择硬盘失败：' + error.message);
  }
}

async function chooseSource() {
  try {
    const origin = state.tab === 'sync' ? $('sync-origin').value : 'local';
    const folder = await api.chooseSource(origin);
    if (!folder) return;
    state.source = folder;
    render();
    toast('来源文件夹已添加，可以开始备份');
  } catch (error) {
    toast('选择来源失败：' + error.message);
  }
}

async function refresh() {
  if (!state.drive) return chooseDrive();
  try {
    const result = await api.refresh();
    state.items = result.items || [];
    state.storage = result.storage;
    state.history = result.history || [];
    render();
    toast('相册已更新');
  } catch (error) {
    toast('刷新失败：' + error.message);
  }
}

async function runBackup() {
  if (!state.drive) { toast('请先选择备份硬盘'); return chooseDrive(); }
  if (!state.source) { toast('请先选择来源文件夹'); return chooseSource(); }
  if (state.busy) return;

  state.busy = true;
  $('progress-bar').style.width = '0%';
  $('progress-percent').textContent = '0%';
  $('progress-message').textContent = '正在扫描来源文件，并核对硬盘中已有的内容……';
  $('progress-state').textContent = '正在备份';
  render();

  try {
    const result = await api.backup();
    state.lastCopied = result.copied || 0;
    state.duplicates = result.duplicates || 0;
    state.failed = result.failed || 0;
    const message = '新增 ' + state.lastCopied + ' 项 · 跳过重复 ' + state.duplicates + ' 项' + (state.failed ? ' · 失败 ' + state.failed + ' 项' : '') + (result.cancelled ? ' · 已取消' : '');
    $('progress-bar').style.width = '100%';
    $('progress-percent').textContent = '100%';
    $('progress-message').textContent = message;
    $('progress-state').textContent = result.cancelled ? '已取消' : state.failed ? '部分完成' : '备份完成';
    const view = await api.refresh();
    state.items = view.items || [];
    state.storage = view.storage;
    state.history = view.history || [];
    toast(message + (result.historyWarning ? '（备份记录未保存）' : ''));
  } catch (error) {
    $('progress-state').textContent = '备份失败';
    $('progress-message').textContent = error.message;
    toast('备份失败：' + error.message);
  } finally {
    state.busy = false;
    render();
  }
}

api.onProgress(progress => {
  if (progress.phase === 'indexing') {
    $('progress-message').textContent = '正在检查硬盘已有文件：' + progress.checked + ' / ' + progress.total;
    $('progress-state').textContent = '正在建立索引';
  } else if (progress.phase === 'copying') {
    const percent = progress.total ? Math.round(progress.current / progress.total * 100) : 100;
    $('progress-bar').style.width = percent + '%';
    $('progress-percent').textContent = percent + '%';
    $('progress-message').textContent = '已检查 ' + progress.current + ' / ' + progress.total + ' · 新增 ' + progress.copied + ' · 跳过重复 ' + progress.duplicates + ' · 失败 ' + progress.failed;
    $('progress-state').textContent = '正在备份';
  } else if (progress.phase === 'cancelled') {
    $('progress-message').textContent = '已取消任务，之前成功校验的文件仍然保留。';
    $('progress-state').textContent = '已取消';
  }
});

UI.applyIcons(document);
$('viewer-close').addEventListener('click', closeViewer);
$('viewer-prev').addEventListener('click', () => moveViewer(-1));
$('viewer-next').addEventListener('click', () => moveViewer(1));
$('viewer-open').addEventListener('click', () => { if (state.viewerItem) api.openItem(state.viewerItem.relativePath).catch(e => toast(e.message)); });
$('viewer-favorite').addEventListener('click', async () => {
  const item = state.viewerItem;
  if (!item) return;
  try {
    item.favorite = await api.toggleFavorite(item.relativePath);
    const master = state.items.find(x => x.relativePath === item.relativePath);
    if (master) master.favorite = item.favorite;
    showViewerItem();
    render();
  } catch (e) { toast('收藏失败：' + e.message); }
});
async function detectGoogleDrive() {
  state.cloudMessage = '正在检查 rclone 配置……';
  renderSyncView();
  try {
    const names = await api.googleDriveRemotes();
    state.cloudRemotes = names;
    const selector = $('sync-gdrive-remote');
    selector.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '请选择 Google Drive 连接';
    selector.append(placeholder);
    names.forEach(name => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      selector.append(option);
    });
    if (names.length === 1) selector.value = names[0];
    state.cloudMessage = names.length ? '已发现 ' + names.length + ' 个 Google Drive 连接。仅会上传当前硬盘尚未记录成功的照片和视频。' : '没有发现 Google Drive 连接。请先运行 rclone config 创建类型为 Google Drive（drive 类型）的 remote。';
  } catch (e) {
    state.cloudMessage = e.message;
  }
  renderSyncView();
}
async function runGoogleDriveUpload() {
  const remote = $('sync-gdrive-remote').value;
  if (!state.drive || !remote || state.busy) return;
  state.cloudBusy = true;
  state.busy = true;
  state.cloudMessage = '正在检查文件和上传记录……';
  render();
  try {
    const result = await api.uploadGoogleDrive(remote);
    state.cloudMessage = '新增上传 ' + result.uploaded + ' 项 · 原已上传 ' + result.alreadyUploaded + ' 项 · 失败 ' + result.failed + ' 项' + (result.cancelled ? ' · 已取消' : '');
    state.history = (await api.refresh()).history || [];
    toast(state.cloudMessage);
  } catch (e) {
    state.cloudMessage = '上传失败：' + e.message;
    toast(state.cloudMessage);
  } finally {
    state.cloudBusy = false;
    state.busy = false;
    render();
  }
}
api.onCloudProgress(info => {
  state.cloudMessage = 'Google Drive：已处理 ' + info.current + ' / ' + info.total + ' · 成功 ' + info.uploaded + ' · 失败 ' + info.failed;
  if (state.tab === 'sync') $('sync-cloud-progress').textContent = state.cloudMessage;
});
async function runVerify() {
  if (!state.drive || state.busy) return;
  state.busy=true;state.verifyBusy=true;
  state.verifyMessage='正在计算每个文件的 SHA-256，不会修改照片……';
  render();
  try{
    const result=await api.verifyArchive();
    const detail=result.errors.length?'。异常示例：'+result.errors.slice(0,3).join('；'):'';
    state.verifyMessage='检查 '+result.checked+' 项 · 完整 '+result.ok+' · 损坏 '+result.corrupt+' · 缺失 '+result.missing+' · 曾修改 '+(result.modified||0)+' · 未收录 '+result.unindexed+' · 读取失败 '+result.failed+(result.cancelled?' · 已取消':'')+detail;
    state.history=(await api.refresh()).history || [];
    toast(result.corrupt || result.missing || result.modified || result.unindexed || result.failed?'发现需要处理的异常，请查看结果':'核验完成');
  }catch(e){
    state.verifyMessage='核验失败：'+e.message;
    toast(state.verifyMessage);
  }finally{state.verifyBusy=false;state.busy=false;render();}
}
api.onVerifyProgress(info=>{
  state.verifyMessage='完整性核验：已检查 '+info.checked+' / '+info.total+' · 完整 '+info.ok+' · 损坏 '+info.corrupt+' · 缺失 '+info.missing;
  if(state.tab==='sync')$('sync-verify-message').textContent=state.verifyMessage;
});
$('sync-verify').addEventListener('click',runVerify);
$('sync-cancel-verify').addEventListener('click',()=>api.cancelBackup().then(()=>toast('已请求取消核验')));
$('sync-open-gdrive').addEventListener('click',()=>api.openGoogleDrive().catch(e=>toast('打开网页失败：'+e.message)));
$('sync-open-library').addEventListener('click',()=>api.openLibraryFolder().catch(e=>toast('打开照片目录失败：'+e.message)));
$('sync-origin').addEventListener('change', () => { state.source=null;render();toast('来源类型已切换，请重新选择要导入的文件夹'); });
$('sync-pick').addEventListener('click', () => chooseSource());
$('sync-import').addEventListener('click', runBackup);
$('sync-refresh-gdrive').addEventListener('click', detectGoogleDrive);
$('sync-gdrive-remote').addEventListener('change', renderSyncView);
$('sync-upload').addEventListener('click', runGoogleDriveUpload);
$('sync-cancel-cloud').addEventListener('click', () => api.cancelGoogleDrive().then(() => toast('已请求取消云端上传')));
$('connect-drive-top').addEventListener('click', chooseDrive);
$('choose-drive').addEventListener('click', chooseDrive);
$('choose-source').addEventListener('click', chooseSource);
$('choose-source-top').addEventListener('click', () => { state.tab='sync'; state.group=null; render(); });
$('backup-action').addEventListener('click', runBackup);
$('refresh').addEventListener('click', refresh);
$('cancel').addEventListener('click', () => api.cancelBackup().then(() => toast('已请求取消，将在当前文件校验完成后停止。')));
$('search').addEventListener('input', event => {
  state.filter = event.target.value.trim();
  state.group = null;
  state.photoPage = 1;
  state.videoPage = 1;
  render();
});
document.querySelectorAll('.nav-item').forEach(button => {
  button.addEventListener('click', () => {
    state.tab = button.dataset.tab;
    state.group = null;
    state.expandedPhotos = false;
    state.expandedVideos = false;
    state.photoPage = 1;
    state.videoPage = 1;
    render();
  });
});
document.addEventListener('keydown', event => {
  if (state.viewerItem) {
    if (event.key === 'Escape') { closeViewer(); event.preventDefault(); return; }
    if (event.key === 'ArrowLeft') { moveViewer(-1); event.preventDefault(); return; }
    if (event.key === 'ArrowRight') { moveViewer(1); event.preventDefault(); return; }
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    $('search').focus();
  }
});

render();
