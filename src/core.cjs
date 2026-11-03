'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { extractMetadata } = require('./metadata.cjs');
const { pipeline } = require('node:stream/promises');
const { Transform } = require('node:stream');

const PHOTOS = new Set(['.jpg','.jpeg','.png','.gif','.webp','.bmp','.tif','.tiff','.heic','.heif','.avif','.dng','.nef','.cr2','.arw']);
const VIDEOS = new Set(['.mp4','.mov','.m4v','.mkv','.avi','.webm','.3gp','.mts','.m2ts','.wmv']);
function kindOf(name) { const e=path.extname(name).toLowerCase(); return PHOTOS.has(e)?'Photos':VIDEOS.has(e)?'Videos':null; }
function isWithin(parent,child) { const rel=path.relative(path.resolve(parent),path.resolve(child)); return rel==='' || (rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel)); }
const sleep = ()=>new Promise(resolve=>setImmediate(resolve));
async function* listMedia(root) {
  const stack=[root]; let n=0;
  while(stack.length) {
    const folder=stack.pop(); let dir;
    try { dir=await fsp.opendir(folder); } catch(e) { if(folder===root) throw e; continue; }
    for await (const entry of dir) {
      if(entry.name==='.smartbackup' || entry.name.startsWith('.smartbackup-part-')) continue;
      const full=path.join(folder,entry.name);
      if(entry.isDirectory()) stack.push(full);
      else if(entry.isFile() && kindOf(entry.name)) {
        let stat; try { stat=await fsp.stat(full); }catch{continue;}
        if(stat.size>=0) yield {path:full,size:stat.size,mtimeMs:stat.mtimeMs,kind:kindOf(entry.name)};
      }
      if(++n%400===0) await sleep();
    }
  }
}
async function hashFile(filename) {
  const h=crypto.createHash('sha256');
  const s=fs.createReadStream(filename,{highWaterMark:1024*1024});
  for await (const chunk of s) h.update(chunk);
  return h.digest('hex');
}
function indexFile(drive) { return path.join(drive,'.smartbackup','index.json'); }
function settingsFile(drive) { return path.join(drive,'.smartbackup','settings.json'); }
async function readSettings(drive) {
  try {
    const value = JSON.parse(await fsp.readFile(settingsFile(drive), 'utf8'));
    return { version: 1, includeGps: value.version === 1 && value.includeGps === true };
  } catch { return { version: 1, includeGps: false }; }
}
async function saveSettings(drive, settings) {
  const file = settingsFile(drive);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const temp = file + '.tmp';
  await fsp.writeFile(temp, JSON.stringify({ version: 1, includeGps: settings.includeGps === true }), 'utf8');
  try { await fsp.copyFile(file, file + '.bak'); } catch { /* first save */ }
  await fsp.rename(temp, file);
}
async function setGpsIndexing(drive, enabled) {
  const settings = { version: 1, includeGps: enabled === true };
  await saveSettings(drive, settings);
  if (!settings.includeGps) {
    const index = await readIndex(drive);
    await saveIndex(drive, index);
  } else {
    const { index } = await prepareCatalog(drive);
    await saveIndex(drive, index);
  }
  return settings;
}
function blankIndex() { return {version:1,items:[],missing:[],integrityAlerts:[],favorites:[],updatedAt:null}; }
async function readIndex(drive) {
  for(const candidate of [indexFile(drive), indexFile(drive)+'.bak']) {
    try { const data=JSON.parse(await fsp.readFile(candidate,'utf8'));
      if(data.version===1 && Array.isArray(data.items)) return {...blankIndex(),...data};
    } catch { /* missing or damaged index: rebuild from actual files */ }
  }
  return blankIndex();
}
function metadataDatePriority(source) {
  return ({ file: 0, container: 1, takeout: 2, exif: 3 })[source] ?? -1;
}
function mergeMetadata(previous, incoming, includeGps) {
  if (!previous) return incoming;
  const merged = { ...previous, ...incoming };
  if (previous.dateTaken && metadataDatePriority(previous.dateSource) > metadataDatePriority(incoming.dateSource)) {
    merged.dateTaken = previous.dateTaken;
    merged.dateSource = previous.dateSource;
  }
  for (const key of ['cameraMake', 'cameraModel', 'lensModel', 'deviceFolder', 'width', 'height', 'orientation']) {
    merged[key] = incoming[key] ?? previous[key] ?? null;
  }
  if (includeGps && incoming.gpsAvailable) {
    merged.latitude = incoming.latitude;
    merged.longitude = incoming.longitude;
    merged.gpsAvailable = true;
    merged.gpsIndexed = true;
  } else if (includeGps && previous.gpsIndexed === true && previous.gpsAvailable === true) {
    merged.latitude = previous.latitude;
    merged.longitude = previous.longitude;
    merged.gpsAvailable = true;
    merged.gpsIndexed = true;
  } else {
    merged.latitude = null;
    merged.longitude = null;
    merged.gpsAvailable = false;
    merged.gpsIndexed = includeGps === true;
  }
  return merged;
}
function stripGpsMetadata(item) {
  if (!item || !item.metadata) return item;
  return {
    ...item,
    metadata: { ...item.metadata, latitude: null, longitude: null, gpsAvailable: false, gpsIndexed: false }
  };
}
async function saveIndex(drive,index) {
  const settings = await readSettings(drive);
  if (!settings.includeGps) {
    index.items = (index.items || []).map(stripGpsMetadata);
    index.missing = (index.missing || []).map(stripGpsMetadata);
  }
  const file=indexFile(drive); await fsp.mkdir(path.dirname(file),{recursive:true});
  const tmp=file+'.tmp';
  await fsp.writeFile(tmp,JSON.stringify({...index,updatedAt:new Date().toISOString()}),'utf8');
  try {await fsp.copyFile(file,file+'.bak');}catch{/* first save */}
  await fsp.rename(tmp,file);
  if (!settings.includeGps) {
    // When GPS indexing is disabled, the recovery copy must not retain coordinates either.
    try {
      await fsp.copyFile(file, file + '.bak');
    } catch {
      await fsp.unlink(file + '.bak').catch(error => {
        throw new Error('主索引已清除 GPS，但无法清理旧备份索引：' + error.message);
      });
    }
  }
}
function safeRelative(rel) {return typeof rel==='string' && rel.length>0 && !path.isAbsolute(rel) && !rel.split(/[\\/]+/).includes('..') && !rel.startsWith('.smartbackup');}
async function prepareCatalog(drive,onProgress=()=>{}) {
  const settings = await readSettings(drive);
  const index=await readIndex(drive);
  const map=new Map(index.items.filter(x=>safeRelative(x.relativePath)).map(x=>[x.relativePath,x]));
  const files=[];
  for(const kind of ['Photos','Videos']) {
    const dir=path.join(drive,kind);
    if(!fs.existsSync(dir)) continue;
    for await (const media of listMedia(dir)) files.push(media);
  }
  const updated=[]; const hashes=new Map(); let checked=0;
  const alerts=new Map((index.integrityAlerts||[]).filter(x=>x&&safeRelative(x.relativePath)).map(x=>[x.relativePath,x]));
  for(const media of files) {
    const rel=path.relative(drive,media.path).split(path.sep).join('/');
    let old=map.get(rel);
    const fileChanged = !old || old.size!==media.size || Math.abs((old.mtimeMs||0)-media.mtimeMs)>2 || !/^[a-f0-9]{64}$/.test(old.sha256||'');
    let metadata = old && old.metadata;
    const metadataNeedsRead = fileChanged || !metadata || metadata.metadataVersion !== 2 ||
      (settings.includeGps && metadata.gpsIndexed !== true) ||
      (!settings.includeGps && (metadata.gpsIndexed === true || metadata.gpsAvailable === true || metadata.latitude != null || metadata.longitude != null));
    if (metadataNeedsRead) {
      metadata = await extractMetadata(media.path, { kind: media.kind, includeGps: settings.includeGps, mtimeMs: media.mtimeMs });
    }
    if(fileChanged) {
      const priorHash=old && old.sha256;
      const newHash=await hashFile(media.path);
      if(/^[a-f0-9]{64}$/.test(priorHash||'') && priorHash!==newHash){
        if(!alerts.has(rel))alerts.set(rel,{relativePath:rel,expectedSha256:priorHash,observedSha256:newHash,detectedAt:new Date().toISOString()});
      } else if(alerts.has(rel) && alerts.get(rel).expectedSha256===newHash) alerts.delete(rel);
      if (old && old.sha256 === newHash && old.metadata && metadataNeedsRead) {
        metadata = mergeMetadata(old.metadata, metadata, settings.includeGps);
      }
      old={relativePath:rel,size:media.size,mtimeMs:media.mtimeMs,sha256:newHash,kind:media.kind,source:old?.source||'导入文件',metadata};
    } else if (metadataNeedsRead) {
      metadata = mergeMetadata(old && old.metadata, metadata, settings.includeGps);
      old={...old,metadata};
    }
    updated.push(old);
    if(!hashes.has(old.sha256))hashes.set(old.sha256,[]);
    hashes.get(old.sha256).push(rel);
    checked++;
    if(checked%25===0) onProgress({phase:'indexing',checked,total:files.length});
  }
  // Keep missing-file evidence across refreshes. Do not silently turn deletion into "backup healthy".
  const present=new Set(updated.map(x=>x.relativePath));
  const previously=[...(index.missing||[]),...index.items].filter(x=>x && safeRelative(x.relativePath) && /^(Photos|Videos)\//.test(x.relativePath));
  const missingMap=new Map(previously.filter(x=>!present.has(x.relativePath)).map(x=>[x.relativePath,x]));
  index.missing=[...missingMap.values()];
  index.integrityAlerts=[...alerts.values()];
  index.items=updated;
  return {index,hashes};
}
function uniqTarget(drive,relative) {
  const parsed=path.parse(relative); let result=path.join(drive,relative); let count=1;
  while(fs.existsSync(result)) {result=path.join(drive,parsed.dir,`${parsed.name} (${++count})${parsed.ext}`);}
  return result;
}
async function verifiedCopy(source,target,expectedHash) {
  await fsp.mkdir(path.dirname(target),{recursive:true});
  const partial=path.join(path.dirname(target),`.smartbackup-part-${crypto.randomUUID()}`);
  const hash=crypto.createHash('sha256');
  try {
    await pipeline(fs.createReadStream(source),new Transform({transform(chunk,enc,cb){hash.update(chunk);cb(null,chunk);}}),fs.createWriteStream(partial,{flags:'wx'}));
    if(hash.digest('hex')!==expectedHash) throw Error('源文件在备份过程中发生了变化，校验未通过');
    const copiedHash=await hashFile(partial);
    if(copiedHash!==expectedHash) throw Error('复制后的文件校验未通过');
    const st=await fsp.stat(source);
    await fsp.utimes(partial,st.atime,st.mtime).catch(()=>{});
    await fsp.rename(partial,target);
  } catch(e) {await fsp.unlink(partial).catch(()=>{}); throw e;}
}
async function backup({source,drive,sourceLabel=null,onProgress=()=>{},shouldCancel=()=>false}) {
  source=path.resolve(source);drive=path.resolve(drive);
  if(isWithin(source,drive)||isWithin(drive,source)) throw Error('来源文件夹和备份硬盘不能互相包含');
  const s=await fsp.stat(source), d=await fsp.stat(drive);
  if(!s.isDirectory()||!d.isDirectory()) throw Error('请选择有效的来源文件夹和目标硬盘');
  const realSource=await fsp.realpath(source), realDrive=await fsp.realpath(drive);
  if(isWithin(realSource,realDrive)||isWithin(realDrive,realSource))throw Error('来源文件夹和备份硬盘不能互相包含');
  const {index,hashes}=await prepareCatalog(drive,onProgress);
  const settings = await readSettings(drive);
  const verifiedHashes=new Map();
  const incoming=[];
  for await (const file of listMedia(source)) incoming.push(file);
  const results={scanned:incoming.length,copied:0,duplicates:0,failed:0,bytesCopied:0,errors:[],cancelled:false};
  for(let i=0;i<incoming.length;i++) {
    if(shouldCancel()) {results.cancelled=true;onProgress({phase:'cancelled',...results});break;}
    const f=incoming[i];
    try {
      const hash=await hashFile(f.path);
      // Always verify at least one real destination before treating a SHA-256 match as an intact backup.
      let validDuplicate=false;
      if(hashes.has(hash)) {
        if(verifiedHashes.has(hash))validDuplicate=verifiedHashes.get(hash);
        else {
          for(const relative of hashes.get(hash)) {
            const target=path.join(drive,relative);
            try {
              const st=await fsp.lstat(target);
              if(!st.isFile())continue;
              const actual=await fsp.realpath(target);
              if(!isWithin(realDrive,actual))continue;
              if(await hashFile(actual)===hash){validDuplicate=true;break;}
            }catch{/* try other known copies */}
          }
          verifiedHashes.set(hash,validDuplicate);
        }
      }
      if(validDuplicate) {
        results.duplicates++;
        const incomingMetadata = await extractMetadata(f.path, { kind: f.kind, includeGps: settings.includeGps, mtimeMs: f.mtimeMs });
        const existing = index.items.find(item => item.sha256 === hash);
        if (existing) existing.metadata = mergeMetadata(existing.metadata, incomingMetadata, settings.includeGps);
      } else {
        const metadata = await extractMetadata(f.path, { kind: f.kind, includeGps: settings.includeGps, mtimeMs: f.mtimeMs });
        const dt = new Date(metadata.dateTaken);
        const folderDate = Number.isFinite(dt.getTime()) ? dt : new Date(f.mtimeMs);
        const year=String(folderDate.getFullYear()); const month=String(folderDate.getMonth()+1).padStart(2,'0');
        const rel=path.join(f.kind,year,month,path.basename(f.path));
        const target=uniqTarget(drive,rel);
        await verifiedCopy(f.path,target,hash);
        const st=await fsp.stat(target);
        index.items.push({relativePath:path.relative(drive,target).split(path.sep).join('/'),size:st.size,mtimeMs:st.mtimeMs,sha256:hash,kind:f.kind,source:sourceLabel || path.basename(source),metadata});
        hashes.set(hash,[path.relative(drive,target).split(path.sep).join('/')]);verifiedHashes.set(hash,true);results.copied++;results.bytesCopied+=f.size;
        if(results.copied%10===0) await saveIndex(drive,index);
      }
    } catch(e) {results.failed++;if(results.errors.length<20)results.errors.push(`${path.basename(f.path)}：${e.message}`);}
    onProgress({phase:'copying',current:i+1,total:incoming.length,...results});
  }
  await saveIndex(drive,index);
  return results;
}
async function gallery(drive) {
  const {index}=await prepareCatalog(drive);
  await saveIndex(drive,index);
  return index.items.slice().reverse().map(x=>({relativePath:x.relativePath,kind:x.kind,size:x.size,mtimeMs:x.mtimeMs,source:x.source||'导入文件',favorite:index.favorites.includes(x.relativePath),metadata:x.metadata||null}));
}
async function verifyArchive(drive,{onProgress=()=>{},shouldCancel=()=>false}={}) {
  drive=path.resolve(drive);
  if(!(await fsp.stat(drive)).isDirectory())throw Error('硬盘目录无效');
  // Audit the persisted inventory, including prior missing files; never mutate it.
  const index=await readIndex(drive);
  const records=[...(index.items||[]),...(index.missing||[])];
  const result={checked:0,ok:0,missing:0,corrupt:0,modified:0,unindexed:0,failed:0,errors:[],cancelled:false,total:records.length};
  result.modified=(index.integrityAlerts||[]).length;
  for(const alert of (index.integrityAlerts||[]).slice(0,15)){
    if(result.errors.length<40)result.errors.push(alert.relativePath+'：备份后内容曾发生变化，请人工确认');
  }
  const listed=new Set();
  const report=(rel,reason)=>{if(result.errors.length<40)result.errors.push(rel+'：'+reason);};
  for(const item of records) {
    if(shouldCancel()){result.cancelled=true;break;}
    const rel=item.relativePath;
    if(!safeRelative(rel)||!(/^(Photos|Videos)\//.test(rel)))continue;
    if(listed.has(rel))continue;
    listed.add(rel);
    const target=path.join(drive,rel);
    try{
      const stat=await fsp.lstat(target);
      if(!stat.isFile())throw Error('不是普通媒体文件');
      const real=await fsp.realpath(target);
      if(!isWithin(drive,real))throw Error('文件指向硬盘外');
      const digest=await hashFile(real);
      if(digest!==item.sha256){result.corrupt++;report(rel,'SHA-256 不一致，请检查是否被修改');}
      else result.ok++;
    }catch(e){
      if(e.code==='ENOENT'){result.missing++;report(rel,'文件丢失');}
      else{result.failed++;report(rel,e.message);}
    }
    result.checked++;
    if(result.checked%5===0)onProgress({...result,phase:'verifying'});
  }
  if(!result.cancelled){
    for(const kind of ['Photos','Videos']){
      const folder=path.join(drive,kind);
      try {
        for await(const media of listMedia(folder)){
          if(shouldCancel()){result.cancelled=true;break;}
          const rel=path.relative(drive,media.path).split(path.sep).join('/');
          if(!listed.has(rel)){result.unindexed++;report(rel,'未收录到索引（可以刷新相册重新收录）');}
        }
      }catch(e){if(e.code!=='ENOENT'){result.failed++;report(kind,e.message);}}
      if(result.cancelled)break;
    }
  }
  onProgress({...result,phase:result.cancelled?'cancelled':'verified'});
  return result;
}
async function toggleFavorite(drive,relativePath) {
  if(!safeRelative(relativePath))throw Error('非法文件路径');
  const index=await readIndex(drive);
  if(!index.items.some(x=>x.relativePath===relativePath))throw Error('文件不在相册中');
  const s=new Set(index.favorites);
  if(s.has(relativePath))s.delete(relativePath);else s.add(relativePath);
  index.favorites=[...s];await saveIndex(drive,index);return s.has(relativePath);
}
module.exports={kindOf,isWithin,listMedia,hashFile,readIndex,saveIndex,readSettings,saveSettings,setGpsIndexing,prepareCatalog,backup,gallery,verifyArchive,toggleFavorite,safeRelative};
