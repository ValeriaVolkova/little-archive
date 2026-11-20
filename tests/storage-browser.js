const pages=new URLSearchParams(location.search).has('pages');
const base=pages?'/little-archive/':'/dist/';
const {openDB,readArchive,readFile,readDrafts,saveDraft,commit}=await import(base+'db.js');
const {createBackup,inspectBackup,planRestore}=await import(base+'backup-restore.js');
const {readZip,writeZip}=await import(base+'zip.js');

const passed=JSON.parse(sessionStorage.getItem('passed')||'[]');
const assert=(value,message)=>{if(!value)throw Error(message);};
const equal=(a,b,message)=>assert(JSON.stringify(a)===JSON.stringify(b),message);
const bytes=async blob=>[...new Uint8Array(await blob.arrayBuffer())];
const request=req=>new Promise((resolve,reject)=>{
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error);
});
const change=async(db,stores,callback)=>{
  const tx=db.transaction(stores,'readwrite');
  const done=new Promise((resolve,reject)=>{
    tx.oncomplete=resolve;
    tx.onabort=()=>reject(tx.error);
  });
  callback(tx);
  await done;
};
const syntheticHeic=()=>new Blob([Uint8Array.from(atob('AAAAHGZ0eXBoZWljAAAAAG1pZjFoZWljbWlhZgAAAX1tZXRhAAAAAAAAACFoZGxyAAAAAAAAAABwaWN0AAAAAAAAAAAAAAAAAAAAACJpbG9jAAAAAERAAAEAAQAAAAABoQABAAAAAAAAAB0AAAAjaWluZgAAAAAAAQAAABVpbmZlAgAAAAABAABodmMxAAAAAA5waXRtAAAAAAABAAAA/WlwcnAAAADdaXBjbwAAAHZodmNDAQNwAAAAkAAAAAAAHvAA/P34+AAADwNgAAEAGEABDAH//wNwAAADAJAAAAMAAAMAHroCQGEAAQAqQgEBA3AAAAMAkAAAAwAAAwAeoCCBBZbq5Ka5uAhoMCAAAAMDIAAAAwAhYgABAAZEAcFzwIkAAAATY29scm5jbHgAAQANAAaAAAAAFGlzcGUAAAAAAAAAQAAAAEAAAAAoY2xhcAAAACAAAAABAAAAIAAAAAH////gAAAAAv///+AAAAACAAAAEHBpeGkAAAAAAwgICAAAABhpcG1hAAAAAAAAAAEAAQWBAgMFhAAAACVtZGF0AAAAGSgBrxOA+BDhp3/1Wo//teM8PlYuvzopDPg='),c=>c.charCodeAt(0))]);
const originals=['one','two','three'].map(id=>'images/'+id+'/original.png');
const names=['Old Blob','New bytes'];
const state={
  version:1,children:[{id:'aurora',name:'Аврора',birthDate:'2020-03-03',color:'#889900'},
    {id:'misha',name:'Михаил-Александр-Константинович'.repeat(2),birthDate:'2022-03-03',color:'#557799'}],
  artworks:names.map((title,i)=>({id:'work-'+i,childId:i?'misha':'aurora',title,notes:'Заметка',
    artworkDate:'2025-03-03',addedAt:'2025-03-15T09:00:00Z',isFavorite:true,category:'drawing',
    coverImageId:i?'three':'one'})),
  images:['one','two','three'].map((id,i)=>({id,artworkId:i===2?'work-1':'work-0',
    originalPath:originals[i],editedPath:null,width:1,height:1,sortOrder:i===1?1:0})),
  albums:[{id:'album',title:'Альбом',childId:'aurora',coverStyle:'warm',orderedArtworkIds:['work-0']}]
};
const report=body=>fetch('/result',{method:'POST',body:JSON.stringify(body)});
async function waitFor(find){
  for(let i=0;i<150;i++){
    const result=find();
    if(result)return result;
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  throw Error('Application did not reach the expected state');
}
const makeImage=(type,width=20,height=32,color='#E96345')=>{
  const canvas=document.createElement('canvas');
  canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,width,height);
  return new Promise(resolve=>canvas.toBlob(resolve,type));
};
const appFrame=()=>{
  const frame=document.createElement('iframe');
  frame.style.cssText='width:390px;height:844px;border:0';
  frame.src=pages?base:base+'index.html';
  document.body.append(frame);
  return frame;
};

