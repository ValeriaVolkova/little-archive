import {encodeImage,decodeImage,encodeDraft,decodeDraft} from './storage-codec.js';
import {emptyArchive,validateArchive} from './domain.js';
let connection;
export const DB_NAME='LittleArchive';
export const DB_VERSION=1;
export const clientId=crypto.randomUUID();
export async function openDB(){
  if(connection)return connection;
  connection=await new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{req.result.createObjectStore('metadata');req.result.createObjectStore('files');};
    req.onsuccess=()=>{req.result.onversionchange=()=>{req.result.close();connection=undefined;};resolve(req.result);};
    req.onerror=()=>reject(req.error);
    req.onblocked=()=>reject(Error('Close other Little Archive tabs and try again.'));
  }).catch(error=>{connection=undefined;throw error;});return connection;
}
// Opening without a version never upgrades an existing database. Abort a
// creation immediately if enumeration is unavailable or the store disappeared.
export async function openExistingDB(factory=globalThis.indexedDB){
  if(!factory)throw new DOMException('IndexedDB is unavailable','NotSupportedError');
  if(typeof factory.databases==='function'){
    const databases=await factory.databases();
    if(!databases.some(db=>db.name===DB_NAME))return null;
  }
  return new Promise((resolve,reject)=>{
    const req=factory.open(DB_NAME);
    let missing=false,blocked=false;
    req.onupgradeneeded=()=>{
      missing=true;
      req.transaction.abort();
    };
    req.onsuccess=()=>{
      if(blocked){req.result.close();return;}
      req.result.onversionchange=()=>req.result.close();
      resolve(req.result);
    };
    req.onblocked=()=>{blocked=true;reject(new DOMException('IndexedDB is blocked','InvalidStateError'));};
    req.onerror=()=>missing?resolve(null):reject(req.error);
  });
}
export async function readArchive(){
  const db=await openExistingDB();
  if(!db)return emptyArchive();
  try{
    const value=await new Promise((resolve,reject)=>{
      const tx=db.transaction('metadata'),req=tx.objectStore('metadata').get('archive');
      tx.oncomplete=()=>resolve(req.result);
      tx.onabort=tx.onerror=()=>reject(tx.error||req.error);
    });
    return value===undefined?emptyArchive():validateArchive(value,{allowInvalidDates:true});
  }finally{db.close();}
}
export async function readFile(path){const db=await openDB();return new Promise((resolve,reject)=>{const req=db.transaction('files').objectStore('files').get(path);req.onsuccess=()=>{try{req.result?resolve(decodeImage(req.result)):reject(Error('Missing original image'));}catch(error){reject(error);}};req.onerror=()=>reject(req.error);});}
// Keep a storage read failure distinct from an absent key or a broken codec record.
export async function readStoredFile(path){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('files'),req=tx.objectStore('files').get(path);
    tx.oncomplete=()=>resolve(req.result);
    tx.onabort=()=>reject(tx.error||Error('Could not read local file'));
  });
}
export async function commit(state,puts=[],deletes=[],draft=null,restore=null){
  validateArchive(state,{allowInvalidDates:true});
  const db=await openDB();
  const encoded=[];for(const [key,blob] of puts)encoded.push([key,await encodeImage(blob)]);
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(['metadata','files'],'readwrite');
    let failure;
    const revision=state.revision||0;
    const req=tx.objectStore('metadata').get('archive');
    req.onsuccess=()=>{
      if((req.result?.revision||0)!==revision){failure=Error('Archive changed in another tab. Reload before saving.');tx.abort();return;}
      if(restore&&!restore.metadataChanged&&!encoded.length)return;
      if(draft){const check=tx.objectStore('metadata').get('draft:'+draft.id);check.onsuccess=()=>{if((check.result?.revision||0)!==draft.revision){failure=Error('Draft changed in another tab');tx.abort();}else tx.objectStore('metadata').delete('draft:'+draft.id);};}
      tx.objectStore('metadata').put({...state,revision:revision+1},'archive');
      const files=tx.objectStore('files');
      for(const [key,blob] of encoded){
        if(restore?.newPaths.has(key))files.add(blob,key);
        else files.put(blob,key);
      }
      for(const key of deletes)files.delete(key);
    };
    tx.oncomplete=()=>{
      if(!restore||restore.metadataChanged||encoded.length){
        state.revision=revision+1;
        if(typeof BroadcastChannel!=='undefined'){const channel=new BroadcastChannel('little-archive');channel.postMessage({source:clientId});channel.close();}
      }
      resolve();
    };
    tx.onabort=()=>reject(failure||tx.error||Error('Storage transaction failed'));
  });
}
export async function readDrafts(){
  const db=await openExistingDB();
  if(!db)return {items:[],unreadable:0};
  try{return await new Promise((resolve,reject)=>{
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
  });}finally{db.close();}
}
export async function saveDraft(value,revision){
  value=await encodeDraft(value);
  const db=await openDB();return new Promise((resolve,reject)=>{
    const tx=db.transaction('metadata','readwrite'),s=tx.objectStore('metadata'),key='draft:'+value.id;let failure;
    const req=s.get(key);req.onsuccess=()=>{if((req.result?.revision||0)!==revision){failure=Error('Draft changed in another tab');tx.abort();return;}s.put({...value,revision:revision+1},key);};
    tx.oncomplete=()=>resolve(revision+1);tx.onabort=tx.onerror=()=>reject(failure||tx.error||Error('Draft save failed'));
  });
}
