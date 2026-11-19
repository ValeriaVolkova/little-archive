import assert from 'node:assert/strict';
import {join} from 'node:path';

export async function checkAlbums(page,url,output,chromium){
  const click=(action,root=page)=>root.locator('[data-action="'+action+'"]:visible').first().click();
  const nav=name=>page.locator('.mobile-nav [data-page="'+name+'"]').click();
  const form=page.locator('#album-form');
  const metadata=()=>page.evaluate(async()=>(await import('/db.js')).readArchive());
  const files=()=>page.evaluate(async()=>{
    const db=await (await import('/db.js')).openDB();
    return new Promise(r=>{const q=db.transaction('files').objectStore('files').getAllKeys();q.onsuccess=()=>r(q.result);});
  });
  const originalKeys=await files();
  async function screen(name){
    await page.locator('#toast.show').waitFor({state:'hidden'});
    await page.screenshot({path:join(output,name+'.png'),animations:'disabled'});
  }
  async function create(title,child='',template='cream'){
    await nav('albums');await click('newAlbum');
    await form.locator('[name=title]').fill(title);await form.locator('[name=child]').selectOption(child);
    await form.locator('[name=description]').fill('Рисунки, которые мы собирали вместе.');
    await form.locator('[data-template='+template+']').click();
    await click('submit',form);await page.locator('.album-story').waitFor();
  }
  async function pick(ids){
    await click('albumPick');
    for(const id of ids)await page.locator('[data-action=pick][data-id="'+id+'"]').click();
    await click('confirmPick');await page.locator('#modal').waitFor({state:'hidden'});
  }
  await nav('albums');await click('newAlbum');
  await form.locator('[name=title]').fill('Семейная мастерская');
  await form.locator('[name=description]').fill('Рисунки, которые мы собирали вместе.');
  assert.equal(await form.locator('.cover-swatch[aria-pressed=true]').getAttribute('data-template'),'cream');
  await page.evaluate(()=>{
    Object.defineProperty(window.visualViewport,'height',{configurable:true,value:480});
    window.visualViewport.dispatchEvent(new Event('resize'));
  });
  await page.waitForFunction(()=>document.querySelector('.album-dialog').getBoundingClientRect().bottom<=481);
  await form.locator('[name=description]').focus();
  await page.waitForFunction(()=>{
    const active=document.activeElement.getBoundingClientRect();
    const body=document.querySelector('.album-dialog .modal-body').getBoundingClientRect();
    const footer=document.querySelector('.album-dialog .modal-footer').getBoundingClientRect();
    return active.top>=body.top&&active.bottom<=body.bottom&&footer.bottom<=481&&document.documentElement.scrollWidth===390;
  });
  await form.locator('[data-template=sky]').click();
  await page.evaluate(()=>{delete window.visualViewport.height;window.visualViewport.dispatchEvent(new Event('resize'));});
  await form.locator('.modal-body').evaluate(el=>el.scrollTop=0);await screen('Cover-picker');
  await click('submit',form);await page.locator('.album-story').waitFor();
  assert.equal((await metadata()).albums[0].coverTemplate,'sky');
  assert.ok(await page.locator('.album-story .dashboard-empty').isVisible());
  await pick(['sample-0','sample-1','sample-2','sample-3']);
  assert.equal(await page.locator('.album-story .masonry .work-open').count(),4);
  await click('albumPick');
  assert.ok(await page.locator('[data-action=pick][data-id=sample-0]').isDisabled());
  await page.locator('#pick-child').selectOption('one');await page.locator('#pick-search').fill('Рыбка');
  assert.equal(await page.locator('[data-action=pick][data-id=sample-0]').count(),0);
  await click('close',page.locator('#modal'));
  await page.locator('.album-front summary').click();await click('albumEdit');
  await form.locator('[name=title]').fill('Наши открытия');
  await form.locator('[name=description]').fill('От первых линий до любимых сюжетов.');
  const swatches=form.locator('.cover-swatch');
  assert.equal(await swatches.count(),8);
  for(let i=0;i<8;i++){
    await swatches.nth(i).click();assert.equal(await swatches.nth(i).getAttribute('aria-pressed'),'true');
  }
  await click('coverArt',form);await form.locator('[data-action=coverArtwork][data-id=sample-2]').click();
  await click('submit',form);
  await page.locator('.album-front h1').filter({hasText:'Наши открытия'}).waitFor();
  async function cardAction(id,action){
    const card=page.locator('.album-gallery .work-card').filter({has:page.locator('.work-open[data-id="'+id+'"]')});
    await card.locator('summary').click();
    await click(action,card);
    await card.locator('[data-action="'+action+'"]').waitFor({state:action==='albumUnlink'?'detached':'visible'});
  }
  await page.locator('.album-gallery').scrollIntoViewIfNeeded();
  const cdp=await page.context().newCDPSession(page);
  const touch=(type,point)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:point?[point]:[]});
  const centre=async id=>{
    const rect=await page.locator('.album-gallery .work-open[data-id="'+id+'"]').boundingBox();
    return {x:rect.x+rect.width/2,y:rect.y+Math.min(rect.height-2,rect.height*.68)};
  };
  async function drag(from,to,{cancel=false}={}){
    const start=await centre(from),end=await centre(to);
    await touch('touchStart',start);await page.locator('.album-drag-ghost').waitFor();
    await touch('touchMove',end);
    await touch(cancel?'touchCancel':'touchEnd');
    await page.locator('.album-drag-ghost').waitFor({state:'detached'});
  }
  await drag('sample-2','sample-1',{cancel:true});
  assert.deepEqual((await metadata()).albums[0].orderedArtworkIds,['sample-0','sample-1','sample-2','sample-3']);
  await drag('sample-2','sample-1');
  await page.waitForFunction(()=>document.querySelectorAll('.album-gallery .work-open')[1]?.dataset.id==='sample-2');
  await cardAction('sample-3','albumUnlink');
  const family=(await metadata()).albums.find(a=>a.title==='Наши открытия');
  assert.deepEqual(family.orderedArtworkIds,['sample-0','sample-2','sample-1']);
  assert.equal(family.coverArtworkId,'sample-2');assert.equal(family.childId,null);
  await page.locator('.album-portrait img').evaluate(i=>i.decode());
  await page.evaluate(()=>window.scrollTo(0,0));await screen('Album');
  await click('albumPDF');await page.locator('#pdf-previews img').first().waitFor();await click('close',page.locator('#modal'));
  await create('Лизина весна','one','peach');await pick(['sample-1']);
  await create('Мишины рисунки','two','butter');await pick(['sample-0']);
  await nav('albums');
  assert.equal(await page.locator('.book-card').count(),3);
  await page.locator('.book-photo').first().evaluate(i=>i.decode());
  await screen('Albums');
  assert.deepEqual(await files(),originalKeys);
  await create('Временный альбом');
  const tempId=(await metadata()).albums.at(-1).id;
  await nav('archive');await click('pickForAlbum');
  for(const id of ['sample-2','sample-0'])await page.locator('[data-action=pick][data-id="'+id+'"]').click();
  await click('confirmPick');await page.locator('[data-action=chooseAlbum][data-id="'+tempId+'"]').click();
  await page.locator('#modal').waitFor({state:'hidden'});
  await page.locator('.work-open[data-id=sample-0]').click();await click('addAlbum',page.locator('#modal'));
  assert.ok(await page.locator('[data-action=chooseAlbum][data-id="'+tempId+'"]').isDisabled());
  await click('close',page.locator('#modal'));await nav('albums');
  await page.locator('.book-card[data-id="'+tempId+'"]').click();
  await pick(['sample-4','sample-5','sample-6','sample-7','sample-8','sample-9','sample-10']);
  await page.locator('.album-gallery .work-open').first().scrollIntoViewIfNeeded();
  const firstPoint=await centre('sample-2');
  await touch('touchStart',firstPoint);await touch('touchMove',{x:firstPoint.x,y:firstPoint.y-44});await touch('touchEnd');
  assert.equal(await page.locator('.album-drag-ghost').count(),0);
  await page.locator('.album-gallery .work-open').first().scrollIntoViewIfNeeded();
  const dragStart=await centre('sample-2'),beforeScroll=await page.evaluate(()=>scrollY);
  await touch('touchStart',dragStart);await page.locator('.album-drag-ghost').waitFor();
  await touch('touchMove',{x:dragStart.x,y:823});
  await page.waitForFunction(y=>scrollY>y+40,beforeScroll);
  await touch('touchCancel');
  assert.equal((await metadata()).albums.at(-1).orderedArtworkIds[0],'sample-2');
  await page.locator('.album-front').scrollIntoViewIfNeeded();
  await page.locator('.album-front summary').click();await click('albumEdit');
  await click('coverArt',form);await form.locator('[data-action=coverArtwork][data-id=sample-0]').click();
  await click('submit',form);await form.waitFor({state:'detached'});
  await cardAction('sample-0','albumUnlink');
  assert.equal((await metadata()).albums.at(-1).coverArtworkId,undefined);
  assert.ok(await page.locator('.album-portrait .book-jacket.jacket-cream').count());
  for(const id of ['sample-4','sample-5','sample-6','sample-7','sample-8','sample-9','sample-10']){
    await cardAction(id,'albumUnlink');
  }
  await pick(['sample-0']);
  await page.locator('.album-front summary').click();await click('albumEdit');
  page.once('dialog',d=>d.accept());await form.locator('[name=child]').selectOption('one');
  await click('submit',form);await form.waitFor({state:'detached'});
  assert.deepEqual((await metadata()).albums.at(-1).orderedArtworkIds,['sample-2']);
  await page.locator('.album-front summary').click();
  page.once('dialog',d=>d.accept());await click('albumDelete');await page.locator('.album-story').waitFor({state:'detached'});
  assert.equal((await metadata()).artworks.length,500);assert.deepEqual(await files(),originalKeys);
  await nav('settings');assert.equal(await page.locator('.top-actions [data-language]').count(),0);
  await page.locator('[data-language=en]').click();assert.equal(await page.locator('html').getAttribute('lang'),'en');
  await page.locator('[data-language=ru]').click();assert.equal(await page.locator('html').getAttribute('lang'),'ru');
  await page.locator('[data-language=ru]').scrollIntoViewIfNeeded();await screen('Settings');
  await page.locator('.profile-row [data-id=one]').click();
  assert.equal(await page.locator('.child-story .book-card').count(),2);
  assert.equal(await page.locator('.child-story .memory-card').count(),3);
  await click('editProfile');const editor=page.locator('#profile-form');
  await click('deleteProfile',editor);assert.ok(await editor.locator('.inline-error').innerText());
  const oldChapters=await page.locator('.child-story .period-card').allTextContents();
  await editor.locator('[name=name]').fill('Лизавета');await editor.locator('[name=birthday]').fill('2019-05-12');
  const image=Buffer.from(await page.evaluate(async()=>{
    const {readFile}=await import('/db.js');return [...new Uint8Array(await (await readFile('images/sample-0/original.png')).arrayBuffer())];
  }));
  async function upload(){
    await editor.locator('#avatar-file').setInputFiles({name:'test.png',mimeType:'image/png',buffer:image});
    await editor.locator('#avatar-preview img[src^="blob:"]').waitFor();
    await click('submit',editor);await editor.waitFor({state:'detached'});
  }
  await upload();
  const changed=(await metadata()).children[0];
  assert.equal(changed.id,'one');assert.equal(changed.name,'Лизавета');
  assert.notDeepEqual(oldChapters,await page.locator('.child-story .period-card').allTextContents());
  await click('editProfile');
  // A replacement creates a new owned path and retires the old file in the same transaction.
  await upload();
  const newPath=(await metadata()).children[0].profileImagePath;
  assert.notEqual(newPath,changed.profileImagePath);assert.ok(!(await files()).includes(changed.profileImagePath));
  await page.locator('.child-story img.profile-avatar').evaluate(img=>img.decode());
  await screen('Child');
  await click('openPeriod',page.locator('.child-story'));
  assert.equal(await page.locator('.child-tab.active').getAttribute('data-id'),'one');
  const portable=await page.evaluate(async()=>{
    const {createBackup}=await import('/backup-restore.js'),{readArchive,readFile}=await import('/db.js');
    const zip=await createBackup(await readArchive(),readFile);
    return new Promise(r=>{const reader=new FileReader();reader.onload=()=>r(reader.result);reader.readAsDataURL(zip);});
  });
  const clean=await chromium.launch({executablePath:process.env.BROWSER_PATH,headless:true});
  try{
    const dst=await clean.newPage();await dst.goto(url);
    const saved=await dst.evaluate(async data=>{
      const {inspectBackup,planRestore}=await import('/backup-restore.js');
      const {readArchive,commit,readFile}=await import('/db.js');
      const file=new Blob([Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0))]);
      const {incoming,verifiedFiles}=await inspectBackup(file);
      const current=await readArchive();if(current.children.length)throw Error('Destination must be empty');
      const plan=planRestore(current,incoming,verifiedFiles);await commit(plan.archive,plan.puts);
      const archive=await readArchive();
      for(const c of archive.children.filter(c=>c.profileImagePath)){
        const photo=await readFile(c.profileImagePath);if(!photo.size)throw Error('Missing avatar');
      }
      for(const [path,expected] of verifiedFiles){
        const actual=new Uint8Array(await (await readFile(path)).arrayBuffer());
        const bytes=new Uint8Array(await expected.arrayBuffer());
        if(actual.length!==bytes.length||!actual.every((v,i)=>v===bytes[i]))throw Error('Restored file differs');
      }
      return archive;
    },portable);
    const local=await metadata();for(const key of ['artworks','children','albums','images'])assert.deepEqual(saved[key],local[key]);
  }finally{await clean.close();}
  await nav('settings');await page.locator('.profile-row [data-id=one]').click();await click('editProfile');
  await click('removeAvatar',editor);await click('submit',editor);await editor.waitFor({state:'detached'});
  assert.deepEqual(await files(),originalKeys);assert.equal((await metadata()).children[0].profileImagePath,null);
  console.log('PASS: family and personal album CRUD, shared membership, picker, reorder, cover, child profile and avatar lifecycle, ZIP v1 restore in an independent empty browser');
  return {id:family.id,order:family.orderedArtworkIds};
}
