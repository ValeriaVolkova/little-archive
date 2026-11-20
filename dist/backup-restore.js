import {mergeArchives,validateArchive,profilePhoto} from './domain.js';
import {loadImage,raster,UnreadableImageError} from './media.js';
import {checkZipLimit,readZip,writeZip} from './zip.js';
import {readStoredFile} from './db.js';
import {decodeImage} from './storage-codec.js';
import {validRecipe} from './crop-editor.js';

export class BackupPhotoError extends Error {
  constructor(owner,cause){
    super('Cannot export backup photo',{cause});
    this.messageKey=owner.key;
    this.label=owner.label;
  }
}

export async function createBackup(state,getFile,onProgress){
  const snapshot=structuredClone(state);
  delete snapshot.revision;
  // ZIP v1 requires a name. Identify an invalid avatar owner before the
  // general metadata check, without inventing a name in the manifest.
  if(Array.isArray(snapshot.children)){
    for(const child of snapshot.children){
      if(child&&profilePhoto(child)&&(typeof child.name!=='string'||!child.name.trim())){
        throw new BackupPhotoError({key:'backupProfileMissingName',label:child.id});
      }
    }
  }
  validateArchive(snapshot,{allowInvalidDates:true});
  const manifest={format:'little-archive',formatVersion:1,exportedAt:new Date().toISOString(),archive:snapshot};
  const files=[['manifest.json',new Blob([JSON.stringify(manifest)],{type:'application/json'})]];
  checkZipLimit('manifest',files[0][1].size);
  const works=new Map(snapshot.artworks.map(work=>[work.id,work]));
  const owners=new Map();
  function addPhoto(path,owner){
    owners.set(path,owner);
    files.push([path,async()=>{
      try{return await getFile(path);}
      catch(error){throw new BackupPhotoError(owner,error);}
    }]);
  }
  for(const child of snapshot.children){
    const path=profilePhoto(child);
    if(path)addPhoto(path,{key:'backupPhotoUnreadable',label:child.name.trim()});
  }
  for(const image of snapshot.images){
    for(const path of [image.originalPath,image.editedPath].filter(Boolean)){
      const work=works.get(image.artworkId);
      addPhoto(path,{key:'backupWorkUnreadable',label:work.title.trim()||work.id});
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
  const unchecked=new Set(zip.names);
  unchecked.delete('manifest.json');
  async function checkPhoto(path){
    const photo=await readablePhoto(path,await zip.get(path));
    verifiedFiles.set(path,photo);
    unchecked.delete(path);
  }
  for(const child of incoming.children){
    const path=profilePhoto(child);
    if(path){
      await checkPhoto(path);
    }
  }
  let done=0;
  for(const image of incoming.images){
    for(const path of [image.originalPath,image.editedPath].filter(Boolean)){
      await checkPhoto(path);
    }
    const display=verifiedFiles.get(image.editedPath||image.originalPath);
    verifiedFiles.set(image.originalPath+'.thumb',(await raster(display,640,0,null,image.autoEnhance===true)).blob);
    onProgress(++done,incoming.images.length);
  }
  // Extra v1 entries are not imported, but their checksums still matter.
  for(const path of unchecked)await zip.get(path);
  return {incoming,verifiedFiles};
}

async function localPhoto(path){
  const record=await readStoredFile(path);
  if(record===undefined)return null;
  let blob;
  try{blob=decodeImage(record);}
  catch(error){if(error instanceof TypeError)return null;throw error;}
  if(!blob.size)return null;
  try{return await readablePhoto(path,blob);}
  catch(error){
    // Unexpected I/O, module loading and resource errors abort the operation.
    if(error instanceof UnreadableImageError)return null;
    throw error;
  }
}

async function sameBytes(a,b){
  if(a===b)return true;
  if(a.size!==b.size)return false;
  const chunk=256*1024;
  for(let i=0;i<a.size;i+=chunk){
    const left=new Uint8Array(await a.slice(i,i+chunk).arrayBuffer());
    const right=new Uint8Array(await b.slice(i,i+chunk).arrayBuffer());
    if(!left.every((byte,index)=>byte===right[index]))return false;
  }
  return true;
}

function sameEdit(current,backup){
  return current.editedPath===backup.editedPath&&current.width===backup.width&&current.height===backup.height&&
    validRecipe(current.cropSettings)&&validRecipe(backup.cropSettings)&&
    ['x','y','w','h','rotation'].every(key=>current.cropSettings[key]===backup.cropSettings[key]);
}

export async function planRestore(current,incoming,verifiedFiles){
  const archive=mergeArchives(current,incoming);
  const existing=new Map(current.images.map(image=>[image.id,image]));
  const incomingById=new Map(incoming.images.map(image=>[image.id,image]));
  const puts=[],newPaths=new Set();
  let skippedEdits=0;
  function addNew(path){
    newPaths.add(path);
    puts.push([path,verifiedFiles.get(path)]);
  }
  async function repair(path){
    const local=await localPhoto(path);
    if(local)return local;
    const replacement=verifiedFiles.get(path);
    puts.push([path,replacement]);
    return replacement;
  }
  for(const child of incoming.children){
    const path=profilePhoto(child),old=current.children.find(c=>c.id===child.id);
    if(!path)continue;
    if(!old)addNew(path);
    else if(profilePhoto(old)===path)await repair(path);
  }
  for(const image of archive.images){
    const old=existing.get(image.id);
    if(!old){
      for(const path of [image.originalPath,image.editedPath,image.originalPath+'.thumb'].filter(Boolean)){
        addNew(path);
      }
      continue;
    }
    const backup=incomingById.get(image.id);
    if(backup?.artworkId===old.artworkId&&backup.originalPath===old.originalPath){
      const original=await repair(old.originalPath);
      let display=original;
      if(old.editedPath){
        display=await localPhoto(old.editedPath);
        if(!display){
          if(!sameEdit(old,backup)||!await sameBytes(original,verifiedFiles.get(old.originalPath))){
            skippedEdits++;
            continue;
          }
          display=verifiedFiles.get(old.editedPath);
          puts.push([old.editedPath,display]);
        }
      }
      const thumb=old.originalPath+'.thumb';
      if(!await localPhoto(thumb))puts.push([thumb,(await raster(display,640,0,null,old.autoEnhance===true)).blob]);
    }
  }
  const metadataChanged=['children','artworks','images','albums'].some(key=>archive[key].length!==current[key].length);
  return {archive,puts,restore:{newPaths,metadataChanged},skippedEdits};
}
