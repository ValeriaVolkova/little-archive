import {mergeArchives,validateArchive,profilePhoto} from './domain.js';
import {loadImage,raster} from './media.js';
import {checkZipLimit,readZip,writeZip} from './zip.js';

export class BackupPhotoError extends Error {
  constructor(work,cause){
    super('Unreadable backup photo',{cause});
    this.workLabel=work?.title?.trim()||work?.id||'';
  }
}

export async function createBackup(state,getFile,onProgress){
  const snapshot=structuredClone(state);
  delete snapshot.revision;
  validateArchive(snapshot,{allowInvalidDates:true});
  const manifest={format:'little-archive',formatVersion:1,exportedAt:new Date().toISOString(),archive:snapshot};
  const files=[['manifest.json',new Blob([JSON.stringify(manifest)],{type:'application/json'})]];
  checkZipLimit('manifest',files[0][1].size);
  const works=new Map(snapshot.artworks.map(work=>[work.id,work]));
  const owners=new Map();
  function addPhoto(path,work){
    owners.set(path,work);
    files.push([path,async()=>{
      try{return await getFile(path);}
      catch(error){throw new BackupPhotoError(work,error);}
    }]);
  }
  for(const child of snapshot.children){
    const path=profilePhoto(child);
    if(path)addPhoto(path);
  }
  for(const image of snapshot.images){
    for(const path of [image.originalPath,image.editedPath].filter(Boolean)){
      addPhoto(path,works.get(image.artworkId));
    }
  }
  return writeZip(files,onProgress,async(path,blob)=>{
    if(!owners.has(path))return;
    try{await readablePhoto(path,blob);}
    catch(error){throw new BackupPhotoError(owners.get(path),error);}
  });
}

const imageTypes={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',heic:'image/heic',heif:'image/heif'};

async function readablePhoto(path,blob){
  const typed=blob.slice(0,blob.size,imageTypes[path.split('.').at(-1)]);
  await loadImage(typed);
  return typed;
}

export async function inspectBackup(file,onProgress=()=>{}){
  const zip=await readZip(file),manifestBlob=await zip.get('manifest.json','manifest');
  const manifest=JSON.parse(await manifestBlob.text());
  if(manifest.format!=='little-archive'||manifest.formatVersion!==1)throw Error('Unknown format');
  const incoming=validateArchive(manifest.archive,{allowInvalidDates:true}),verifiedFiles=new Map();
  for(const child of incoming.children){
    const path=profilePhoto(child);
    if(path){
      verifiedFiles.set(path,await readablePhoto(path,await zip.get(path)));
    }
  }
  let done=0;
  for(const image of incoming.images){
    for(const path of [image.originalPath,image.editedPath].filter(Boolean)){
      verifiedFiles.set(path,await readablePhoto(path,await zip.get(path)));
    }
    const display=verifiedFiles.get(image.editedPath||image.originalPath);
    verifiedFiles.set(image.originalPath+'.thumb',(await raster(display,640,0,null,image.autoEnhance===true)).blob);
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
  for(const child of incoming.children){
    const path=profilePhoto(child),old=current.children.find(c=>c.id===child.id);
    if(!path)continue;
    if(!old)puts.push([path,verifiedFiles.get(path)]);
    else if(profilePhoto(old)===path)missingOriginals.push([path,verifiedFiles.get(path)]);
  }
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
