'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const MAX_HISTORY = 40;
function historyFile(drive) {return path.join(drive, '.smartbackup', 'history.json');}
async function readHistory(drive) {
  for(const filename of [historyFile(drive), historyFile(drive)+'.bak']) {
    try {
      const value = JSON.parse(await fs.readFile(filename,'utf8'));
      if(value.version===1 && Array.isArray(value.entries)) return value.entries.slice(0,MAX_HISTORY);
    }catch{/* missing or invalid; read fallback */}
  }
  return [];
}
async function addHistory(drive,entry) {
  const file = historyFile(drive);
  const current = await readHistory(drive);
  const clean = {
    id:randomUUID(),
    time:new Date().toISOString(),
    type:entry.type==='verify'?'verify':entry.type==='cloud'?'cloud':'import',
    status:entry.status==='cancelled'?'cancelled':entry.status==='partial'?'partial':entry.status==='failed'?'failed':'ok',
    source:String(entry.source||'').slice(0,400),
    scanned:Number(entry.scanned)||0,
    copied:Number(entry.copied)||0,
    duplicates:Number(entry.duplicates)||0,
    failed:Number(entry.failed)||0,
    checked:Number(entry.checked)||0,
    corrupt:Number(entry.corrupt)||0,
    modified:Number(entry.modified)||0,
    missing:Number(entry.missing)||0,
    unindexed:Number(entry.unindexed)||0,
    uploaded:Number(entry.uploaded)||0
  };
  const next={version:1,entries:[clean,...current].slice(0,MAX_HISTORY)};
  await fs.mkdir(path.dirname(file),{recursive:true});
  const temp = file+'.tmp';
  await fs.writeFile(temp,JSON.stringify(next),'utf8');
  try{await fs.copyFile(file,file+'.bak');}catch{/* first write */}
  await fs.rename(temp,file);
  return clean;
}
module.exports={readHistory,addHistory};
