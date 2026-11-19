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
  async function create(title,child=''){
    await nav('albums');await click('newAlbum');
    await form.locator('[name=title]').fill(title);await form.locator('[name=child]').selectOption(child);
    await form.locator('[name=description]').fill('Рисунки, которые мы собирали вместе.');
    await click('submit',form);await page.locator('.album-story').waitFor();
  }
  async function pick(ids){
    await click('albumPick');
    for(const id of ids)await page.locator('[data-action=pick][data-id="'+id+'"]').click();
    await click('confirmPick');await page.locator('#modal').waitFor({state:'hidden'});
  }
  await create('Семейная мастерская');
  assert.ok(await page.locator('.album-story .dashboard-empty').isVisible());
  await pick(['sample-0','sample-1','sample-2','sample-3']);
  assert.equal(await page.locator('.album-story .masonry button').count(),4);
  await click('albumPick');
  assert.ok(await page.locator('[data-action=pick][data-id=sample-0]').isDisabled());
  await page.locator('#pick-child').selectOption('one');await page.locator('#pick-search').fill('Рыбка');
  assert.equal(await page.locator('[data-action=pick][data-id=sample-0]').count(),0);
  await click('close',page.locator('#modal'));
  await page.locator('.album-front summary').click();await click('albumEdit');
  await form.locator('[name=title]').fill('Наши открытия');
  await form.locator('[name=description]').fill('От первых линий до любимых сюжетов.');
  await form.locator('[name=cover]').selectOption('sample-2');
  await form.locator('.order-editor summary').click();
  await form.locator('[data-action=up][data-id=sample-2]').click();
  await form.locator('[data-action=unlink][data-id=sample-3]').click();
  await click('submit',form);
  await page.locator('.album-front h1').filter({hasText:'Наши открытия'}).waitFor();
  const family=(await metadata()).albums.find(a=>a.title==='Наши открытия');
  assert.deepEqual(family.orderedArtworkIds,['sample-0','sample-2','sample-1']);
  assert.equal(family.coverArtworkId,'sample-2');assert.equal(family.childId,null);
  await page.locator('.album-portrait img').evaluate(i=>i.decode());
  await screen('Album');
  await click('albumPDF');await page.locator('#pdf-previews img').first().waitFor();await click('close',page.locator('#modal'));
  await create('Лизина весна','one');await pick(['sample-1']);
  await create('Мишины рисунки','two');await pick(['sample-0']);
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
  await page.locator('.album-front summary').click();await click('albumEdit');
  page.once('dialog',d=>d.accept());await form.locator('[name=child]').selectOption('one');
  await click('submit',form);await form.waitFor({state:'detached'});
  assert.deepEqual((await metadata()).albums.at(-1).orderedArtworkIds,['sample-2']);
  await page.locator('.album-front summary').click();
  page.once('dialog',d=>d.accept());await click('albumDelete');await page.locator('.album-story').waitFor({state:'detached'});
  assert.equal((await metadata()).artworks.length,500);assert.deepEqual(await files(),originalKeys);
  await nav('settings');await page.locator('.profile-row [data-id=one]').click();
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
