'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {sourceLabel,validRemote,readLedger,saveLedger,planUploads,remoteUploadName,uploadGooglePhotos} = require('../src/cloud-sync.cjs');
const sha = 'a'.repeat(64);
test('source labels support phone, Baidu, Takeout and custom providers without assuming live API', () => {
 assert.match(sourceLabel('phone'),/手机/);
 assert.match(sourceLabel('baidu'),/百度网盘/);
 assert.match(sourceLabel('google_takeout'),/Takeout/);
 assert.match(sourceLabel('custom'),/自定义/);
 assert.equal(sourceLabel('unknown'),sourceLabel('local'));
});
test('rclone remote validation blocks path and argument injection', () => {
 assert.equal(validRemote('gphotos_1'),true);
 for (const x of ['../foo','gphoto:a','-x','abc def','name/dir','']) assert.equal(validRemote(x),false);
});
test('cloud upload ledger is append-only per remote and exact content hash',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sb-cloud-'));
 try{
  const ledger=await readLedger(dir);
  const index={items:[
    {relativePath:'Photos/2026/11/a.jpg',sha256:sha},
    {relativePath:'Photos/2026/11/duplicate.jpg',sha256:sha},
    {relativePath:'../secret.jpg',sha256:'b'.repeat(64)}
  ]};
  let plan=planUploads(index,ledger,'gphotos');
  assert.equal(plan.pending.length,1);
  assert.equal(plan.alreadyUploaded,0);
  ledger.uploads['gphotos|'+sha]={date:'2026-11-03'};
  await saveLedger(dir,ledger);
  const loaded=await readLedger(dir);
  plan=planUploads(index,loaded,'gphotos');
  assert.equal(plan.pending.length,0);
  assert.equal(plan.alreadyUploaded,1);
  assert.equal(planUploads(index,loaded,'other_gphotos').pending.length,1);
  assert.match(remoteUploadName(index.items[0]),/^[a-f0-9]{20}-a.jpg$/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('disk-to-cloud upload only flags successful bytes and is incremental without deleting originals',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'sb-cloud-flow-'));
 try{
  const source=path.join(root,'phone'); const drive=path.join(root,'drive');
  await fs.mkdir(source); await fs.mkdir(drive);
  const photo=path.join(source,'photo.jpg');
  await fs.writeFile(photo,'PHOTO-ORIGINAL');
  const {backup}=require('../src/core.cjs');
  const imported=await backup({source,drive});
  assert.equal(imported.copied,1);
  let uploadedPaths=[];
  const args={
   drive,remote:'gphotos',
   getConfiguredRemotes:async()=>['gphotos'],
   copyFile:async(src,dest)=>{uploadedPaths.push(dest);assert.equal(await fs.readFile(src,'utf8'),'PHOTO-ORIGINAL');}
  };
  const first=await uploadGooglePhotos(args);
  assert.equal(first.uploaded,1);
  assert.equal(first.failed,0);
  assert.match(uploadedPaths[0],/^gphotos:upload\//);
  const next=await uploadGooglePhotos(args);
  assert.equal(next.uploaded,0);
  assert.equal(next.alreadyUploaded,1);
  assert.equal(uploadedPaths.length,1);
  assert.equal(await fs.readFile(photo,'utf8'),'PHOTO-ORIGINAL');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
