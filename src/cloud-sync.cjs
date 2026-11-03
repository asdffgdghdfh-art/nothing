'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const core = require('./core.cjs');

const execFileAsync = promisify(execFile);
const LEDGER_NAME = 'cloud-uploads.json';
const IMPORT_SOURCES = Object.freeze({
  local: '本地文件夹',
  phone: '手机（电脑中转）',
  baidu: '百度网盘（下载导入）',
  google_takeout: 'Google Photos（Takeout 导出）',
  custom: '自定义网盘（下载导入）'
});
const GOOGLE_PHOTOS_NOTICE = 'Google Photos API 不能自动读取完整旧图库；导入旧照片请先使用 Google Takeout，或以后通过 Picker 手动选择。';
function sourceLabel(key) { return IMPORT_SOURCES[key] || IMPORT_SOURCES.local; }
function validRemote(name) { return typeof name === 'string' && /^[A-Za-z0-9_][A-Za-z0-9_-]{0,63}$/.test(name); }
function ledgerPath(drive) { return path.join(drive, '.smartbackup', LEDGER_NAME); }
function blankLedger() { return { version: 1, uploads: {} }; }
async function readLedger(drive) {
  for (const file of [ledgerPath(drive), ledgerPath(drive) + '.bak']) {
    try {
      const value = JSON.parse(await fsp.readFile(file, 'utf8'));
      if (value.version === 1 && value.uploads && typeof value.uploads === 'object' && !Array.isArray(value.uploads)) {
        return value;
      }
    } catch { /* absent or invalid; try backup */ }
  }
  return blankLedger();
}
async function saveLedger(drive, ledger) {
  const file = ledgerPath(drive);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const temp = file + '.tmp';
  await fsp.writeFile(temp, JSON.stringify(ledger), { encoding: 'utf8', mode: 0o600 });
  try { await fsp.copyFile(file, file + '.bak'); } catch { /* first save */ }
  await fsp.rename(temp, file);
}
function uploadKey(remote, hash) { return remote + '|' + hash; }
function planUploads(index, ledger, remote) {
  if (!validRemote(remote)) throw new Error('无效的云端配置名称');
  const seen = new Set();
  const pending = []; let alreadyUploaded = 0;
  for (const item of index.items || []) {
    if (!core.safeRelative(item.relativePath) || !/^(Photos|Videos)\//.test(item.relativePath)) continue;
    if (!/^[a-f0-9]{64}$/.test(item.sha256 || '')) continue;
    if (seen.has(item.sha256)) continue;
    seen.add(item.sha256);
    if (ledger.uploads[uploadKey(remote, item.sha256)]) alreadyUploaded += 1;
    else pending.push(item);
  }
  return {pending, alreadyUploaded};
}
async function configuredGooglePhotosRemotes() {
  let names;
  try {
    const result = await execFileAsync('rclone', ['listremotes'], { timeout: 12000, maxBuffer: 1024 * 1024, windowsHide: true });
    names = result.stdout.split(/\r?\n/).map(x => x.replace(/:$/, '').trim()).filter(validRemote);
  } catch (e) {
    throw new Error(e.code === 'ENOENT' ? '未安装 rclone。请先在电脑安装 rclone 并配置 Google Photos 账号。' : '无法读取 rclone 配置，请检查 rclone 是否可运行。');
  }
  const matching = [];
  for (const name of names) {
    try {
      // The command contains secrets in stdout. Never log or return stdout; only inspect its type line in process memory.
      const {stdout} = await execFileAsync('rclone', ['config', 'show', name], { timeout: 12000, maxBuffer: 1024 * 1024, windowsHide: true });
      if (/^type\s*=\s*google photos\s*$/mi.test(stdout)) matching.push(name);
    } catch { /* ignore incompatible or inaccessible remotes */ }
  }
  return matching;
}
function remoteUploadName(item) {
  // Stable name per SHA-256; never contains an attacker-supplied folder or remote path.
  const original = path.basename(item.relativePath).replace(/[^A-Za-z0-9_.()-]/g, '_').slice(-90);
  return item.sha256.slice(0, 20) + '-' + original;
}
async function runRcloneCopy(source, destination, registerProcess = () => {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('rclone', ['copyto', '--no-traverse', source, destination], {shell:false, windowsHide:true, stdio:['ignore','ignore','pipe']});
    registerProcess(child);
    let errText = '';
    const timer = setTimeout(() => { child.kill(); }, 30 * 60 * 1000);
    child.stderr.on('data', buf => { errText = (errText + buf.toString()).slice(-4000); });
    child.once('error', err => { clearTimeout(timer); registerProcess(null); reject(new Error(err.code === 'ENOENT' ? 'rclone 未安装' : 'rclone 启动失败')); });
    child.once('close', code => {
      clearTimeout(timer);
      registerProcess(null);
      if (code === 0) resolve();
      else reject(new Error('上传命令失败（退出码 ' + code + '）' + (errText ? '：' + errText.slice(-300) : '')));
    });
  });
}
async function uploadGooglePhotos({drive,remote,onProgress=()=>{},shouldCancel=()=>false,registerProcess=()=>{},copyFile=runRcloneCopy,getConfiguredRemotes=configuredGooglePhotosRemotes}) {
  if (!validRemote(remote)) throw new Error('请选择有效的 Google Photos 连接');
  const configured = await getConfiguredRemotes();
  if (!configured.includes(remote)) throw new Error('所选 rclone 连接不是 Google Photos，请重新配置');
  drive = path.resolve(drive);
  const {index} = await core.prepareCatalog(drive);
  await core.saveIndex(drive,index);
  const ledger = await readLedger(drive);
  const {pending, alreadyUploaded} = planUploads(index,ledger,remote);
  const result = {total:pending.length,uploaded:0,alreadyUploaded,failed:0,errors:[],cancelled:false};
  for (let i = 0; i < pending.length; i++) {
    if (shouldCancel()) {result.cancelled=true;break;}
    const item = pending[i];
    try {
      const source = path.join(drive,item.relativePath);
      const actual = await fsp.realpath(source);
      if (!core.isWithin(drive,actual)) throw new Error('文件不在备份硬盘内');
      if ((await core.hashFile(actual)) !== item.sha256) throw new Error('文件内容变化，请刷新后再试');
      const destination = remote + ':upload/' + remoteUploadName(item);
      await copyFile(actual,destination,registerProcess);
      if (shouldCancel()) { result.cancelled = true; break; }
      ledger.uploads[uploadKey(remote,item.sha256)] = {date:new Date().toISOString(),relativePath:item.relativePath};
      await saveLedger(drive,ledger); // commit every successfully uploaded file, to reduce duplicate uploads after interruption
      result.uploaded++;
    } catch(e) {
      result.failed++;
      if (result.errors.length < 15) result.errors.push(path.basename(item.relativePath) + '：' + e.message);
    }
    onProgress({current:i+1,total:pending.length,...result});
  }
  return result;
}
module.exports={IMPORT_SOURCES,GOOGLE_PHOTOS_NOTICE,sourceLabel,validRemote,readLedger,saveLedger,planUploads,remoteUploadName,configuredGooglePhotosRemotes,uploadGooglePhotos};
