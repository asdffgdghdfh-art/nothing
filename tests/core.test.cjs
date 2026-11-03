const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
const {backup,gallery,hashFile,isWithin,toggleFavorite,readSettings,setTheme}=require('../src/core.cjs');
test('incremental backup, exact duplicate under new name, collision, favorites, untouched originals',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'smartbackup-test-'));
 try{
  const src=path.join(root,'phone');const drive=path.join(root,'usb');await fs.mkdir(src);await fs.mkdir(drive);
  await fs.writeFile(path.join(src,'first.jpg'),'PHOTO-A'); await fs.writeFile(path.join(src,'copy.jpg'),'PHOTO-A'); await fs.writeFile(path.join(src,'movie.mp4'),'VIDEO-A');
  const first=await backup({source:src,drive});assert.equal(first.copied,2);assert.equal(first.duplicates,1);assert.equal(first.failed,0);
  const next=await backup({source:src,drive});assert.equal(next.copied,0);assert.equal(next.duplicates,3);
  const files=await gallery(drive);assert.equal(files.length,2);
  assert.equal(await toggleFavorite(drive,files[0].relativePath),true);
  assert.equal((await gallery(drive)).filter(f=>f.favorite).length,1);
  assert.equal(await fs.readFile(path.join(src,'first.jpg'),'utf8'),'PHOTO-A');
  const outside=path.join(root,'outside');await fs.mkdir(outside);await fs.writeFile(path.join(outside,'again.jpg'),'PHOTO-A');
  assert.equal((await backup({source:outside,drive})).duplicates,1);
  assert.equal((await gallery(drive)).length,2);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('reject nested source and drive',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'smartbackup-nest-'));
 try{await assert.rejects(()=>backup({source:root,drive:path.join(root,'a')}),/互相包含/);}finally{await fs.rm(root,{recursive:true,force:true});}
});

test('portable theme preference is stored on the drive and survives GPS setting updates',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'smartbackup-settings-'));
 try{
  assert.equal((await readSettings(root)).theme,'dark');
  await setTheme(root,'light');
  assert.equal((await readSettings(root)).theme,'light');
  const {setGpsIndexing}=require('../src/core.cjs');
  await setGpsIndexing(root,true);
  assert.equal((await readSettings(root)).theme,'light');
  assert.equal((await readSettings(root)).includeGps,true);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
