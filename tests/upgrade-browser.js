// Run only against the loopback server and its disposable Chromium profile.
const scope='/little-archive/';
const passed=[];
const assert=(condition,message)=>{if(!condition)throw Error(message);};
async function waitFor(find,label){
  for(let i=0;i<320;i++){
    const value=await find();
    if(value)return value;
    await new Promise(resolve=>setTimeout(resolve,25));
  }
  throw Error('Timed out: '+label);
}
function openFrame(){
  const frame=document.createElement('iframe');
  frame.style.cssText='width:390px;height:844px;border:0';
  frame.src=scope;
  document.body.append(frame);
  return frame;
}
const query=(frame,selector)=>frame.contentDocument?.querySelector(selector);
const click=async(frame,selector)=>(await waitFor(()=>query(frame,selector),selector)).click();
function fill(frame,input,value){
  input.value=value;
  input.dispatchEvent(new frame.contentWindow.Event('input',{bubbles:true}));
  input.dispatchEvent(new frame.contentWindow.Event('change',{bubbles:true}));
}
const request=req=>new Promise((resolve,reject)=>{
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error);
});
async function snapshot(){
  const found=(await indexedDB.databases()).find(db=>db.name==='LittleArchive');
  assert(found?.version===1,'Expected existing IndexedDB v1');
  const opened=indexedDB.open(found.name);
  opened.onupgradeneeded=event=>event.target.transaction.abort();
  const db=await request(opened);
  try{
    const tx=db.transaction(['metadata','files'],'readonly');
    const [archive,keys,files]=await Promise.all([
      request(tx.objectStore('metadata').get('archive')),
      request(tx.objectStore('files').getAllKeys()),
      request(tx.objectStore('files').getAll())
    ]);
    return {archive,keys,bytes:await Promise.all(files.map(async file=>
      [...new Uint8Array(file instanceof Blob?await file.arrayBuffer():file.bytes)]))};
  }finally{db.close();}
}
async function run(){
  const old=openFrame();
  await click(old,'.welcome-paper [data-action=newChild]');
  const profile=await waitFor(()=>query(old,'#profile-form'),'f8e460d profile form');
  fill(old,profile.elements.name,'Профиль до обновления');
  fill(old,profile.elements.birthday,'2020-04-18');
  await click(old,'#profile-form [data-action=submit]');
  await waitFor(()=>!query(old,'#profile-form'),'profile saved');
  await click(old,'[data-action=newWork]');
  const form=await waitFor(()=>query(old,'#artwork-form'),'f8e460d artwork editor');
  fill(old,form.elements.title,'Рисунок до обновления');
  const canvas=document.createElement('canvas');
  canvas.width=24;canvas.height=30;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#3972a9';ctx.fillRect(0,0,24,30);
  const original=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  const transfer=new old.contentWindow.DataTransfer();
  transfer.items.add(new old.contentWindow.File([original],'synthetic.png',{type:'image/png'}));
  const file=form.querySelector('#files');
  file.files=transfer.files;file.dispatchEvent(new old.contentWindow.Event('change',{bubbles:true}));
  await waitFor(()=>query(old,'#photo-list img'),'f8e460d photo preview');
  await click(old,'.crop-dialog [data-op=skip]');
  await click(old,'#artwork-form [data-action=submit]');
  await waitFor(()=>query(old,'.work-card'),'f8e460d saved artwork');
  await click(old,'.top-actions [data-language=en]');
  const before=await snapshot();
  const originalBytes=[...new Uint8Array(await original.arrayBuffer())];
  assert(before.archive?.children.length===1&&before.archive.artworks.length===1,'f8e460d records were not persisted');
  assert(before.bytes.some(data=>JSON.stringify(data)===JSON.stringify(originalBytes)),'Original was not kept');

  await old.contentWindow.navigator.serviceWorker.ready;
  const registration=await navigator.serviceWorker.getRegistration(scope);
  const previousCache=(await caches.keys()).find(key=>key.startsWith('little-archive-pages-shell:'));
  const oldCache=await caches.open(previousCache);
  assert(!(await oldCache.match(scope+'scrapbook.js')) && await oldCache.match(scope+'crop-editor.js'),'Initial cache is not f8e460d');
  const controlled=openFrame();
  await click(controlled,'.mobile-nav [data-page=archive]');
  await waitFor(()=>query(controlled,'.work-card'),'f8e460d archive after reopen');
  assert(registration.active?.state==='activated','f8e460d worker was not activated');
  assert((await controlled.contentWindow.navigator.serviceWorker.getRegistration())?.scope===registration.scope,'f8e460d registration scope changed');
  assert((await fetch('/publish-test-update',{method:'POST'})).ok,'Test deployment switch failed');
  await registration.update();
  const waiting=await waitFor(()=>registration.waiting,'Phase 3A worker waits while old clients are open');
  assert(query(controlled,'.work-card')&&!query(controlled,'.dashboard'),'Old worker served a mixed UI before activation');
  old.remove();controlled.remove();
  await waitFor(async()=>{
    const current=await navigator.serviceWorker.getRegistration(scope);
    return current?.active?.state==='activated'&&!current.waiting&&!(await caches.keys()).includes(previousCache);
  },'Phase 3A worker activation after closing old tabs');

  const updated=openFrame();
  await waitFor(()=>query(updated,'.archive-home'),'Archive after update');
  assert((await caches.keys()).length>0,'Missing app shell');
  const activeCache=(await caches.keys()).find(key=>key.startsWith('little-archive-pages-shell:'));
  assert(await (await caches.open(activeCache)).match(scope+'crop-editor.js'),'Crop editor absent from updated worker');
  await click(updated,'.mobile-nav [data-page=archive]');
  assert(query(updated,'.child-tabs').textContent.includes('Профиль до обновления'),'Existing profile missing from Archive');
  const artwork=await waitFor(()=>query(updated,'.work-card img')?.naturalWidth>0&&query(updated,'.work-card'),'Archive poster image');
  assert(artwork.querySelector('button').getAttribute('aria-label').includes('Рисунок до обновления'),'Archive omitted existing artwork');
  const after=await snapshot();
  assert(JSON.stringify(after)===JSON.stringify(before),'Upgrade rewrote metadata or image bytes');
  assert(localStorage.getItem('little-archive-language')==='en','Upgrade reset language preference');
  passed.push('f8e460d full UI save → same-origin Pages update with waiting/activation → Phase 3A Dashboard and Archive show unchanged original and profile');
  await fetch('/result',{method:'POST',body:JSON.stringify({passed})});
}
run().catch(error=>fetch('/result',{method:'POST',body:JSON.stringify({error:error.stack||String(error)})}));