async function run(){
  const photo=await makeImage('image/png');
  const expected=await bytes(photo);
  const db=await openDB();
  if(!sessionStorage.getItem('reopened')){
    await checkEmptyRestoreRefusal(db);
    sessionStorage.setItem('passed',JSON.stringify(passed));
    // Seed the original schema with actual legacy Blob records.
    const legacy={...state,artworks:[state.artworks[0]],images:state.images.slice(0,2),
      albums:[{...state.albums[0],orderedArtworkIds:['work-0']}]};
    await change(db,['metadata','files'],tx=>{
      tx.objectStore('metadata').put(legacy,'archive');
      tx.objectStore('metadata').put({photos:null},'draft:bad');
      for(const path of originals.slice(0,2))tx.objectStore('files').put(photo,path);
    });
    equal(await readArchive(),legacy,'Legacy archive changed on open');
    await saveDraft({id:'good',updatedAt:'2026-01-01',work:{title:'Черновик'},cover:'preview',
      photos:[{id:'preview',original:photo,edited:null,thumb:photo}]},0);
    await commit(state,[[originals[2],photo]]);
    sessionStorage.setItem('reopened','1');
    location.reload();
    return;
  }

  const current=await readArchive();
  equal(current,{...state,revision:1},'Archive changed across page reload');
  for(const path of originals)equal(await bytes(await readFile(path)),expected,'Original bytes changed');
  const store=db.transaction('files').objectStore('files');
  const [oldValue,newValue]=await Promise.all([request(store.get(originals[0])),request(store.get(originals[2]))]);
  assert(oldValue instanceof Blob&&newValue.bytes instanceof ArrayBuffer,'Expected mixed storage formats');
  passed.push('Page reload preserves profiles, works, album order, and both original formats including additional photos');

  const drafts=await readDrafts();
  assert(drafts.unreadable===1&&drafts.items.length===1,'Damaged draft hid the good draft');
  equal(await bytes(drafts.items[0].photos[0].original),expected,'Draft lost its original photo');
  assert(await request(db.transaction('metadata').objectStore('metadata').get('draft:bad')),'Damaged draft was removed');
  passed.push('Broken draft stays intact and does not block the archive or other draft photos');

  const backup=await createBackup(current,readFile);
  const zip=await readZip(backup);
  assert(JSON.parse(await (await zip.get('manifest.json')).text()).formatVersion===1,'Backup format changed');
  const {incoming,verifiedFiles}=await inspectBackup(backup);
  equal(incoming,{...state,revision:undefined},'Backup omitted metadata');
  for(const path of originals)equal(await bytes(verifiedFiles.get(path)),expected,'ZIP changed original bytes');
  const destination={version:1,children:[],artworks:[],images:[],albums:[]};
  const fresh=await planRestore(destination,incoming,verifiedFiles);
  equal(fresh.archive,incoming,'Empty archive restore lost metadata');
  assert(fresh.puts.length===6&&fresh.restore.newPaths.size===6,'Empty restore omitted originals or previews');
  passed.push('ZIP v1 round trip includes all photos and preserves archive metadata');

  // Fault injection only in this throwaway browser profile.
  const distinct=await makeImage('image/png',9,7);
  await change(db,['files'],tx=>{
    tx.objectStore('files').delete(originals[1]);
  });
  // Keep the cover readable so the editor first loads a valid photo and then
  // encounters the missing additional original.
  const frame=appFrame();
  await waitFor(()=>frame.contentDocument?.querySelector('[data-action=drafts]'));
  frame.contentDocument.querySelector('.mobile-nav [data-page=archive]').click();
  (await waitFor(()=>frame.contentDocument?.querySelector('[data-action=detail][data-id=work-0]'))).click();
  (await waitFor(()=>frame.contentDocument?.querySelector('[data-action=edit]'))).click();
  const save=await waitFor(()=>frame.contentDocument?.querySelector('#artwork-form [data-action=submit]:disabled'));
  save.form.requestSubmit();
  equal(await readArchive(),current,'Partial editor load allowed a save');
  if(pages){
    const registration=await frame.contentWindow.navigator.serviceWorker.ready;
    assert(registration.scope===new URL(base,location.origin).href,'Pages worker scope is incorrect');
    const cache=(await caches.keys()).find(name=>name.startsWith('little-archive-pages-shell:'+registration.scope+':'));
    assert(cache,'Pages shell cache was not installed');
    const shell=await caches.open(cache);
    for(const asset of ['index.html','app.js','style.css','editorial.css','assets/icon.svg','assets/fonts/Onest.ttf','manifest.webmanifest']){
      assert(await shell.match(base+asset),'Missing response in Pages shell cache: '+asset);
    }
    passed.push('Pages artifact opens under a project subpath and installs a scoped Service Worker shell');
  }
  frame.remove();
  await change(db,['files'],tx=>tx.objectStore('files').put(distinct,originals[0]));
  passed.push('Application opens with a damaged draft and refuses to save a partly loaded old work');
  const edited=await readArchive();
  edited.artworks[0].title='Локальное изменение';
  await commit(edited);
  const repair=await planRestore(edited,incoming,verifiedFiles);
  await commit(repair.archive,repair.puts,[],null,repair.restore);
  equal(await bytes(await readFile(originals[1])),expected,'Matching missing original was not restored');
  equal(await bytes(await readFile(originals[0])),await bytes(distinct),'Restore overwrote an existing file');
  equal((await readArchive()).artworks[0].title,'Локальное изменение','Restore overwrote metadata');
  const afterRepair=await readArchive();
  const again=await planRestore(afterRepair,incoming,verifiedFiles);
  await commit(again.archive,again.puts,[],null,again.restore);
  equal(await readArchive(),afterRepair,'Repeated restore changed archive content');
  passed.push('Restore repairs absent originals and preserves existing files and metadata');

  const invalidDbValue={version:99};
  await change(db,['metadata'],tx=>tx.objectStore('metadata').put(invalidDbValue,'archive'));
  let readError;
  try{await readArchive();}catch(error){readError=error;}
  assert(readError?.message==='Unsupported archive version','Invalid archive did not reject');
  equal(await request(db.transaction('metadata').objectStore('metadata').get('archive')),invalidDbValue,'Invalid archive was overwritten');
  passed.push('Invalid archive rejects cleanly and is preserved for recovery');

  await change(db,['metadata','files'],tx=>{
    tx.objectStore('metadata').delete('archive');
    tx.objectStore('files').clear();
  });
  await commit(fresh.archive,fresh.puts,[],null,fresh.restore);
  equal(await readArchive(),{...incoming,revision:1},'Full restore changed metadata');
  for(const path of originals)equal(await bytes(await readFile(path)),expected,'Full restore lost an original');
  passed.push('Full restore into empty test storage saves every original and record');
  await checkPhaseTwo(db,photo,expected);
  await checkExportRefusal(db);
  await checkUnreadableExport(db,photo);
  await checkUnreadableAvatar();
  await checkRepairTransactions(db);
  await checkHeicRepair(db);
  await report({passed});
}

