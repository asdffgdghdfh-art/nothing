'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const META_DIR = '.smartbackup';
const DEVICE_FILE = 'device.json';

function markerPath(root) { return path.join(root, META_DIR, DEVICE_FILE); }
function isValidDevice(value) {
  return Boolean(value && value.schemaVersion === 1 && typeof value.deviceId === 'string' &&
    /^[0-9a-f-]{36}$/i.test(value.deviceId));
}
async function readDeviceIdentity(root) {
  try {
    const value = JSON.parse(await fsp.readFile(markerPath(root), 'utf8'));
    return isValidDevice(value) ? value : null;
  } catch { return null; }
}
async function ensureDeviceIdentity(root, options = {}) {
  root = path.resolve(root);
  const dir = path.join(root, META_DIR);
  await fsp.mkdir(dir, { recursive: true });
  const file = markerPath(root);
  try {
    const existing = JSON.parse(await fsp.readFile(file, 'utf8'));
    if (isValidDevice(existing)) return existing;
    throw new Error('移动硬盘的 device.json 已损坏；为保护原照片库，不会自动重建身份文件');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const identity = {
    schemaVersion: 1,
    deviceId: options.deviceId || crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    app: 'SmartBackup'
  };
  const temp = file + '.tmp';
  await fsp.writeFile(temp, JSON.stringify(identity, null, 2), { flag: 'wx' });
  try { await fsp.rename(temp, file); }
  catch (error) {
    await fsp.unlink(temp).catch(() => {});
    const winner = await readDeviceIdentity(root);
    if (winner) return winner;
    throw error;
  }
  return identity;
}
function launchVolumeRoot(options = {}) {
  const platform = options.platform || process.platform;
  const execPath = options.execPath || process.execPath;
  const portableDir = options.portableDir || process.env.PORTABLE_EXECUTABLE_DIR || '';
  const home = options.home || os.homedir();
  const candidate = platform === 'win32' ? path.win32.resolve(portableDir || execPath) : path.posix.resolve(portableDir || execPath);
  if (platform === 'win32') {
    const root = path.win32.parse(candidate).root;
    const homeRoot = path.win32.parse(home).root;
    return root && root.toLowerCase() !== homeRoot.toLowerCase() ? root : null;
  }
  if (platform === 'darwin') {
    const normalized = candidate.replace(/\\/g, '/');
    const match = normalized.match(/^(\/Volumes\/[^/]+)(?:\/|$)/);
    return match ? match[1] : null;
  }
  const normalized = candidate.replace(/\\/g, '/');
  const match = normalized.match(/^(\/(?:media\/[^/]+\/[^/]+|run\/media\/[^/]+\/[^/]+|mnt\/[^/]+))(?:\/|$)/);
  return match ? match[1] : null;
}
async function mountedRoots(platform = process.platform, env = process.env) {
  if (platform === 'win32') {
    return Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i) + ':\\');
  }
  const roots = [];
  if (platform === 'darwin') {
    try {
      for (const entry of await fsp.readdir('/Volumes', { withFileTypes: true })) {
        if (entry.isDirectory()) roots.push(path.join('/Volumes', entry.name));
      }
    } catch {}
    return roots;
  }
  const user = env.USER || env.LOGNAME || '';
  for (const base of ['/media/' + user, '/run/media/' + user, '/mnt', '/media', '/run/media']) {
    try {
      for (const entry of await fsp.readdir(base, { withFileTypes: true })) {
        if (entry.isDirectory()) roots.push(path.join(base, entry.name));
      }
    } catch {}
  }
  return [...new Set(roots)];
}
async function discoverManagedDrives(options = {}) {
  const platform = options.platform || process.platform;
  const roots = options.roots || await mountedRoots(platform, options.env || process.env);
  const found = [];
  for (const root of roots) {
    try {
      const stat = await fsp.stat(root);
      if (!stat.isDirectory()) continue;
      const identity = await readDeviceIdentity(root);
      if (identity) found.push({ root: path.resolve(root), identity });
    } catch {}
  }
  return found;
}
async function chooseManagedDrive(options = {}) {
  const found = await discoverManagedDrives(options);
  if (options.preferredRoot) {
    const preferred = path.resolve(options.preferredRoot);
    const match = found.find(item => item.root.toLowerCase() === preferred.toLowerCase());
    if (match) return match;
  }
  return found.length === 1 ? found[0] : null;
}
async function isDriveAvailable(root) {
  if (!root) return false;
  try { return (await fsp.stat(root)).isDirectory() && Boolean(await readDeviceIdentity(root)); }
  catch { return false; }
}
module.exports = {
  META_DIR, DEVICE_FILE, markerPath, isValidDevice, readDeviceIdentity,
  ensureDeviceIdentity, launchVolumeRoot, mountedRoots, discoverManagedDrives,
  chooseManagedDrive, isDriveAvailable
};
