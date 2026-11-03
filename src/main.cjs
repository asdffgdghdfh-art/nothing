'use strict';
const {app,BrowserWindow,dialog,ipcMain,protocol,net,shell}=require('electron');
const path=require('node:path');const fs=require('node:fs/promises');const {pathToFileURL}=require('node:url');const crypto=require('node:crypto');
const core=require('./core.cjs');
const cloud=require('./cloud-sync.cjs');
const history=require('./history.cjs');
const portable=require('./portable.cjs');
protocol.registerSchemesAsPrivileged([{scheme:'smartbackup-media',privileges:{secure:true,standard:true,stream:true,supportFetchAPI:true}}]);
let windowRef,drive=null,source=null,busy=false,cancel=false,sourceOrigin='local',cloudCancel=false,cloudChild=null;
let portableRuntimeRoot=null,driveWatch=null;
let tokens=new Map();
function ensureDrive(){if(!drive)throw Error('请先选择备份硬盘');return drive;}
async function refresh(){
 const folder=ensureDrive();const items=await core.gallery(folder);
 tokens=new Map();
 const rendered=items.map(item=>{const token=crypto.randomUUID();tokens.set(token,path.join(folder,item.relativePath));return {...item,mediaUrl:`smartbackup-media://file/${token}`};});
 let storage={total:0,used:0,free:0};
 try{const s=await fs.statfs(folder,{bigint:true});const total=s.blocks*s.bsize,free=s.bavail*s.bsize;storage={total:Number(total),free:Number(free),used:Number(total-free)};}catch{}
 return {items:rendered,drive:folder,source,storage,history:await history.readHistory(folder),settings:await core.readSettings(folder),device:await portable.readDeviceIdentity(folder)};
}
async function pickFolder(title){const r=await dialog.showOpenDialog(windowRef,{title,properties:['openDirectory']});return r.canceled?null:r.filePaths[0];}
function register(){
 ipcMain.handle('get-startup-state',async()=>drive?refresh():null);
 ipcMain.handle('choose-drive',async()=>{if(busy)throw Error('备份过程中无法更换硬盘');const selected=await pickFolder('选择移动硬盘的根目录');if(!selected)return null;await portable.ensureDeviceIdentity(selected);drive=selected;return refresh();});
 ipcMain.handle('set-theme',async(_event,theme)=>{ensureDrive();const settings=await core.setTheme(drive,theme);return settings.theme;});
 ipcMain.handle('choose-source',async(_event,origin='local')=>{if(busy)throw Error('备份过程中无法更换来源');const selected=await pickFolder('选择照片 / 视频来源文件夹');if(!selected)return null;source=selected;sourceOrigin=Object.hasOwn(cloud.IMPORT_SOURCES,origin)?origin:'local';return source;});
 ipcMain.handle('refresh',refresh);
 ipcMain.handle('set-gps-indexing',async(_event,enabled)=>{
   ensureDrive();
   if(busy)throw Error('请等待当前任务完成后再修改地点整理设置');
   await core.setGpsIndexing(drive,enabled===true);
   return refresh();
 });
 ipcMain.handle('backup',async()=>{
  ensureDrive();if(!source)throw Error('请先选择照片 / 视频来源');if(busy)throw Error('已经有备份任务在运行');
  busy=true;cancel=false;
  try {
    const result=await core.backup({source,drive,sourceLabel:sourceOrigin==='local'?null:cloud.sourceLabel(sourceOrigin)+' · '+path.basename(source),shouldCancel:()=>cancel,onProgress:p=>{if(windowRef&&!windowRef.isDestroyed())windowRef.webContents.send('backup-progress',p);}});
    try {
      await history.addHistory(drive,{type:'import',source:cloud.sourceLabel(sourceOrigin),status:result.cancelled?'cancelled':result.failed?'partial':'ok',...result});
    }catch(e){result.historyWarning='备份成功，但历史记录写入失败：'+e.message;}
    return result;
  } finally {busy=false;}
 });
 ipcMain.handle('cancel-backup',()=>{cancel=true;return true;});
 ipcMain.handle('verify-archive',async()=>{
   ensureDrive();if(busy)throw Error('已有任务在运行，请等待其完成');
   busy=true;cancel=false;
   try{
     const result=await core.verifyArchive(drive,{shouldCancel:()=>cancel,onProgress:p=>{
       if(windowRef&&!windowRef.isDestroyed())windowRef.webContents.send('verify-progress',p);
     }});
     try{await history.addHistory(drive,{type:'verify',source:'移动硬盘',status:cancel?'cancelled':(result.corrupt||result.missing||result.modified||result.unindexed||result.failed)?'partial':'ok',...result});}
     catch(e){result.historyWarning='核验结果未能写入历史记录：'+e.message;}
     return result;
   }finally{busy=false;}
 });
 ipcMain.handle('google-photos-remotes',()=>cloud.configuredGooglePhotosRemotes());
 ipcMain.handle('open-google-photos',()=>shell.openExternal('https://photos.google.com/'));
 ipcMain.handle('open-library-folder',async()=>{
   // Open drive root so both Photos/ and Videos/ remain discoverable for browser upload.
   const err=await shell.openPath(ensureDrive());if(err)throw Error(err);
   return true;
 });
 ipcMain.handle('google-photos-upload',async(_event,remote)=>{
   ensureDrive();if(busy)throw Error('已有备份任务在运行');
   busy=true;cloudCancel=false;
   try {
     const result=await cloud.uploadGooglePhotos({drive,remote,shouldCancel:()=>cloudCancel,registerProcess:child=>{cloudChild=child;},onProgress:p=>{
       if(windowRef&&!windowRef.isDestroyed())windowRef.webContents.send('cloud-progress',p);
     }});
     try{await history.addHistory(drive,{type:'cloud',source:'Google Photos: '+remote,status:result.cancelled?'cancelled':result.failed?'partial':'ok',uploaded:result.uploaded,failed:result.failed});}
     catch(e){result.historyWarning='云端上传记录未保存：'+e.message;}
     return result;
   }finally{busy=false;cloudChild=null;}
 });
 ipcMain.handle('google-photos-cancel',()=>{cloudCancel=true;if(cloudChild)cloudChild.kill();return true;});
 ipcMain.handle('toggle-favorite',async(_event,rel)=>core.toggleFavorite(ensureDrive(),rel));
 ipcMain.handle('open-item',async(_event,rel)=>{
  if(!core.safeRelative(rel)||!(rel.startsWith('Photos/')||rel.startsWith('Videos/')))throw Error('非法文件路径');
  const target=path.join(ensureDrive(),rel);if(!core.isWithin(drive,target))throw Error('非法文件路径');
  const err=await shell.openPath(target);if(err)throw Error(err);return true;
 });
}
// When launched from a removable volume, keep Electron's persistent profile beside the
// photo library instead of silently creating a separate profile on each computer.
portableRuntimeRoot=portable.launchVolumeRoot();
if(portableRuntimeRoot){
 const runtime=path.join(portableRuntimeRoot,'.smartbackup','runtime');
 try{app.setPath('userData',runtime);app.setPath('sessionData',path.join(runtime,'session'));}catch{}
}
async function detectDriveChange(){
 if(busy)return;
 if(drive && !(await portable.isDriveAvailable(drive))){
   drive=null;tokens.clear();
   if(windowRef&&!windowRef.isDestroyed())windowRef.webContents.send('drive-status',null);
 }
 if(!drive){
   const found=await portable.discoverManagedDrives();
   let selected=null;
   if(portableRuntimeRoot)selected=found.find(item=>path.resolve(item.root).toLowerCase()===path.resolve(portableRuntimeRoot).toLowerCase())||null;
   if(!selected && found.length===1)selected=found[0];
   if(selected){
     drive=selected.root;
     try{const result=await refresh();if(windowRef&&!windowRef.isDestroyed())windowRef.webContents.send('drive-status',result);}catch{drive=null;}
   }
 }
}
app.whenReady().then(async()=>{
 register();
 // A drive containing the app gets its identity on first launch. Older V0.4 drives
 // keep their existing Photos/, Videos/ and index.json; only a small marker is added.
 if(portableRuntimeRoot){
   try{await portable.ensureDeviceIdentity(portableRuntimeRoot);}catch{}
 }
 const found=await portable.discoverManagedDrives();
 const preferred=portableRuntimeRoot?found.find(item=>path.resolve(item.root).toLowerCase()===path.resolve(portableRuntimeRoot).toLowerCase()):null;
 const selected=preferred||(found.length===1?found[0]:null);
 if(selected)drive=selected.root;
 protocol.handle('smartbackup-media',request=>{
  const key=new URL(request.url).pathname.slice(1);const target=tokens.get(key);
  if(!target||!drive||!core.isWithin(drive,target))return new Response('Not found',{status:404});
  return net.fetch(pathToFileURL(target).toString());
 });
 windowRef=new BrowserWindow({width:1440,height:900,minWidth:800,minHeight:600,backgroundColor:'#111720',title:'SmartBackup',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
 await windowRef.loadFile(path.join(__dirname,'index.html'));
 driveWatch=setInterval(()=>detectDriveChange().catch(()=>{}),5000);
});
app.on('before-quit',()=>{if(driveWatch)clearInterval(driveWatch);});
app.on('window-all-closed',()=>{app.quit();});