async function checkHeicRepair(db){
  const archive=structuredClone(state),heic=syntheticHeic(),png=await makeImage('image/png');
  archive.revision=(await readArchive()).revision;
  const path=archive.images[0].originalPath='images/one/original.heic';
  const jpg=await makeImage('image/jpeg');
  const jpgPath=archive.images[1].originalPath='images/two/original.jpg';
  await commit(archive,[[path,heic],[jpgPath,jpg],[originals[2],png]]);
  const zip=await createBackup(archive,readFile);
  const {incoming,verifiedFiles}=await inspectBackup(zip);
  const plan=async()=>planRestore(await readArchive(),incoming,verifiedFiles);
  const apply=p=>commit(p.archive,p.puts,[],null,p.restore);
  const cut=heic.slice(0,24,'image/heic');
  const entries=await readZip(zip),corruptFiles=[];
  for(const key of entries.names)corruptFiles.push([key,key===path?cut:await entries.get(key)]);
  let invalid;
  try{await inspectBackup(await writeZip(corruptFiles));}catch(error){invalid=error;}
  assert(invalid?.cause?.code==='HEIF_INVALID_INPUT','Corrupt HEIC in a checksum-valid ZIP must reject during inspection');
  await change(db,['files'],tx=>{
    const files=tx.objectStore('files');
    files.put(cut,path);files.put(new Blob(['bad jpeg'],{type:'image/jpeg'}),jpgPath);
  });
  const initial=await readArchive(),repair=await plan();
  assert(repair.puts.some(([key])=>key===path),'Truncated HEIC not scheduled for repair');
  await apply(repair);
  equal(await bytes(await readFile(path)),await bytes(heic),'Restored HEIC bytes differ');
  equal(await bytes(await readFile(jpgPath)),await bytes(jpg),'Restored JPEG bytes differ');
  const fixed=await readArchive();
  equal(fixed,{...initial,revision:initial.revision+1},'Unexpected HEIC metadata change');
  const repeat=await plan();equal(repeat.puts.length,0,'Readable HEIC scheduled for replacement');
  await apply(repeat);equal(await readArchive(),fixed,'Repeat import changed revision');
  passed.push('Real HEIC decoder rejects 24-byte prefix; ZIP restores exact original and second import changes nothing');

  // Each realm gets a fresh module cache and worker. Force the fallback
  // using the truncated header even if a browser gains native HEIC support.
  await change(db,['files'],tx=>tx.objectStore('files').put(cut,path));
  async function snapshot(){
    const keys=await request(db.transaction('files').objectStore('files').getAllKeys());
    const files=[];
    for(const key of keys)files.push([key,await bytes(await readFile(key))]);
    return {archive:await readArchive(),files};
  }
  const before=await snapshot();
  for(const fault of ['missing-module','resource','abort','io']){
    const frame=document.createElement('iframe');
    const moduleURL=new URL(base+'vendor/heic-to.js',location.href).href;
    frame.srcdoc='<script type="importmap">'+JSON.stringify({imports:fault==='missing-module'
      ?{[moduleURL]:'/tests/nonexistent-heic-module.js'}:{}})+'</script>';
    const ready=new Promise(resolve=>frame.onload=resolve);
    document.body.append(frame);await ready;
    try{
      const realm=frame.contentWindow;
      if(fault==='io'){
        realm.Blob.prototype.arrayBuffer=async()=>{throw new DOMException('Read failed','NotReadableError');};
      }else if(fault!=='missing-module'){
        realm.Worker=class {
          constructor(){
            if(fault==='abort')throw new DOMException('Cancelled worker startup','AbortError');
            throw new RangeError('Worker allocation failed');
          }
        };
      }
      const restoreModule=await realm.Function('url','return import(url)')(new URL(base+'backup-restore.js',location.href).href);
      let failure;
      try{await apply(await restoreModule.planRestore(await readArchive(),incoming,verifiedFiles));}
      catch(error){failure=error;}
      equal(failure?.name,{'missing-module':'TypeError',resource:'RangeError',abort:'AbortError',io:'NotReadableError'}[fault],'Expected system failure: '+fault);
      equal(await snapshot(),before,'System failure changed keys, bytes or metadata: '+fault);
    }finally{frame.remove();}
  }
  passed.push('Unavailable HEIC module, worker allocation failure, I/O failure and abort preserve stored files and revision');
}

async function checkRepairTransactions(db){
  const local=structuredClone(state),image=local.images[0];
  local.revision=(await readArchive()).revision;
  const edit=image.editedPath='images/one/edited.jpg',thumb=image.originalPath+'.thumb';
  image.cropSettings={x:0,y:0,w:0.5,h:1,rotation:0};
  const png=await makeImage('image/png'),jpeg=await makeImage('image/jpeg');
  const distinct=await makeImage('image/png',14,18);
  await commit(local,[...originals.map(path=>[path,png]),[edit,jpeg]]);
  const zip=await createBackup(local,readFile);
  const {incoming,verifiedFiles}=await inspectBackup(zip);
  const plan=async()=>planRestore(await readArchive(),incoming,verifiedFiles);
  const apply=p=>commit(p.archive,p.puts,[],null,p.restore);
  const keys=()=>request(db.transaction('files').objectStore('files').getAllKeys());
  const snapshot=async()=>{
    const files=[];
    for(const key of await keys())files.push([key,await bytes(await readFile(key))]);
    return {archive:await readArchive(),files};
  };
  const current=await readArchive();
  current.artworks[0].title='Newer';current.artworks[0].notes='Keep this note';
  current.artworks[0].artworkDate='2025-02-01';
  current.albums[0].title='My current album';
  current.artworks[0].childId=current.children[1].id;
  current.albums[0].childId=null;
  current.albums[0].orderedArtworkIds=[current.artworks[1].id,current.artworks[0].id];
  current.images[0].autoEnhance=true;
  await commit(current,[[originals[2],distinct]]);
  for(const bad of [null,new Blob(),new Blob(['not a photo'])]){
    await change(db,['files'],tx=>{
      const files=tx.objectStore('files');
      for(const path of [originals[0],edit,thumb])bad===null?files.delete(path):files.put(bad,path);
    });
    const before=await snapshot(),p=await plan();
    if(bad===null){
      // Abort after an actual file write succeeds, before the multi-store transaction commits.
      const put=IDBObjectStore.prototype.put;let injected=false;
      IDBObjectStore.prototype.put=function(...args){
        const req=put.apply(this,args);
        if(this.name==='files'&&args[1]===edit){
          req.addEventListener('success',()=>{injected=true;this.transaction.abort();});
        }
        return req;
      };
      let failed=false;
      try{await apply(p);}catch{failed=true;}finally{IDBObjectStore.prototype.put=put;}
      assert(failed&&injected,'Expected an interrupted write');
      equal(await snapshot(),before,'Aborted transaction left partial files or metadata');
    }
    await apply(await plan());
    equal(await readArchive(),{...before.archive,revision:before.archive.revision+1},'Restore discarded local metadata');
    equal(await bytes(await readFile(originals[0])),await bytes(png),'Original repair failed');
    equal(await bytes(await readFile(edit)),await bytes(jpeg),'Edited repair failed');
    equal(await bytes(await readFile(originals[2])),await bytes(distinct),'Healthy original was overwritten');
    const fixed=await snapshot(),again=await plan();
    equal(again.puts.length,0,'Healthy file scheduled for rewrite');
    await apply(again);equal(await snapshot(),fixed,'Repeated restore changed keys, bytes or revision');
  }
  // Same names in the ZIP are insufficient: both the source bytes and recipe must match.
  await change(db,['files'],tx=>tx.objectStore('files').delete(edit));
  const different=await readArchive();
  await commit(different,[[originals[0],distinct]]);
  equal((await plan()).skippedEdits,1,'Restored pixels derived from another original');
  different.images[0].cropSettings.rotation=90;
  await commit(different,[[originals[0],png]]);
  const untouched=await snapshot(),mismatch=await plan();
  equal(mismatch.skippedEdits,1,'Unreported crop mismatch');
  await apply(mismatch);equal(await snapshot(),untouched,'Older crop replaced newer settings');
  const readableEdit=await makeImage('image/jpeg',12,11);
  await commit(different,[[edit,readableEdit]]);
  const newer=await snapshot();
  let staleRejected=false;
  try{await apply(mismatch);}catch{staleRejected=true;}
  assert(staleRejected,'Stale restore accepted a newer revision');
  const keep=await plan();
  assert(!keep.puts.length&&!keep.skippedEdits,'Readable newer edit was scheduled for repair');
  await apply(keep);equal(await snapshot(),newer,'Healthy newer edit or album order changed');
  const brokenZip=zip.slice(0,-1);
  let rejected=false;
  try{await inspectBackup(brokenZip);}catch{rejected=true;}
  assert(rejected,'Truncated ZIP passed inspection');
  equal(await snapshot(),newer,'Invalid ZIP changed the collection');
  passed.push('File repairs are atomic, retryable and idempotent for absent, empty and damaged files; newer edits and healthy originals survive');
}

