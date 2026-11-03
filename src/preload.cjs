'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('smartbackup',{
 getStartupState:()=>ipcRenderer.invoke('get-startup-state'),
 setTheme:theme=>ipcRenderer.invoke('set-theme',theme),
 onDriveStatus:fn=>{const listener=(_event,data)=>fn(data);ipcRenderer.on('drive-status',listener);return ()=>ipcRenderer.removeListener('drive-status',listener);},
 chooseDrive:()=>ipcRenderer.invoke('choose-drive'),
 chooseSource:origin=>ipcRenderer.invoke('choose-source',origin),
 refresh:()=>ipcRenderer.invoke('refresh'),
 setGpsIndexing:enabled=>ipcRenderer.invoke('set-gps-indexing',enabled),
 backup:()=>ipcRenderer.invoke('backup'),
 cancelBackup:()=>ipcRenderer.invoke('cancel-backup'),
 verifyArchive:()=>ipcRenderer.invoke('verify-archive'),
 onVerifyProgress:fn=>{const listener=(_event,data)=>fn(data);ipcRenderer.on('verify-progress',listener);return ()=>ipcRenderer.removeListener('verify-progress',listener);},
 googlePhotosRemotes:()=>ipcRenderer.invoke('google-photos-remotes'),
 openGooglePhotos:()=>ipcRenderer.invoke('open-google-photos'),
 openLibraryFolder:()=>ipcRenderer.invoke('open-library-folder'),
 uploadGooglePhotos:remote=>ipcRenderer.invoke('google-photos-upload',remote),
 cancelGooglePhotos:()=>ipcRenderer.invoke('google-photos-cancel'),
 onCloudProgress:fn=>{const listener=(_event,data)=>fn(data);ipcRenderer.on('cloud-progress',listener);return ()=>ipcRenderer.removeListener('cloud-progress',listener);},
 toggleFavorite:rel=>ipcRenderer.invoke('toggle-favorite',rel),
 openItem:rel=>ipcRenderer.invoke('open-item',rel),
 onProgress:fn=>{const listener=(_event,data)=>fn(data);ipcRenderer.on('backup-progress',listener);return ()=>ipcRenderer.removeListener('backup-progress',listener);}
});
