'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname,'../src/index.html'),'utf8');
const js = fs.readFileSync(path.join(__dirname,'../src/renderer.js'),'utf8');
const css = fs.readFileSync(path.join(__dirname,'../src/styles.css'),'utf8');
test('portable photo library has required bridge controls', () => {
  const ids=['nav','photo-section','photo-heading','photo-grid','video-section','video-heading','video-grid','collection-view','collection-heading','collection-grid','summary-strip','backup-progress-panel','progress-bar','progress-percent','progress-message','progress-state','source-label','choose-source','choose-source-top','choose-drive','connect-drive-top','backup-action','refresh','cancel','search','storage-bar','storage-used','storage-percent','storage-free','drive-label','drive-state','storage-live-dot','connection-dot','connection-label','nav-photo-count','nav-video-count','view-all-photos','view-all-videos','viewer','viewer-content','viewer-title','viewer-meta','viewer-close','viewer-open','viewer-favorite','viewer-prev','viewer-next','viewer-counter','toast','page-title','page-subtitle'];
  for(const id of ids) assert.match(html,new RegExp('id="'+id+'"'),'Missing '+id);
  assert.match(html,/renderer\.js/);
  assert.match(html,/components\.js/);
});
test('viewer and timeline are connected to actual local media', () => {
  assert.match(js,/function fillTimelineGrid\(/);
  assert.match(js,/function openViewer\(/);
  assert.match(js,/item\.mediaUrl/);
  assert.match(js,/api\.toggleFavorite\(/);
  assert.match(js,/api\.backup\(/);
  assert.match(js,/photoPage \* 240/);
  assert.match(css,/\.viewer-stage/);
  assert.match(css,/\.timeline-group/);
});
test('backup center exposes real verification, history and Google Drive backup',()=> {
 for(const id of ['sync-view','sync-pick','sync-import','sync-open-gdrive','sync-open-library','sync-verify','sync-history','sync-verify-message']) {
   assert.match(html,new RegExp('id="'+id+'"'),'Missing '+id);
 }
 assert.match(js,/api\.verifyArchive\(/);
 assert.match(js,/api\.openGoogleDrive\(/);
 assert.match(js,/api\.uploadGoogleDrive\(/);
 assert.match(js,/state\.history/);
});
test('no server dependency or remote scripts in portable shell', () => {
  assert.doesNotMatch(html,/<script[^>]+src=["']https?:/i);
  assert.match(html,/Content-Security-Policy/);
  assert.doesNotMatch(html,/immich\.app\/api/);
});