async function checkEmptyRestoreRefusal(db){
  const {writeZip,zipLimits}=await import(base+'zip.js');
  const zip=await writeZip([['manifest.json',new Blob([new Uint8Array(zipLimits.manifest+1)])]]);
  const keys=store=>request(db.transaction(store).objectStore(store).getAllKeys());
  const before=await readArchive();
  const frame=appFrame(),find=selector=>waitFor(()=>frame.contentDocument?.querySelector(selector));
  (await find('.mobile-nav [data-page=settings]')).click();
  for(const [lang,message] of [
    ['en','This ZIP exceeds the format limits. Nothing was restored. Your current collection is unchanged. Keep the original ZIP.'],
    ['es','El ZIP supera los límites del formato. No se ha restaurado nada. Tu colección actual sigue intacta. Conserva el ZIP original.'],
    ['ru','ZIP превышает ограничения формата. Восстановление не выполнено. Текущая коллекция не изменилась. Сохраните исходный ZIP.']
  ]){
    (await find('[data-language='+lang+']')).click();
    const input=await find('input[accept*=".zip"]'),transfer=new DataTransfer();
    transfer.items.add(new File([zip],'large.zip'));input.files=transfer.files;
    input.dispatchEvent(new Event('change'));
    equal((await find('.modal-body [role=alert]')).textContent,message,'Wrong restore result');
    assert(!frame.contentDocument.querySelector('#toast.show,[data-action=merge]'),'Restore reported success or offered merge');
    (await find('.modal-header [data-action=close]')).click();
  }
  equal(await readArchive(),before,'Refusal changed archive');
  equal(await keys('metadata'),[],'Refusal wrote metadata');equal(await keys('files'),[],'Refusal wrote files');
  frame.remove();passed.push('Oversize ZIP restore into empty storage reports no restore in EN/ES/RU and writes no records');
}

async function checkUnreadableExport(db,good){
  const collection=structuredClone(state);
  collection.images=collection.images.filter(image=>image.id!=='two');
  collection.artworks[1].title='<Unfinished> $&';
  collection.revision=(await readArchive()).revision;
  for(const bad of [new Blob([],{type:'image/png'}),new Blob([Uint8Array.of(1,2,3)],{type:'image/png'})]){
    await commit(collection,[[originals[0],good],[originals[2],bad]]);
    const before=await readArchive();
    const keys=()=>request(db.transaction('files').objectStore('files').getAllKeys());
    const paths=await keys(),contents=await Promise.all(paths.map(async path=>bytes(await readFile(path))));
    const frame=appFrame(),find=selector=>waitFor(()=>frame.contentDocument?.querySelector(selector));
    (await find('.mobile-nav [data-page=settings]')).click();
    (await find('[data-language=ru]')).click();
    let downloads=0;
    frame.contentDocument.addEventListener('click',event=>{
      if(event.target.closest('a[download]')){downloads++;event.preventDefault();}
    },true);
    (await find('[data-action=export]')).click();
    equal((await find('.modal-body [role=alert]')).textContent,'Не удалось прочитать фотографию работы «<Unfinished> $&». ZIP не создан.','Missing work in error');
    assert(!downloads&&!frame.contentDocument.querySelector('#toast.show'),'Invalid original produced a download or success');
    frame.remove();equal(await readArchive(),before,'Failed decode changed metadata');
    equal(await keys(),paths,'Failed decode changed file keys');
    for(const [i,path] of paths.entries())equal(await bytes(await readFile(path)),contents[i],'Failed decode changed stored bytes');
  }
  passed.push('Mixed valid PNG and empty or three-byte original: named failure without download, mutation or success');
}

