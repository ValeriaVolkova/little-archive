import {mergeArchives,validateArchive} from './domain.js';
import {loadImage,raster} from './media.js';
import {readZip,writeZip} from './zip.js';

export async function createBackup(state,getFile,onProgress){
  const snapshot=structuredClone(state);
  delete snapshot.revision;
  const manifest={format:'little-archive',formatVersion:1,exportedAt:new Date().toISOString(),archive:snapshot};
  const files=[['manifest.json',new Blob([JSON.stringify(manifest)],{type:'application/json'})]];
  for(const image of snapshot.images){
    for(const path of [image.originalPath,image.editedPath].filter(Boolean)){
      files.push([path,await getFile(path)]);
    }
  }
  return writeZip(files,onProgress);
}

const imageTypes={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',heic:'image/heic',heif:'image/heif'};

export async function inspectBackup(file,onProgress=()=>{}){
  const zip=await readZip(file),manifestBlob=await zip.get('manifest.json');
  if(manifestBlob.size>10*1024*1024)throw Error('Manifest too large');
  const manifest=JSON.parse(await manifestBlob.text());
  if(manifest.format!=='little-archive'||manifest.formatVersion!==1)throw Error('Unknown format');
  const incoming=validateArchive(manifest.archive),verifiedFiles=new Map();
  let done=0;
  for(const image of incoming.images){
    for(const path of [image.originalPath,image.editedPath].filter(Boolean)){
      const blob=await zip.get(path);
      const typed=new Blob([blob],{type:imageTypes[path.split('.').at(-1)]});
      await loadImage(typed);
      verifiedFiles.set(path,typed);
    }
    const display=verifiedFiles.get(image.editedPath||image.originalPath);
    verifiedFiles.set(image.originalPath+'.thumb',(await raster(display,640)).blob);
    onProgress(++done,incoming.images.length);
  }
  return {incoming,verifiedFiles};
}

// A verified backup may fill a missing original only for the same image,
// artwork and path. Existing metadata, album order and files take precedence.
export function planRestore(current,incoming,verifiedFiles){
  const archive=mergeArchives(current,incoming);
  const existing=new Map(current.images.map(image=>[image.id,image]));
  const incomingById=new Map(incoming.images.map(image=>[image.id,image]));
  const puts=[],missingOriginals=[];
  for(const image of archive.images){
    const old=existing.get(image.id);
    if(!old){
      for(const path of [image.originalPath,image.editedPath,image.originalPath+'.thumb'].filter(Boolean)){
        puts.push([path,verifiedFiles.get(path)]);
      }
      continue;
    }
    const backup=incomingById.get(image.id);
    if(backup?.artworkId===old.artworkId&&backup.originalPath===old.originalPath){
      missingOriginals.push([old.originalPath,verifiedFiles.get(old.originalPath)]);
    }
  }
  return {archive,puts,missingOriginals};
}
