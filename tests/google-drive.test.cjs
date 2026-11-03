'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {backup}=require('../src/core.cjs');
const {uploadGoogleDrive,googleDriveDestination,googleDriveUploadName}=require('../src/cloud-sync.cjs');

test('Google Drive upload is incremental, preserves folder layout and never deletes the archive',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'sb-google-drive-'));
 try{
  const source=path.join(root,'phone'),drive=path.join(root,'drive');
  await fs.mkdir(source);await fs.mkdir(drive);
  const original=path.join(source,'IMG_001.jpg');
  await fs.writeFile(original,'PHOTO-ORIGINAL-BYTES');
  const imported=await backup({source,drive});
  assert.equal(imported.copied,1);  const uploads=[];
  const args={
   drive,remote:'gdrive',
   getConfiguredRemotes:async()=>['gdrive'],
   copyFile:async(src,destination,_register,options)=>{
    uploads.push({destination,options});
    assert.equal(await fs.readFile(src,'utf8'),'PHOTO-ORIGINAL-BYTES');
   }
  };
  const first=await uploadGoogleDrive(args);
  assert.equal(first.uploaded,1);
  assert.equal(first.failed,0);
  assert.ok(uploads[0].destination.startsWith('gdrive:SmartBackup/Photos/'));
  const cloudParts=uploads[0].destination.slice('gdrive:SmartBackup/'.length).split('/');
  assert.equal(cloudParts.length,4);
  assert.equal(cloudParts[0],'Photos');
  assert.equal(cloudParts[1].length,4);
  assert.ok(cloudParts[1].split('').every(ch=>ch>='0'&&ch<='9'));
  assert.equal(cloudParts[2].length,2);
  assert.ok(Number(cloudParts[2])>=1&&Number(cloudParts[2])<=12);
  assert.equal(uploads[0].options.immutable,true);
  assert.equal(await fs.readFile(original,'utf8'),'PHOTO-ORIGINAL-BYTES');
  const second=await uploadGoogleDrive(args);
  assert.equal(second.uploaded,0);
  assert.equal(second.alreadyUploaded,1);
  assert.equal(uploads.length,1);
  assert.equal(await fs.readFile(original,'utf8'),'PHOTO-ORIGINAL-BYTES');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('failed Google Drive uploads are not written to the success ledger and are retried',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'sb-google-drive-retry-'));
 try{
  const source=path.join(root,'phone'),drive=path.join(root,'drive');
  await fs.mkdir(source);await fs.mkdir(drive);
  await fs.writeFile(path.join(source,'movie.mp4'),'VIDEO-ORIGINAL-BYTES');
  await backup({source,drive});
  const first=await uploadGoogleDrive({
   drive,remote:'gdrive',getConfiguredRemotes:async()=>['gdrive'],
   copyFile:async()=>{throw new Error('network unavailable');}
  });
  assert.equal(first.uploaded,0);
  assert.equal(first.failed,1);
  const second=await uploadGoogleDrive({
   drive,remote:'gdrive',getConfiguredRemotes:async()=>['gdrive'],
   copyFile:async()=>{}
  });
  assert.equal(second.uploaded,1);
  assert.equal(second.alreadyUploaded,0);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('Google Drive destination uses a full content hash and rejects unsafe paths',()=>{
 const item={relativePath:'Photos/2026/11/IMG_001.jpg',sha256:'a'.repeat(64)};
 assert.equal(googleDriveUploadName(item),'a'.repeat(64)+'-IMG_001.jpg');
 const unicodeItem={...item,relativePath:'Photos/2026/11/我的照片.jpg'};
 assert.equal(googleDriveUploadName(unicodeItem),'a'.repeat(64)+'-我的照片.jpg');
 assert.equal(googleDriveDestination('gdrive',{...item,relativePath:'Photos/2026/11/album/IMG_001.jpg'}),'gdrive:SmartBackup/Photos/2026/11/album/'+'a'.repeat(64)+'-IMG_001.jpg');
 assert.equal(googleDriveDestination('gdrive',item),'gdrive:SmartBackup/Photos/2026/11/'+'a'.repeat(64)+'-IMG_001.jpg');
 assert.throws(()=>googleDriveDestination('gdrive',{...item,relativePath:'../secret.jpg'}),/无效/);
 assert.throws(()=>googleDriveDestination('-remote',item),/连接名称/);
});

test('Google Drive upload refuses an rclone remote that is not configured as Drive',async()=>{
 await assert.rejects(()=>uploadGoogleDrive({
  drive:process.cwd(),remote:'gphotos',getConfiguredRemotes:async()=>[]
 }),/不是 Google Drive/);
});
