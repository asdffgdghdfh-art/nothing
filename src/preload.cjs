'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('smartbackup',{
 chooseDrive:()=>ipcRenderer.invoke('choose-drive'),
 chooseSource:origin=>ipcRenderer.invoke('choose-source',origin),
 refresh:()=>ipcRenderer.invoke('refresh'),
 backup:()=>ipcRenderer.invoke('backup'),
 cancelBackup:()=>ipcRenderer.invoke('cancel-backup'),
 verifyArchive:()=>ipcRenderer.invoke('verify-archive'),
 onVerifyProgress:fn=>{const listener=(_event,data)=>fn(data);ipcRenderer.on('verify-progress',listener);return ()=>ipcRenderer.removeListener('verify-progress',listener);},
 googleDriveRemotes:()=>ipcRenderer.invoke('google-drive-remotes'),
 openGoogleDrive:()=>ipcRenderer.invoke('open-google-drive'),
 openLibraryFolder:()=>ipcRenderer.invoke('open-library-folder'),
 uploadGoogleDrive:remote=>ipcRenderer.invoke('google-drive-upload',remote),
 cancelGoogleDrive:()=>ipcRenderer.invoke('google-drive-cancel'),
 onCloudProgress:fn=>{const listener=(_event,data)=>fn(data);ipcRenderer.on('cloud-progress',listener);return ()=>ipcRenderer.removeListener('cloud-progress',listener);},
 toggleFavorite:rel=>ipcRenderer.invoke('toggle-favorite',rel),
 openItem:rel=>ipcRenderer.invoke('open-item',rel),
 onProgress:fn=>{const listener=(_event,data)=>fn(data);ipcRenderer.on('backup-progress',listener);return ()=>ipcRenderer.removeListener('backup-progress',listener);}
});