async function checkUnreadableAvatar(){
  const collection=await readArchive(),child=collection.children[1];
  child.name='Luz <A> $&';
  const path='profiles/'+child.id+'/avatar.jpg';
  child.profileImagePath=path;
  const damaged=new Blob([Uint8Array.of(1,2,3)],{type:'image/jpeg'});
  await commit(collection,[[path,damaged]]);
  const before=await readArchive(),frame=appFrame();
  const find=selector=>waitFor(()=>frame.contentDocument?.querySelector(selector));
  (await find('.mobile-nav [data-page=settings]')).click();
  let downloads=0;
  frame.contentDocument.addEventListener('click',event=>{
    if(event.target.closest('a[download]')){downloads++;event.preventDefault();}
  },true);
  for(const [lang,message] of [
    ['ru','Не удалось прочитать фотографию профиля «Luz <A> $&». ZIP не создан.'],
    ['en','Could not read the profile photo for “Luz <A> $&”. No ZIP was created.'],
    ['es','No se pudo leer la foto del perfil «Luz <A> $&». No se ha creado el ZIP.']
  ]){
    (await find('[data-language='+lang+']')).click();
    (await find('[data-action=export]')).click();
    equal((await find('.modal-body [role=alert]')).textContent,message,'Wrong avatar owner or language');
    assert(!frame.contentDocument.querySelector('#toast.show'),'Unexpected success');
    (await find('.modal-header [data-action=close]')).click();
  }
  frame.remove();
  equal(downloads,0,'Damaged avatar started a download');
  equal(await readArchive(),before,'Export changed metadata');
  equal(await bytes(await readFile(path)),[1,2,3],'Export changed damaged avatar');
  passed.push('Corrupt avatar identifies the correct child in RU/EN/ES before download and preserves the archive');
}

async function checkExportRefusal(db){
  const collection=await readArchive();
  for(let i=0;i<530;i++)collection.albums.push({id:'large-'+i,title:'Album',description:'n'.repeat(20000),
    childId:null,coverStyle:'warm',orderedArtworkIds:[]});
  await commit(collection);
  const before=await readArchive();
  const keys=()=>request(db.transaction('files').objectStore('files').getAllKeys());
  const paths=await keys(),originalBytes=await Promise.all(paths.map(async path=>bytes(await readFile(path))));
  const frame=appFrame();
  const find=selector=>waitFor(()=>frame.contentDocument?.querySelector(selector));
  await find('.archive-home');
  let downloads=0;
  frame.contentDocument.addEventListener('click',event=>{
    if(event.target.closest('a[download]')){downloads++;event.preventDefault();}
  },true);
  (await find('.mobile-nav [data-page=settings]')).click();
  for(const [language,phrase] of [['ru','ZIP не создан'],['en','No ZIP was created'],['es','No se ha creado el ZIP']]){
    (await find('[data-language='+language+']')).click();
    (await find('[data-action=export]')).click();
    const alert=await find('.modal-body [role=alert]');
    assert(alert.textContent.includes(phrase),'Missing localized export refusal: '+language);
    assert(!frame.contentDocument.querySelector('#toast.show'),'Export showed a success toast');
    (await find('.modal-header [data-action=close]')).click();
  }
  frame.remove();
  assert(downloads===0,'Unsupported ZIP was offered for download');
  equal(await readArchive(),before,'Failed export changed stored archive or revision');
  equal(await keys(),paths,'Failed export changed file keys');
  for(const [i,path] of paths.entries())equal(await bytes(await readFile(path)),originalBytes[i],'Failed export changed stored bytes');
  passed.push('Oversize export in RU/EN/ES shows an error without download or success; persisted metadata and every file are identical');
}

