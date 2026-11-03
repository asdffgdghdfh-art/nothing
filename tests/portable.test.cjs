const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const portable=require('../src/portable.cjs');

test('creates a stable device identity and keeps it on the selected drive',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'smartbackup-device-'));
 try{
  const first=await portable.ensureDeviceIdentity(root);
  const second=await portable.ensureDeviceIdentity(root);
  assert.equal(first.deviceId,second.deviceId);
  assert.equal((await portable.readDeviceIdentity(root)).deviceId,first.deviceId);
  assert.equal(first.schemaVersion,1);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('discovers only drives with a valid SmartBackup identity',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'smartbackup-discover-'));
 const empty=await fs.mkdtemp(path.join(os.tmpdir(),'smartbackup-empty-'));
 try{
  await portable.ensureDeviceIdentity(root);
  const found=await portable.discoverManagedDrives({platform:'linux',roots:[empty,root]});
  assert.equal(found.length,1);
  assert.equal(found[0].root,path.resolve(root));
  assert.equal((await portable.chooseManagedDrive({platform:'linux',roots:[root,empty]})).root,path.resolve(root));
 }finally{await fs.rm(root,{recursive:true,force:true});await fs.rm(empty,{recursive:true,force:true});}
});
test('does not auto-select when multiple managed drives are mounted',async()=>{
 const a=await fs.mkdtemp(path.join(os.tmpdir(),'smartbackup-a-'));
 const b=await fs.mkdtemp(path.join(os.tmpdir(),'smartbackup-b-'));
 try{
  await portable.ensureDeviceIdentity(a);await portable.ensureDeviceIdentity(b);
  assert.equal(await portable.chooseManagedDrive({platform:'linux',roots:[a,b]}),null);
  assert.equal((await portable.chooseManagedDrive({platform:'linux',roots:[a,b],preferredRoot:b})).root,path.resolve(b));
 }finally{await fs.rm(a,{recursive:true,force:true});await fs.rm(b,{recursive:true,force:true});}
});
test('detects external launch roots without confusing the system volume',()=>{
 assert.equal(portable.launchVolumeRoot({platform:'win32',execPath:'E:\\SmartBackup.exe',home:'C:\\Users\\Li'}),'E:\\');
 assert.equal(portable.launchVolumeRoot({platform:'win32',execPath:'C:\\Users\\Li\\Downloads\\SmartBackup.exe',home:'C:\\Users\\Li'}),null);
 assert.equal(portable.launchVolumeRoot({platform:'darwin',execPath:'/Volumes/WD/SmartBackup.app/Contents/MacOS/SmartBackup'}),'/Volumes/WD');
 assert.equal(portable.launchVolumeRoot({platform:'linux',execPath:'/media/li/WD/SmartBackup'}),'/media/li/WD');
});
