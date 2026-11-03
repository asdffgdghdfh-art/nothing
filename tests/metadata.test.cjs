'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { parseDate, readVideoCreationDate, extractMetadata } = require('../src/metadata.cjs');
const { backup, gallery, setGpsIndexing, readSettings, readIndex, saveIndex } = require('../src/core.cjs');

test('EXIF timestamps and Takeout epoch timestamps are normalized', () => {
  assert.equal(parseDate('2026:11:03 09:08:07').getFullYear(), 2026);
  assert.equal(parseDate('2026:11:03 09:08:07').getMonth(), 10);
  assert.equal(parseDate('1793696400').getTime(), 1793696400000);
  assert.equal(parseDate('not a date'), null);
});


test('real JPEG EXIF is indexed while GPS remains opt-in', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sb-real-exif-'));
  try {
    const photo = path.join(root, 'pixel.jpg');
    const jpeg = '/9j/4AAQSkZJRgABAQAAAQABAAD/4QD6RXhpZgAATU0AKgAAAAgABAEPAAIAAAAHAAAAPgEQAAIAAAAIAAAARodpAAQAAAABAAAAToglAAQAAAABAAAAjAAAAABHb29nbGUAAFBpeGVsIDgAAAKQAwACAAAAFAAAAGykNAACAAAADAAAAIAAAAAAMjAyNjoxMTowMyAxMjozNDo1NgBHb29nbGUgTGVucwAABAABAAIAAAACTgAAAAACAAUAAAADAAAAwgADAAIAAAACRQAAAAAEAAUAAAADAAAA2gAAAAAAAAAfAAAAAQAAAA0AAAABAAAAMQAAAAEAAAB5AAAAAQAAABwAAAABAAAAGQAAAAH/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD6pooooA//2Q==';
    await fs.writeFile(photo, Buffer.from(jpeg, 'base64'));

    const privateMetadata = await extractMetadata(photo, { kind: 'Photos', includeGps: false });
    assert.equal(privateMetadata.dateSource, 'exif');
    assert.equal(privateMetadata.dateTaken.slice(0, 19), '2026-11-03T12:34:56');
    assert.equal(privateMetadata.dateTaken.endsWith('Z'), false); // EXIF wall-clock time is timezone-less
    assert.equal(privateMetadata.cameraMake, 'Google');
    assert.equal(privateMetadata.cameraModel, 'Pixel 8');
    assert.equal(privateMetadata.lensModel, 'Google Lens');
    assert.equal(privateMetadata.gpsAvailable, false);
    assert.equal(privateMetadata.latitude, null);

    const gpsMetadata = await extractMetadata(photo, { kind: 'Photos', includeGps: true });
    assert.equal(gpsMetadata.gpsAvailable, true);
    assert.ok(Math.abs(gpsMetadata.latitude - 31.2302778) < 0.0001);
    assert.ok(Math.abs(gpsMetadata.longitude - 121.4736111) < 0.0001);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('Google Takeout sidecar supplies capture time and optional GPS coordinates', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sb-metadata-'));
  try {
    const photo = path.join(root, 'IMG_1001.jpg');
    await fs.writeFile(photo, 'not-a-real-jpeg');
    await fs.writeFile(photo + '.json', JSON.stringify({
      photoTakenTime: { timestamp: '1793696400' },
      geoDataExif: { latitude: 31.2304, longitude: 121.4737 },
      deviceFolder: { localFolderName: 'Camera' }
    }));
    const privateMetadata = await extractMetadata(photo, { kind: 'Photos', includeGps: false });
    assert.equal(privateMetadata.dateSource, 'takeout');
    assert.equal(privateMetadata.gpsAvailable, false);
    assert.equal(privateMetadata.latitude, null);
    assert.equal(privateMetadata.gpsIndexed, false);
    const gpsMetadata = await extractMetadata(photo, { kind: 'Photos', includeGps: true });
    assert.equal(gpsMetadata.gpsAvailable, true);
    assert.equal(gpsMetadata.latitude, 31.2304);
    assert.equal(gpsMetadata.longitude, 121.4737);
    assert.equal(gpsMetadata.deviceFolder, 'Camera');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('missing metadata falls back to file modification time without failing backup', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sb-metadata-fallback-'));
  try {
    const file = path.join(root, 'plain.mp4');
    await fs.writeFile(file, 'video');
    const expected = new Date('2024-05-06T07:08:09.000Z');
    await fs.utimes(file, expected, expected);
    const metadata = await extractMetadata(file, { kind: 'Videos', includeGps: false });
    assert.equal(metadata.dateSource, 'file');
    assert.equal(new Date(metadata.dateTaken).getTime(), expected.getTime());
    assert.equal(metadata.gpsAvailable, false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});


test('GPS indexing is opt-in, can enrich an existing Takeout import, and can be cleared', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sb-gps-settings-'));
  try {
    const source = path.join(root, 'phone');
    const drive = path.join(root, 'drive');
    await fs.mkdir(source);
    await fs.mkdir(drive);
    const photo = path.join(source, 'IMG_2001.jpg');
    await fs.writeFile(photo, 'same-photo-bytes');
    await fs.writeFile(photo + '.json', JSON.stringify({
      photoTakenTime: { timestamp: '1793696400' },
      geoData: { latitude: 31.2304, longitude: 121.4737 }
    }));

    const first = await backup({ source, drive });
    assert.equal(first.copied, 1);
    let items = await gallery(drive);
    assert.equal(items[0].metadata.dateSource, 'takeout');
    assert.equal(items[0].metadata.gpsAvailable, false);
    assert.equal((await readSettings(drive)).includeGps, false);

    await setGpsIndexing(drive, true);
    assert.equal((await readSettings(drive)).includeGps, true);
    items = await gallery(drive);
    assert.equal(items[0].metadata.dateSource, 'takeout'); // enabling GPS must not discard existing capture time
    await backup({ source, drive }); // re-import the source so its Takeout sidecar can be read after opt-in
    items = await gallery(drive);
    assert.equal(items[0].metadata.gpsAvailable, true);
    assert.equal(items[0].metadata.latitude, 31.2304);
    assert.equal(items[0].metadata.longitude, 121.4737);

    await setGpsIndexing(drive, false);
    items = await gallery(drive);
    assert.equal(items[0].metadata.gpsAvailable, false);
    assert.equal(items[0].metadata.latitude, null);
    assert.equal((await readSettings(drive)).includeGps, false);
    const currentIndex = await readIndex(drive);
    assert.equal(currentIndex.items[0].metadata.latitude, null);
    const backupIndex = JSON.parse(await fs.readFile(path.join(drive, '.smartbackup', 'index.json.bak'), 'utf8'));
    assert.equal(backupIndex.items[0].metadata.latitude, null);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});


test('GPS-disabled index writes remove coordinates from both primary and recovery copies', async () => {
  const drive = await fs.mkdtemp(path.join(os.tmpdir(), 'sb-gps-index-sanitize-'));
  try {
    const directory = path.join(drive, '.smartbackup');
    await fs.mkdir(directory);
    const indexFile = path.join(directory, 'index.json');
    const legacyIndex = {
      version: 1,
      items: [{
        relativePath: 'Photos/2026/11/private.jpg',
        metadata: { latitude: 31.2, longitude: 121.4, gpsAvailable: true, gpsIndexed: true }
      }],
      missing: [{
        relativePath: 'Videos/2026/11/private.mp4',
        metadata: { latitude: 31.3, longitude: 121.5, gpsAvailable: true, gpsIndexed: true }
      }],
      favorites: [],
      integrityAlerts: []
    };
    await fs.writeFile(indexFile, JSON.stringify(legacyIndex));
    await fs.writeFile(indexFile + '.bak', JSON.stringify(legacyIndex));

    await saveIndex(drive, legacyIndex);

    for (const filename of [indexFile, indexFile + '.bak']) {
      const saved = JSON.parse(await fs.readFile(filename, 'utf8'));
      for (const item of [...saved.items, ...saved.missing]) {
        assert.equal(item.metadata.latitude, null);
        assert.equal(item.metadata.longitude, null);
        assert.equal(item.metadata.gpsAvailable, false);
        assert.equal(item.metadata.gpsIndexed, false);
      }
    }
  } finally {
    await fs.rm(drive, { recursive: true, force: true });
  }
});


test('MP4/MOV QuickTime creation time is used before file modification time', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sb-video-date-'));
  try {
    const file = path.join(root, 'phone.mov');
    const expected = new Date('2023-08-19T14:25:36.000Z');
    const quickTimeEpoch = BigInt(Math.floor(expected.getTime() / 1000)) + 2082844800n;
    const mvhdPayload = Buffer.alloc(20);
    mvhdPayload[0] = 0; // version 0
    mvhdPayload.writeUInt32BE(Number(quickTimeEpoch), 4);

    const box = (type, payload, extended = false) => {
      const header = Buffer.alloc(extended ? 16 : 8);
      if (extended) {
        header.writeUInt32BE(1, 0);
        header.write(type, 4, 4, 'ascii');
        header.writeBigUInt64BE(BigInt(payload.length + 16), 8);
      } else {
        header.writeUInt32BE(payload.length + 8, 0);
        header.write(type, 4, 4, 'ascii');
      }
      return Buffer.concat([header, payload]);
    };

    const movie = Buffer.concat([
      box('ftyp', Buffer.alloc(8)),
      box('mdat', Buffer.alloc(256)),
      box('moov', box('mvhd', mvhdPayload), true)
    ]);
    await fs.writeFile(file, movie);
    const parsed = await readVideoCreationDate(file);
    assert.equal(parsed.getTime(), expected.getTime());

    const metadata = await extractMetadata(file, {
      kind: 'Videos',
      includeGps: false,
      mtimeMs: new Date('2025-01-01T00:00:00.000Z').getTime()
    });
    assert.equal(metadata.dateSource, 'container');
    assert.equal(metadata.dateTaken, expected.toISOString());
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('Google Takeout video timestamp takes priority over QuickTime container date', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sb-video-sidecar-'));
  try {
    const file = path.join(root, 'clip.mp4');
    const expected = new Date('2022-04-05T06:07:08.000Z');
    const quickTimeEpoch = BigInt(Math.floor(Date.UTC(2024, 0, 1) / 1000)) + 2082844800n;
    const payload = Buffer.alloc(20);
    payload.writeUInt32BE(Number(quickTimeEpoch), 4);
    const mvhd = Buffer.concat([Buffer.from([0,0,0,28]), Buffer.from('mvhd'), payload]);
    const moov = Buffer.concat([Buffer.from([0,0,0,mvhd.length + 8]), Buffer.from('moov'), mvhd]);
    await fs.writeFile(file, moov);
    await fs.writeFile(file + '.json', JSON.stringify({
      photoTakenTime: { timestamp: String(Math.floor(expected.getTime() / 1000)) }
    }));
    const metadata = await extractMetadata(file, { kind: 'Videos', includeGps: false });
    assert.equal(metadata.dateSource, 'takeout');
    assert.equal(metadata.dateTaken, expected.toISOString());
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});


test('existing version-1 library entries are reindexed with newly supported video capture dates', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sb-metadata-upgrade-'));
  try {
    const source = path.join(root, 'source');
    const drive = path.join(root, 'drive');
    await fs.mkdir(source);
    await fs.mkdir(drive);
    const video = path.join(source, 'old-clip.mov');
    const expected = new Date('2023-08-19T14:25:36.000Z');
    const fileTime = new Date('2025-01-01T00:00:00.000Z');
    const qtSeconds = BigInt(Math.floor(expected.getTime() / 1000)) + 2082844800n;
    const mvhdPayload = Buffer.alloc(20);
    mvhdPayload.writeUInt32BE(Number(qtSeconds), 4);
    const box = (type, payload) => {
      const header = Buffer.alloc(8);
      header.writeUInt32BE(payload.length + 8, 0);
      header.write(type, 4, 4, 'ascii');
      return Buffer.concat([header, payload]);
    };
    const media = Buffer.concat([
      box('ftyp', Buffer.alloc(8)),
      box('mdat', Buffer.alloc(128)),
      box('moov', box('mvhd', mvhdPayload))
    ]);
    await fs.writeFile(video, media);
    await fs.utimes(video, fileTime, fileTime);

    const first = await backup({ source, drive });
    assert.equal(first.copied, 1);
    let index = await readIndex(drive);
    assert.equal(index.items[0].metadata.dateSource, 'container');

    // Simulate an older V0.3 index created before video-container parsing existed.
    index.items[0].metadata = {
      ...index.items[0].metadata,
      metadataVersion: 1,
      dateTaken: fileTime.toISOString(),
      dateSource: 'file'
    };
    await fs.writeFile(path.join(drive, '.smartbackup', 'index.json'), JSON.stringify(index));

    const items = await gallery(drive);
    assert.equal(items[0].metadata.metadataVersion, 2);
    assert.equal(items[0].metadata.dateSource, 'container');
    assert.equal(items[0].metadata.dateTaken, expected.toISOString());

    // A richer Takeout timestamp must survive reindexing when the sidecar itself is not on the drive.
    index = await readIndex(drive);
    const takeoutDate = new Date('2022-04-05T06:07:08.000Z');
    index.items[0].metadata = {
      ...index.items[0].metadata,
      metadataVersion: 1,
      dateTaken: takeoutDate.toISOString(),
      dateSource: 'takeout'
    };
    await fs.writeFile(path.join(drive, '.smartbackup', 'index.json'), JSON.stringify(index));
    const preserved = await gallery(drive);
    assert.equal(preserved[0].metadata.dateSource, 'takeout');
    assert.equal(preserved[0].metadata.dateTaken, takeoutDate.toISOString());
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