async function checkPhaseTwo(db,photo,expected){
  const frame=appFrame();
  const doc=()=>frame.contentDocument;
  const query=selector=>doc()?.querySelector(selector);
  const click=async selector=>(await waitFor(()=>query(selector))).click();
  const nav=page=>click('.mobile-nav [data-page="'+page+'"]');
  const value=(input,next)=>{
    input.value=next;
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true}));
  };
  await waitFor(()=>query('.archive-home'));
  assert(query('.mobile-nav [aria-current=page]').dataset.page==='archive','Initial tab was not Archive');
  equal([...doc().querySelectorAll('.mobile-nav button')].map(el=>el.dataset.page||el.dataset.action),
    ['home','archive','newWork','albums','settings'],'Five-item navigation is out of order');
  await nav('home');
  assert(doc().querySelectorAll('.artist-card').length===2&&query('.collection-summary p').textContent==='2 работы','Home did not count real profiles and artwork');
  await click('.artist-card[data-id=misha]');
  assert(query('.child-tabs [data-id=misha]').getAttribute('aria-pressed')==='true','Artist did not open their Archive');
  await nav('home');
  assert(doc().documentElement.scrollWidth<=390,'Home overflows a 390px viewport');
  await click('[data-action=openPeriod][data-id=misha][data-period="3"]');
  assert(query('#period-filter').value==='3','Dashboard did not apply age period');
  equal([...doc().querySelectorAll('.art-grid [data-action=detail]')].map(el=>el.dataset.id),['work-1'],'Age period returned the wrong works');
  await click('.child-tabs [data-id=aurora]');
  assert(query('#period-filter').value==='3'&&!query('.art-grid .work-card'),'Choosing a child reset the age filter');
  await nav('home');await nav('archive');
  assert(query('#period-filter').value==='3'&&query('.child-tabs [data-id=aurora]').getAttribute('aria-pressed')==='true','Nav lost active filters');
  await click('.archive-reset');
  assert(query('.child-tabs [data-id=""]').getAttribute('aria-pressed')==='true','Archive nav did not default to All children');
  assert(doc().querySelectorAll('.art-grid .work-card').length===2,'Family archive omitted a child');
  assert(doc().documentElement.scrollWidth<=390,'Archive overflows a 390px viewport');
  passed.push('Start on Archive; Home counts artwork and opens the correct child or age filter');

  await click('.art-grid [data-id=work-0][data-action=detail]');
  await click('#modal [data-action=edit]');
  await waitFor(()=>doc().querySelectorAll('#photo-list img').length===2);
  const oldForm=query('#artwork-form');
  value(oldForm.elements.notes,'Заметка после редактирования');
  await click('#artwork-form [data-action=submit]');
  await waitFor(()=>!query('#artwork-form'));
  const afterEdit=await readArchive();
  assert(afterEdit.artworks.find(w=>w.id==='work-0').notes==='Заметка после редактирования','Edit did not save');
  equal(afterEdit.images.filter(i=>i.artworkId==='work-0').map(i=>[i.id,i.originalPath]),[['one',originals[0]],['two',originals[1]]],'Old work lost photo relations');
  for(const path of originals.slice(0,2))equal(await bytes(await readFile(path)),expected,'Edit replaced an original');
  passed.push('Saving a metadata edit on a legacy work preserves both original files and references');

  await click('.mobile-nav .nav-add');
  const form=await waitFor(()=>query('#artwork-form'));
  assert(form.elements.child.value==='aurora','Last-used child was not remembered');
  value(form.elements.date,'2021-01-01');
  value(form.elements.child,'misha');
  value(form.elements.title,'Быстрое добавление');
  const choose=(file,filename)=>{
    const transfer=new frame.contentWindow.DataTransfer();
    transfer.items.add(new frame.contentWindow.File([file],filename,{type:file.type}));
    const input=form.querySelector('#files');
    input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  };
  // Synthetic solid square encoded by pillow-heif. No personal metadata.
  const heic=syntheticHeic();
  choose(heic,'square.heic');
  const heicArchive=structuredClone(state);
  heicArchive.images[0].originalPath='images/one/original.heic';
  const jpegPath='images/two/original.jpg';
  heicArchive.images[1].originalPath=jpegPath;
  const supported=new Map([[heicArchive.images[0].originalPath,heic],[jpegPath,await makeImage('image/jpeg')],[originals[2],photo]]);
  const checked=await inspectBackup(await createBackup(heicArchive,path=>supported.get(path)));
  for(const [path,file] of supported)equal(await bytes(checked.verifiedFiles.get(path)),await bytes(file),'Format round trip changed original');
  passed.push('HEIC, JPEG and PNG pass the same export/import decoder and retain their bytes');
  await click('.crop-dialog [data-op=rotate]');
  await click('.crop-dialog [data-op=done]');
  await waitFor(()=>!query('.crop-dialog'));
  const square=await waitFor(()=>query('#photo-list img')?.naturalWidth);
  assert(square===32,'HEIC crop preview is not the expected square');
  choose(await makeImage('image/png',160,80),'landscape.png');
  const surface=await waitFor(()=>query('.crop-dialog canvas'));
  const bounds=surface.getBoundingClientRect();
  const scale=Math.min((bounds.width-32)/160,(bounds.height-32)/80);
  const left=bounds.left+(bounds.width-160*scale)/2,top=bounds.top+(bounds.height-80*scale)/2;
  // Synthetic events have no OS pointer to capture. Geometry and handlers are real.
  surface.setPointerCapture=()=>{};
  const gesture=(type,x,y)=>surface.dispatchEvent(new frame.contentWindow.PointerEvent(type,{
    pointerId:1,pointerType:'touch',clientX:left+x*scale,clientY:top+y*scale,bubbles:true}));
  gesture('pointerdown',0,0);gesture('pointermove',40,8);gesture('pointerup',40,8);
  gesture('pointerdown',100,44);gesture('pointermove',90,40);gesture('pointerup',90,40);
  await click('.crop-dialog [data-op=done]');
  await waitFor(()=>!query('.crop-dialog')&&query('#photo-list img')?.naturalWidth===120);
  assert(Math.abs(query('#photo-list img').naturalHeight-72)<=1,'Touch handles constrained aspect ratio');
  choose(photo,'first.png');
  await click('.crop-dialog [data-op=skip]');
  const preview=await waitFor(()=>form.querySelector('#photo-list img')?.src);
  const jpeg=await makeImage('image/jpeg',20,32,'#bbbbbb');
  // JPEG DateTimeOriginal with a different date, injected into a real image.
  const exif=new Uint8Array(74),view=new DataView(exif.buffer),at=10;
  view.setUint16(0,0xffe1);view.setUint16(2,72);exif.set([69,120,105,102,0,0],4);
  view.setUint16(at,0x4949);view.setUint16(at+2,42,true);view.setUint32(at+4,8,true);
  view.setUint16(at+8,1,true);view.setUint16(at+10,0x8769,true);view.setUint16(at+12,4,true);
  view.setUint32(at+14,1,true);view.setUint32(at+18,26,true);
  view.setUint16(at+26,1,true);view.setUint16(at+28,0x9003,true);view.setUint16(at+30,2,true);
  view.setUint32(at+32,20,true);view.setUint32(at+36,44,true);
  exif.set(new TextEncoder().encode('2023:02:15 10:20:30'),at+44);
  const replacement=new Blob([jpeg.slice(0,2),exif,jpeg.slice(2)],{type:'image/jpeg'});
  const {photoDate}=await import(base+'media.js');
  assert(await photoDate(replacement)==='2023-02-15','Test JPEG has no readable EXIF capture date');
  choose(replacement,'replacement.jpg');
  await waitFor(()=>form.querySelector('#photo-list img')?.src!==preview);
  await click('.crop-dialog [data-op=in]');
  await click('.crop-dialog [data-op=rotate]');
  const toggle='.crop-dialog [data-op=enhance]';
  const centerPixel=canvas=>canvas.getContext('2d').getImageData(Math.floor(canvas.width/2),Math.floor(canvas.height/2),1,1).data[0];
  const previewPixel=()=>centerPixel(query('.crop-dialog canvas'));
  const unenhanced=previewPixel();
  await click(toggle);
  assert(query(toggle).getAttribute('aria-pressed')==='true'&&previewPixel()>unenhanced+8,'Enhance did not immediately lighten paper');
  await click(toggle);
  assert(previewPixel()===unenhanced,'Disabling enhancement did not restore preview pixels');
  await click(toggle);
  await click('.crop-dialog [data-op=done]');
  await waitFor(()=>!query('.crop-dialog'));
  await click('#photo-list [data-action=crop]');
  await click('.crop-dialog [data-op=reset]');
  await click('.crop-dialog [data-op=cancel]');
  assert(form.elements.date.value==='2021-01-01','EXIF overwrote manual date');
  await click('#artwork-form [data-action=submit]');
  await waitFor(()=>{
    const open=query('#artwork-form');
    if(!open)return true;
    const error=open.querySelector('.inline-error').textContent;
    if(error)throw Error('Quick Add: '+error);
    const invalid=open.querySelector(':invalid');
    if(invalid)throw Error('Quick Add invalid '+invalid.name+': '+invalid.validationMessage);
    return false;
  });
  const added=await readArchive(),newWork=added.artworks.find(w=>w.title==='Быстрое добавление');
  assert(newWork?.artworkDate==='2021-01-01'&&newWork.childId==='misha'&&newWork.category==='other'&&newWork.uncategorized===true,'Quick Add changed required or optional fields');
  const newPhotos=added.images.filter(i=>i.artworkId===newWork.id);
  assert(newPhotos.length===1,'Quick Add saved more than one photo');
  equal(await bytes(await readFile(newPhotos[0].originalPath)),await bytes(replacement),'Quick Add changed the JPEG original');
  assert(query('.art-grid [data-id="'+newWork.id+'"]'),'New artwork not visible in Archive');
  const newBackup=await inspectBackup(await createBackup(added,readFile));
  assert(newBackup.incoming.artworks.find(w=>w.id===newWork.id).uncategorized===true,'ZIP lost the optional-category flag');
  const cropped=newPhotos[0];
  assert(cropped.autoEnhance===true,'Saved photo lost its enhancement');
  assert(cropped.cropSettings.rotation===90&&cropped.width===26&&cropped.height===16,'Wrong landscape dimensions or saved recipe');
  const restored=newBackup.incoming.images.find(i=>i.id===cropped.id);
  assert(restored.autoEnhance===true,'ZIP lost enhancement');
  equal(restored.cropSettings,cropped.cropSettings,'ZIP lost crop settings');
  equal(await bytes(newBackup.verifiedFiles.get(cropped.editedPath)),await bytes(await readFile(cropped.editedPath)),'ZIP lost edited pixels');
  const card=query('.art-grid [data-id="'+newWork.id+'"] img')||query('.art-grid [data-id="'+newWork.id+'"]').closest('.work-card').querySelector('img');
  await waitFor(()=>card.naturalWidth===26&&card.naturalHeight===16);
  await click('.art-grid [data-action=detail][data-id="'+newWork.id+'"]');
  await click('#modal [data-action=edit]');
  await click('#photo-list [data-action=crop]');
  assert((await waitFor(()=>query(toggle))).getAttribute('aria-pressed')==='true','Reopened crop lost enhancement');
  await click(toggle);
  await click('.crop-dialog [data-op=done]');
  await waitFor(()=>!query('.crop-dialog'));
  await click('#artwork-form [data-action=submit]');
  await waitFor(()=>!query('#artwork-form'));
  const disabled=(await readArchive()).images.find(i=>i.id===cropped.id);
  assert(!disabled.autoEnhance,'Disabled enhancement was not saved');
  equal(disabled.cropSettings,cropped.cropSettings,'Switching off enhancement changed framing');
  equal(await bytes(await readFile(disabled.editedPath)),await bytes(newBackup.verifiedFiles.get(cropped.editedPath)),'Toggle recompressed cropped image');
  await click('.art-grid [data-action=detail][data-id="'+newWork.id+'"]');
  await click('#modal [data-action=edit]');
  await click('#photo-list [data-action=crop]');
  assert((await waitFor(()=>query(toggle))).getAttribute('aria-pressed')==='false','Persisted off state was not restored');
  await click('.crop-dialog [data-op=reset]');
  await click('.crop-dialog [data-op=done]');
  await waitFor(()=>!query('.crop-dialog'));
  await click('#artwork-form [data-action=submit]');
  await waitFor(()=>!query('#artwork-form'));
  const reset=(await readArchive()).images.find(i=>i.id===cropped.id);
  assert(!reset.editedPath&&!reset.cropSettings&&reset.width===20&&reset.height===32,'Reopened crop did not restore original framing');
  equal(await bytes(await readFile(reset.originalPath)),await bytes(replacement),'Reset changed original bytes');
  // Enhance an original with no crop, then discard a later change.
  await click('.art-grid [data-action=detail][data-id="'+newWork.id+'"]');
  await click('#modal [data-action=edit]');await click('#photo-list [data-action=crop]');
  await click(toggle);await click('.crop-dialog [data-op=done]');
  await waitFor(()=>!query('.crop-dialog'));await click('#artwork-form [data-action=submit]');
  await waitFor(()=>!query('#artwork-form'));
  const plain=(await readArchive()).images.find(i=>i.id===cropped.id);
  assert(plain.autoEnhance&&!plain.editedPath&&!plain.cropSettings,'Full-frame enhancement required a crop or extra image file');
  await click('.art-grid [data-action=detail][data-id="'+newWork.id+'"]');
  await click('#modal [data-action=edit]');await click('#photo-list [data-action=crop]');
  await click(toggle);await click('.crop-dialog [data-op=cancel]');
  await waitFor(()=>!query('.crop-dialog'));await click('#artwork-form [data-action=submit]');
  await waitFor(()=>!query('#artwork-form'));
  assert((await readArchive()).images.find(i=>i.id===plain.id).autoEnhance,'Cancel committed a changed enhancement');
  passed.push('One-button enhancement previews immediately, toggles off exactly and survives save/reopen without changing crop bytes');
  passed.push('Square HEIC, portrait PNG and JPEG crop, landscape thumbnail, cancellation, ZIP recipe and re-edit from original');
  passed.push('Quick Add replaces the preview, preserves a manual date against EXIF, and saves exactly one original');

  const library=document.createElement('script');library.src=base+'vendor/pdf-lib.min.js';
  const pdfLoaded=new Promise((resolve,reject)=>{library.onload=resolve;library.onerror=reject;});
  document.head.append(library);await pdfLoaded;
  const {createPDF}=await import(base+'pdf.js');
  const restorePlan=await planRestore({version:1,children:[],artworks:[],images:[],albums:[]},newBackup.incoming,newBackup.verifiedFiles);
  const restoredFiles=new Map(restorePlan.puts);
  equal(await bytes(restoredFiles.get(cropped.originalPath)),await bytes(replacement),'Restore plan lost original');
  assert(restoredFiles.has(cropped.originalPath+'.thumb'),'Restore omitted gallery thumbnail');
  const pdf=await createPDF(restorePlan.archive,{...added.albums[0],childId:newWork.childId,orderedArtworkIds:[newWork.id]},
    path=>{assert(path===cropped.editedPath,'PDF used uncropped original');return restoredFiles.get(path);},true,()=>{});
  const parsed=await window.PDFLib.PDFDocument.load(await pdf.blob.arrayBuffer());
  const {loadImage,enhancedPreview}=await import(base+'media.js');
  const swatches=document.createElement('canvas');swatches.width=6;swatches.height=1;
  const paint=swatches.getContext('2d');
  ['#111111','#bbbbbb','#e6e6e6','#f5f5f5','#ffffff','#d02036'].forEach((color,x)=>{
    paint.fillStyle=color;paint.fillRect(x,0,1,1);
  });
  const chart=await loadImage(await new Promise(resolve=>swatches.toBlob(resolve)));
  const samples=enhancedPreview(chart,6).getContext('2d').getImageData(0,0,6,1).data;
  assert(samples[0]===17&&samples[4]>187&&samples[8]<samples[12]&&samples[12]<samples[16],'Enhancement flattened shadows or pale pencil marks');
  equal([...samples.slice(20,23)],[208,32,54],'Enhancement washed out saturated pigment');
  passed.push('Local tone curve lifts paper while retaining dark ink, pale strokes and saturated pigment');
  async function pixelIn(blob){
    const image=await loadImage(blob),canvas=document.createElement('canvas');
    canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    canvas.getContext('2d').drawImage(image,0,0);
    return centerPixel(canvas);
  }
  assert(await pixelIn(pdf.previews[1])>unenhanced+8,'PDF omitted the enhancement');
  assert(await pixelIn(restoredFiles.get(cropped.originalPath+'.thumb'))>unenhanced+8,'Restored gallery thumbnail omitted enhancement');
  assert(parsed.getCreator()==='Drawkeeper'&&parsed.getAuthor()==='Drawkeeper','PDF branding did not update');
  assert(parsed.getPageCount()===2&&parsed.getTitle()==='Альбом','PDF export lost its cover or artwork page');
  passed.push('PDF export still produces a readable A4 book with a Cyrillic album title');
  await nav('settings');await click('[data-language=en]');await nav('archive');
  assert(query('.child-tabs [data-id=""]').textContent==='All children','English family labels did not load');
  const search=query('#search');search.focus();value(search,'Быстрое');
  await waitFor(()=>doc().querySelectorAll('.art-grid .work-card').length===1);
  assert(doc().activeElement===search&&query('.art-grid .work-open').dataset.id===newWork.id,'Search replaced its focused field or returned wrong results');
  await nav('settings');await click('[data-language=ru]');
  passed.push('Mobile-width navigation switches RU/EN and search keeps focus while filtering Cyrillic');
  frame.remove();

  await change(db,['metadata'],tx=>{const store=tx.objectStore('metadata');store.delete('archive');store.delete('draft:good');store.delete('draft:bad');});
  const first=appFrame();
  const firstQuery=s=>first.contentDocument?.querySelector(s);
  (await waitFor(()=>firstQuery('.mobile-nav .nav-add'))).click();
  const profile=await waitFor(()=>firstQuery('#profile-form'));
  assert(profile.elements.name.required&&profile.elements.birthday.required,'First profile does not request a name and birthday');
  value(profile.elements.name,'Новый профиль');value(profile.elements.birthday,'2021-04-29');
  profile.querySelector('[data-action=submit]').click();
  await waitFor(()=>firstQuery('#archive-results [data-action=newWork]'));
  firstQuery('.mobile-nav [data-page=home]').click();
  assert(firstQuery('.artist-card')&&!firstQuery('.age-chart,.story-pair'),'Empty Home has invented statistics or artwork');
  const firstState=await readArchive();
  assert(firstState.children.length===1&&firstState.artworks.length===0,'Onboarding mixed demo records into the archive');
  passed.push('First opening starts on Archive, central Add creates the first profile, and empty Home has no invented data');
  first.remove();
  const merge=await planRestore(firstState,newBackup.incoming,newBackup.verifiedFiles);
  // This fixture removed only metadata. Existing unowned file keys must
  // abort the import rather than be overwritten by newly introduced records.
  let conflict;
  try{await commit(merge.archive,merge.puts,[],null,merge.restore);}catch(error){conflict=error;}
  assert(conflict?.name==='ConstraintError','Unowned file collision did not abort');
  equal(await readArchive(),firstState,'File collision committed partial metadata');
  await change(db,['files'],tx=>tx.objectStore('files').clear());
  await commit(merge.archive,merge.puts,[],null,merge.restore);
  const stored=(await readArchive()).images.find(i=>i.id===cropped.id);
  assert(stored.autoEnhance===true,'ZIP restore lost the enabled state');
  equal(stored.cropSettings,cropped.cropSettings,'Restore transaction lost recipe');
  equal(await bytes(await readFile(stored.originalPath)),await bytes(replacement),'Restore transaction changed original');
  equal(await bytes(await readFile(stored.editedPath)),await bytes(restoredFiles.get(cropped.editedPath)),'Restore transaction changed edited image');
  passed.push('ZIP v1 restore commits crop settings, edited image and byte-identical original together');
}
run().catch(error=>report({error:error.stack||String(error)}));
