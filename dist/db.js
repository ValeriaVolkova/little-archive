import {encodeImage,decodeImage,encodeDraft,decodeDraft} from './storage-codec.js';
import {emptyArchive,validateArchive,normalizeCategories} from './domain.js';
let connection;
export const clientId=crypto.randomUUID();
export async function openDB(){
  if(connection)return connection;
  connection=await new Promise((resolve,reject)=>{
    const req=indexedDB.open('LittleArchive',1);
    req.onupgradeneeded=()=>{req.result.createObjectStore('metadata');req.result.createObjectStore('files');};
    req.onsuccess=()=>{req.result.onversionchange=()=>{req.result.close();connection=undefined;};resolve(req.result);};
    req.onerror=()=>reject(req.error);
    req.onblocked=()=>reject(Error('Close other Little Archive tabs and try again.'));
  }).catch(error=>{connection=undefined;throw error;});return connection;
}
export async function readArchive(){
  const db=await openDB();
  const value=await new Promise((resolve,reject)=>{
    const tx=db.transaction('metadata'),req=tx.objectStore('metadata').get('archive');
    req.onsuccess=()=>resolve(req.result);
    tx.onabort=tx.onerror=()=>reject(tx.error||req.error);
  });
  return value===undefined?emptyArchive():normalizeCategories(validateArchive(value));
}
export async function readFile(path){const db=await openDB();return new Promise((resolve,reject)=>{const req=db.transaction('files').objectStore('files').get(path);req.onsuccess=()=>{try{req.result?resolve(decodeImage(req.result)):reject(Error('Missing original image'));}catch(error){reject(error);}};req.onerror=()=>reject(req.error);});}
function findMissingFiles(db,candidates){
  if(!candidates.length)return Promise.resolve([]);
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('files'),files=tx.objectStore('files'),missing=[];
    for(const entry of candidates){
      const req=files.getKey(entry[0]);
      req.onsuccess=()=>{if(req.result===undefined)missing.push(entry);};
    }
    tx.oncomplete=()=>resolve(missing);
    tx.onabort=tx.onerror=()=>reject(tx.error||Error('Could not check backup files'));
  });
}
export async function commit(state,puts=[],deletes=[],draft=null,missingOriginals=[]){
  validateArchive(state);
  const db=await openDB();
  const encoded=[];for(const [key,blob] of puts)encoded.push([key,await encodeImage(blob)]);
  const repairs=[];
  for(const [key,blob] of await findMissingFiles(db,missingOriginals))repairs.push([key,await encodeImage(blob)]);
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(['metadata','files'],'readwrite');
    let failure;
    const revision=state.revision||0;
    const req=tx.objectStore('metadata').get('archive');
    req.onsuccess=()=>{
      if((req.result?.revision||0)!==revision){failure=Error('Archive changed in another tab. Reload before saving.');tx.abort();return;}
      if(draft){const check=tx.objectStore('metadata').get('draft:'+draft.id);check.onsuccess=()=>{if((check.result?.revision||0)!==draft.revision){failure=Error('Draft changed in another tab');tx.abort();}else tx.objectStore('metadata').delete('draft:'+draft.id);};}
      tx.objectStore('metadata').put({...state,revision:revision+1},'archive');
      const files=tx.objectStore('files');
      for(const [key,blob] of encoded)files.put(blob,key);
      for(const key of deletes)files.delete(key);
      for(const [key,blob] of repairs){
        const existing=files.getKey(key);
        existing.onsuccess=()=>{if(existing.result===undefined)files.add(blob,key);};
      }
    };
    tx.oncomplete=()=>{state.revision=revision+1;if(typeof BroadcastChannel!=='undefined'){const channel=new BroadcastChannel('little-archive');channel.postMessage({source:clientId});channel.close();}resolve();};
    tx.onabort=tx.onerror=()=>reject(failure||tx.error||Error('Storage transaction failed'));
  });
}
export async function readDrafts(){
  const db=await openDB();return new Promise((resolve,reject)=>{
    const items=[],tx=db.transaction('metadata'),req=tx.objectStore('metadata').openCursor(IDBKeyRange.bound('draft:','draft;',false,true));
    let unreadable=0;
    req.onsuccess=()=>{
      const cursor=req.result;
      if(!cursor)return;
      if(typeof cursor.key==='string'&&cursor.key.startsWith('draft:')){
        try{
          const draft=decodeDraft(cursor.value);
          if('draft:'+draft.id!==cursor.key||typeof draft.updatedAt!=='string'||!draft.work||typeof draft.work.title!=='string')throw Error('Invalid draft record');
          items.push(draft);
        }catch{unreadable++;}
      }
      cursor.continue();
    };
    tx.oncomplete=()=>resolve({items:items.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)),unreadable});
    tx.onabort=tx.onerror=()=>reject(tx.error||req.error);
  });
}
export async function saveDraft(value,revision){
  value=await encodeDraft(value);
  const db=await openDB();return new Promise((resolve,reject)=>{
    const tx=db.transaction('metadata','readwrite'),s=tx.objectStore('metadata'),key='draft:'+value.id;let failure;
    const req=s.get(key);req.onsuccess=()=>{if((req.result?.revision||0)!==revision){failure=Error('Draft changed in another tab');tx.abort();return;}s.put({...value,revision:revision+1},key);};
    tx.oncomplete=()=>resolve(revision+1);tx.onabort=tx.onerror=()=>reject(failure||tx.error||Error('Draft save failed'));
  });
}
