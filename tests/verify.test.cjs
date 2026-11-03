'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {backup,gallery,verifyArchive,readIndex}=require('../src/core.cjs');
const {readHistory,addHistory}=require('../src/history.cjs');

test('archive verification detects corruption even if size and mtime do not change',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'sb-verify-'));
 try{
  const source=path.join(root,'phone'),drive=path.join(root,'usb');
  await fs.mkdir(source);await fs.mkdir(drive);
  const image=path.join(source,'image.jpg');
  await fs.writeFile(image,'ORIGINAL-123');
  const initial=await backup({source,drive,sourceLabel:'手机（电脑中转）'});
  assert.equal(initial.copied,1);
  let audit=await verifyArchive(drive);
  assert.equal(audit.ok,1);
  assert.equal(audit.corrupt,0);
  const oldIndex=await readIndex(drive);
  assert.match(oldIndex.items[0].source,/手机/);
  const stored=path.join(drive,oldIndex.items[0].relativePath);  const oldStat=await fs.stat(stored);
  await fs.writeFile(stored,'CHANGED!-123'); // exactly same length
  await fs.utimes(stored,oldStat.atime,oldStat.mtime);
  audit=await verifyArchive(drive);
  assert.equal(audit.ok,0);
  assert.equal(audit.corrupt,1);
  assert.equal(await fs.readFile(image,'utf8'),'ORIGINAL-123');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('missing backup remains visible in integrity audit after gallery refresh',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'sb-missing-'));
 try{
  const src=path.join(root,'src'),drive=path.join(root,'drive');
  await fs.mkdir(src);await fs.mkdir(drive);
  await fs.writeFile(path.join(src,'a.jpg'),'A');
  await backup({source:src,drive});
  const index=await readIndex(drive);
  await fs.unlink(path.join(drive,index.items[0].relativePath));
  await gallery(drive); // ordinary UI refresh must not erase evidence of a missing backup
  const audit=await verifyArchive(drive);
  assert.equal(audit.missing,1);
  assert.equal(audit.ok,0);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('audit identifies unindexed photos without silently writing or deleting them',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'sb-extra-'));
 try{
  const folder=path.join(root,'Photos','2026','11');
  await fs.mkdir(folder,{recursive:true});
  await fs.writeFile(path.join(folder,'other.jpg'),'UNINDEXED');
  const audit=await verifyArchive(root);
  assert.equal(audit.unindexed,1);
  assert.equal(audit.checked,0);
  assert.equal(await fs.readFile(path.join(folder,'other.jpg'),'utf8'),'UNINDEXED');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('history records are persisted on target drive with bounded audit details',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'sb-history-'));
 try {
  await addHistory(root,{type:'import',source:'手机',status:'ok',scanned:5,copied:4,duplicates:1});
  await addHistory(root,{type:'verify',source:'硬盘',status:'partial',checked:4,corrupt:1});
  const entries=await readHistory(root);
  assert.equal(entries.length,2);
  assert.equal(entries[0].type,'verify');
  assert.equal(entries[1].copied,4);
  assert.equal(entries[0].corrupt,1);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('backup does not skip a photo only because an existing damaged file kept the same mtime and size',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'sb-safe-duplicate-'));
 try{
  const source=path.join(root,'source'),drive=path.join(root,'drive');
  await fs.mkdir(source);await fs.mkdir(drive);
  await fs.writeFile(path.join(source,'portrait.jpg'),'GOOD-PHOTO');
  assert.equal((await backup({source,drive})).copied,1);
  const {items}=await readIndex(drive);
  const target=path.join(drive,items[0].relativePath);
  const old=await fs.stat(target);
  await fs.writeFile(target,'BAD!-PHOTO');
  await fs.utimes(target,old.atime,old.mtime);
  const again=await backup({source,drive});
  assert.equal(again.copied,1,JSON.stringify(again));
  assert.equal(again.duplicates,0);
  const audit=await verifyArchive(drive);
  assert.equal(audit.corrupt,1);
  assert.equal(audit.ok,1);
  assert.equal(await fs.readFile(path.join(source,'portrait.jpg'),'utf8'),'GOOD-PHOTO');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('archive root symlink aliases stay verifiable and relative paths remain portable',async(t)=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'sb-root-alias-'));
 try{
  const source=path.join(root,'source'),realDrive=path.join(root,'real-drive'),alias=path.join(root,'drive-link');
  await fs.mkdir(source);await fs.mkdir(realDrive);
  await fs.writeFile(path.join(source,'portable.jpg'),'PORTABLE-PHOTO');
  try{await fs.symlink(realDrive,alias,'dir');}catch{t.skip('symlink creation is not available on this runner');return;}
  const result=await backup({source,drive:alias});
  assert.equal(result.copied,1);
  const index=await readIndex(realDrive);
  assert.equal(index.items.length,1);
  assert.ok(index.items[0].relativePath.startsWith('Photos/'));
  assert.equal(index.items[0].relativePath.includes('\\'),false);
  const audit=await verifyArchive(alias);
  assert.equal(audit.ok,1);
  assert.equal(audit.corrupt,0);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('backup rejects a symlink that masks overlapping source and disk folders',async(t)=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'sb-alias-'));
 try{
  const drive=path.join(root,'disk'),alias=path.join(root,'link');
  await fs.mkdir(drive);
  try {await fs.symlink(drive,alias,'dir');}catch{t.skip('symlinks not supported');return;}
  await assert.rejects(()=>backup({source:alias,drive}),/不能互相包含/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('refresh retains an audit alert if a saved photo is edited after backup',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'sb-edited-'));
 try{
  const source=path.join(root,'source'),drive=path.join(root,'drive');
  await fs.mkdir(source);await fs.mkdir(drive);
  await fs.writeFile(path.join(source,'old.jpg'),'HISTORICAL');
  await backup({source,drive});
  const index=await readIndex(drive);
  await fs.writeFile(path.join(drive,index.items[0].relativePath),'MODIFIED-BY-USER');
  await gallery(drive);
  const audit=await verifyArchive(drive);
  assert.equal(audit.modified,1);
  assert.equal(audit.ok,1); // current state hashed, but prior backup did change
  assert.match(audit.errors.join(' '),/曾发生变化/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
