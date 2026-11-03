'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const exifr = require('exifr');

function cleanText(value) {
  if (typeof value !== 'string') return null;
  const result = value.replace(/\0/g, '').trim();
  return result ? result.slice(0, 160) : null;
}

function parseDate(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value === 'number' || (typeof value === 'string' && /^\d{9,13}$/.test(value.trim()))) {
    const n = Number(value);
    const date = new Date(n < 100000000000 ? n * 1000 : n);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = value.trim();
  const match = text.match(/^(\d{4})[:/-](\d{2})[:/-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/);
  if (match) {
    const date = new Date(
      Number(match[1]), Number(match[2]) - 1, Number(match[3]),
      Number(match[4]), Number(match[5]), Number(match[6]),
      Number((match[7] || '0').padEnd(3, '0').slice(0, 3))
    );
    return Number.isFinite(date.getTime()) ? date : null;
  }
  const parsed = new Date(text);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

async function readTakeoutSidecar(filename) {
  const parsed = path.parse(filename);
  const candidates = [filename + '.json', path.join(parsed.dir, parsed.name + '.json')];
  for (const candidate of [...new Set(candidates)]) {
    try {
      const value = JSON.parse(await fs.readFile(candidate, 'utf8'));
      if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    } catch { /* sidecar is optional; keep the original media untouched */ }
  }
  return null;
}

function finiteCoordinate(value, min, max) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

async function readExact(handle, length, position) {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buffer, 0, length, position);
  return bytesRead === length ? buffer : null;
}

async function readBoxHeader(handle, offset, end) {
  if (end - offset < 8) return null;
  const header = await readExact(handle, 8, offset);
  if (!header) return null;
  const size32 = header.readUInt32BE(0);
  const type = header.toString('ascii', 4, 8);
  let size = size32;
  let headerSize = 8;
  if (size32 === 1) {
    const extended = await readExact(handle, 8, offset + 8);
    if (!extended) return null;
    const largeSize = extended.readBigUInt64BE(0);
    if (largeSize > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    size = Number(largeSize);
    headerSize = 16;
  } else if (size32 === 0) {
    size = end - offset;
  }
  if (!Number.isSafeInteger(size) || size < headerSize || offset + size > end) return null;
  return { type, start: offset, size, headerSize, dataStart: offset + headerSize, end: offset + size };
}

async function findChildBox(handle, start, end, targetType) {
  let offset = start;
  let visited = 0;
  while (offset + 8 <= end && visited++ < 100000) {
    const box = await readBoxHeader(handle, offset, end);
    if (!box) return null;
    if (box.type === targetType) return box;
    offset = box.end;
  }
  return null;
}

async function readVideoCreationDate(filename) {
  const extension = path.extname(filename).toLowerCase();
  if (!['.mp4', '.mov', '.m4v', '.3gp'].includes(extension)) return null;
  let handle;
  try {
    handle = await fs.open(filename, 'r');
    const stat = await handle.stat();
    const moov = await findChildBox(handle, 0, stat.size, 'moov');
    if (!moov) return null;
    const mvhd = await findChildBox(handle, moov.dataStart, moov.end, 'mvhd');
    if (!mvhd) return null;
    const header = await readExact(handle, 12, mvhd.dataStart);
    if (!header) return null;
    const version = header[0];
    let quickTimeSeconds;
    if (version === 0) quickTimeSeconds = BigInt(header.readUInt32BE(4));
    else if (version === 1) quickTimeSeconds = header.readBigUInt64BE(4);
    else return null;
    // QuickTime timestamps count seconds from 1904-01-01 UTC.
    const unixSeconds = quickTimeSeconds - 2082844800n;
    if (unixSeconds <= 0n || unixSeconds > 253402300799n) return null;
    const date = new Date(Number(unixSeconds) * 1000);
    return Number.isFinite(date.getTime()) ? date : null;
  } catch {
    return null;
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}

function firstDate(...values) {
  for (const value of values) {
    const date = parseDate(value);
    if (date) return date;
  }
  return null;
}

function formatLocalDateTime(date) {
  const pad = value => String(value).padStart(2, '0');
  const millis = String(date.getMilliseconds()).padStart(3, '0');
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
    'T' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds()) + '.' + millis;
}

async function extractMetadata(filename, options = {}) {
  const kind = options.kind || 'Photos';
  const includeGps = options.includeGps === true;
  let stat = null;
  try { stat = await fs.stat(filename); } catch { /* caller reports file errors elsewhere */ }
  const mtimeMs = Number.isFinite(options.mtimeMs) ? options.mtimeMs : (stat ? stat.mtimeMs : Date.now());

  let exif = {};
  if (kind === 'Photos') {
    try {
      exif = await exifr.parse(filename, {
        // Parse ordinary TIFF/EXIF metadata; the GPS IFD remains opt-in.
        ifd0: true,
        exif: true,
        gps: includeGps,
        xmp: false,
        iptc: false,
        icc: false,
        jfif: false,
        ihdr: false
      }) || {};
    } catch { /* unsupported or malformed files fall back to file metadata */ }
  }

  const sidecar = await readTakeoutSidecar(filename);
  const exifDate = firstDate(exif.DateTimeOriginal, exif.CreateDate, exif.DateCreated, exif.ModifyDate);
  const takeoutDate = firstDate(
    sidecar && sidecar.photoTakenTime && sidecar.photoTakenTime.timestamp,
    sidecar && sidecar.creationTime && sidecar.creationTime.timestamp,
    sidecar && sidecar.photoTakenTime && sidecar.photoTakenTime.formatted
  );
  const containerDate = kind === 'Videos' ? await readVideoCreationDate(filename) : null;
  const fileDate = new Date(mtimeMs);
  const chosenDate = exifDate || takeoutDate || containerDate || (Number.isFinite(fileDate.getTime()) ? fileDate : new Date());
  const dateSource = exifDate ? 'exif' : takeoutDate ? 'takeout' : containerDate ? 'container' : 'file';

  let latitude = null;
  let longitude = null;
  if (includeGps) {
    const geoExif = sidecar && sidecar.geoDataExif || {};
    const geo = sidecar && sidecar.geoData || {};
    latitude = finiteCoordinate(exif.latitude ?? geoExif.latitude ?? geo.latitude, -90, 90);
    longitude = finiteCoordinate(exif.longitude ?? geoExif.longitude ?? geo.longitude, -180, 180);
    if (latitude === 0 && longitude === 0) {
      latitude = null;
      longitude = null;
    }
  }

  return {
    metadataVersion: 2,
    // EXIF timestamps have no timezone in the common case; preserve their wall-clock time across computers.
    dateTaken: exifDate ? formatLocalDateTime(chosenDate) : chosenDate.toISOString(),
    dateSource,
    cameraMake: cleanText(exif.Make),
    cameraModel: cleanText(exif.Model),
    lensModel: cleanText(exif.LensModel),
    deviceFolder: cleanText(sidecar && sidecar.deviceFolder && sidecar.deviceFolder.localFolderName),
    latitude,
    longitude,
    gpsAvailable: latitude !== null && longitude !== null,
    gpsIndexed: includeGps,
    width: Number.isFinite(Number(exif.ExifImageWidth || exif.ImageWidth)) ? Number(exif.ExifImageWidth || exif.ImageWidth) : null,
    height: Number.isFinite(Number(exif.ExifImageHeight || exif.ImageHeight || exif.ImageLength)) ? Number(exif.ExifImageHeight || exif.ImageLength) : null,
    orientation: Number.isFinite(Number(exif.Orientation)) ? Number(exif.Orientation) : null,
    metadataReadAt: new Date().toISOString()
  };
}

module.exports = { cleanText, parseDate, readTakeoutSidecar, readVideoCreationDate, extractMetadata };
