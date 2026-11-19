const pages=new URLSearchParams(location.search).has('pages');
const base=pages?'/little-archive/':'/dist/';
const {openDB,readArchive,readFile,readDrafts,saveDraft,commit}=await import(base+'db.js');
const {createBackup,inspectBackup,planRestore}=await import(base+'backup-restore.js');
const {readZip}=await import(base+'zip.js');

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
  const fresh=planRestore(destination,incoming,verifiedFiles);
  equal(fresh.archive,incoming,'Empty archive restore lost metadata');
  assert(fresh.puts.length===6&&fresh.missingOriginals.length===0,'Empty restore omitted originals or previews');
  passed.push('ZIP v1 round trip includes all photos and preserves archive metadata');

  // Fault injection only in this throwaway browser profile.
  const distinct=new Blob(['existing bytes'],{type:'image/png'});
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
    for(const asset of ['index.html','app.js','style.css','editorial.css','assets/icon.svg','assets/fonts/Nunito.ttf','manifest.webmanifest']){
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
  const repair=planRestore(edited,incoming,verifiedFiles);
  await commit(repair.archive,repair.puts,[],null,repair.missingOriginals);
  equal(await bytes(await readFile(originals[1])),expected,'Matching missing original was not restored');
  equal(await (await readFile(originals[0])).text(),'existing bytes','Restore overwrote an existing file');
  equal((await readArchive()).artworks[0].title,'Локальное изменение','Restore overwrote metadata');
  const afterRepair=await readArchive();
  const again=planRestore(afterRepair,incoming,verifiedFiles);
  await commit(again.archive,again.puts,[],null,again.missingOriginals);
  equal(await readArchive(),{...afterRepair,revision:afterRepair.revision+1},'Repeated restore changed archive content');
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
  await commit(fresh.archive,fresh.puts);
  equal(await readArchive(),{...incoming,revision:1},'Full restore changed metadata');
  for(const path of originals)equal(await bytes(await readFile(path)),expected,'Full restore lost an original');
  passed.push('Full restore into empty test storage saves every original and record');
  await checkPhaseTwo(db,photo,expected);
  await report({passed});
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
  const memory=await waitFor(()=>query('.daily-card'));
  assert(doc().querySelectorAll('.daily-card').length===1&&!query('.family-overview'),'Home duplicates gallery');
  await click('.daily-card');
  await waitFor(()=>query('#detail-image'));
  await click('#modal [data-action=close]');
  await nav('archive');await nav('home');
  assert(query('.daily-card').dataset.id===memory.dataset.id,'Daily selection changed across tabs');
  value(query('#chapter-child'),'misha');
  assert(query('.mobile-nav [aria-current=page]').dataset.page==='home','Initial tab was not Home');
  assert(doc().documentElement.scrollWidth<=390,'Dashboard overflows a 390px viewport');
  await click('[data-action=openPeriod][data-period="3"]');
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
  passed.push('Home opens a stable memory, switches child chapters and retains combined Archive filters');

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

  await click('.global-add');
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
  const heic=new Blob([Uint8Array.from(atob('AAAAHGZ0eXBoZWljAAAAAG1pZjFoZWljbWlhZgAAAX1tZXRhAAAAAAAAACFoZGxyAAAAAAAAAABwaWN0AAAAAAAAAAAAAAAAAAAAACJpbG9jAAAAAERAAAEAAQAAAAABoQABAAAAAAAAAB0AAAAjaWluZgAAAAAAAQAAABVpbmZlAgAAAAABAABodmMxAAAAAA5waXRtAAAAAAABAAAA/WlwcnAAAADdaXBjbwAAAHZodmNDAQNwAAAAkAAAAAAAHvAA/P34+AAADwNgAAEAGEABDAH//wNwAAADAJAAAAMAAAMAHroCQGEAAQAqQgEBA3AAAAMAkAAAAwAAAwAeoCCBBZbq5Ka5uAhoMCAAAAMDIAAAAwAhYgABAAZEAcFzwIkAAAATY29scm5jbHgAAQANAAaAAAAAFGlzcGUAAAAAAAAAQAAAAEAAAAAoY2xhcAAAACAAAAABAAAAIAAAAAH////gAAAAAv///+AAAAACAAAAEHBpeGkAAAAAAwgICAAAABhpcG1hAAAAAAAAAAEAAQWBAgMFhAAAACVtZGF0AAAAGSgBrxOA+BDhp3/1Wo//teM8PlYuvzopDPg='),c=>c.charCodeAt(0))]);
  choose(heic,'square.heic');
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
  const restorePlan=planRestore({version:1,children:[],artworks:[],images:[],albums:[]},newBackup.incoming,newBackup.verifiedFiles);
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
  (await waitFor(()=>firstQuery('.welcome-paper [data-action=newChild]'))).click();
  const profile=await waitFor(()=>firstQuery('#profile-form'));
  assert(profile.elements.name.required&&profile.elements.birthday.required,'First profile does not request a name and birthday');
  value(profile.elements.name,'Новый профиль');value(profile.elements.birthday,'2021-04-29');
  profile.querySelector('[data-action=submit]').click();
  await waitFor(()=>firstQuery('.welcome-paper [data-action=newWork]'));
  const firstState=await readArchive();
  assert(firstState.children.length===1&&firstState.artworks.length===0,'Onboarding mixed demo records into the archive');
  passed.push('First opening offers a first profile and returns to a clean Dashboard after creation');
  first.remove();
  const merge=planRestore(firstState,newBackup.incoming,newBackup.verifiedFiles);
  await commit(merge.archive,merge.puts,[],null,merge.missingOriginals);
  const stored=(await readArchive()).images.find(i=>i.id===cropped.id);
  assert(stored.autoEnhance===true,'ZIP restore lost the enabled state');
  equal(stored.cropSettings,cropped.cropSettings,'Restore transaction lost recipe');
  equal(await bytes(await readFile(stored.originalPath)),await bytes(replacement),'Restore transaction changed original');
  equal(await bytes(await readFile(stored.editedPath)),await bytes(restoredFiles.get(cropped.editedPath)),'Restore transaction changed edited image');
  passed.push('ZIP v1 restore commits crop settings, edited image and byte-identical original together');
}
run().catch(error=>report({error:error.stack||String(error)}));
