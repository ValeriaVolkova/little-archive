import {checkAlbums} from './albums-browser.mjs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,readFile} from 'node:fs/promises';
import {resolve,join,extname} from 'node:path';
import {tmpdir} from 'node:os';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'playwright');
const artifact=resolve(process.argv[2]),output=resolve(process.argv[3]);
await mkdir(output,{recursive:true});
const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.ttf':'font/ttf','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
  if(!/^[\w./-]+$/.test(path)||path.includes('..'))return res.writeHead(404).end();
  try{res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream'}).end(await readFile(join(artifact,path)));}
  catch{res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url='http://127.0.0.1:'+server.address().port;
const profile=await mkdtemp(join(tmpdir(),'little-archive-3a-'));
const open=()=>chromium.launchPersistentContext(profile,{executablePath:process.env.BROWSER_PATH,headless:true,viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,locale:'ru-RU'});
let browser;
try{
  browser=await open();
  let page=await browser.newPage();await page.goto(url);
  await page.locator('.archive-home').waitFor();
  await page.evaluate(async()=>{
    const {commit}=await import('/db.js'),{emptyArchive}=await import('/domain.js');
    const state=emptyArchive(),puts=[];
    state.children=[{id:'one',name:'Лиза',birthDate:'2020-05-12',color:'#879989'},{id:'two',name:'Миша',birthDate:'2021-08-01',color:'#d9b6a7'}];
    const shapes=['flowers','fish','house','sun','rainbow','leaf'],titles=['Букет','Рыбка','Дом у озера','Солнышко','Радуга','Осенний лист'];
    const samples=[];
    for(const [i,key] of shapes.entries()){
      const image=new Image();image.src='/assets/'+key+'.svg';await image.decode();
      const canvas=document.createElement('canvas');canvas.width=400;canvas.height=[350,230,510,400,265,460][i];
      const ctx=canvas.getContext('2d');ctx.fillStyle=['#fff9ee','#d8e3ef','#e5ecdb','#ffedc6','#f5e4e6','#fff9ee'][i];ctx.fillRect(0,0,canvas.width,canvas.height);
      const scale=Math.min(canvas.width/image.naturalWidth,canvas.height/image.naturalHeight)*.94;
      const w=image.naturalWidth*scale,h=image.naturalHeight*scale;ctx.drawImage(image,(400-w)/2,(canvas.height-h)/2,w,h);
      samples.push({blob:await new Promise(r=>canvas.toBlob(r)),width:400,height:canvas.height});
    }
    for(let i=0;i<500;i++){
      const id='sample-'+i,k=i%6,s=samples[k],originalPath='images/'+id+'/original.png';
      const date=new Date(Date.UTC(2025,7,15-i*2)).toISOString();
      state.artworks.push({id,title:titles[k],childId:i%3?'one':'two',category:'drawing',notes:i===0?'Первый букет, который мы нарисовали вместе.':'',artworkDate:date.slice(0,10),addedAt:date,isFavorite:i%7===0,coverImageId:id});
      state.images.push({id,artworkId:id,originalPath,editedPath:null,width:s.width,height:s.height,sortOrder:0});
      puts.push([originalPath,s.blob],[originalPath+'.thumb',s.blob]);
    }
    await commit(state,puts);
  });
  await page.reload();await page.locator('.archive-home').waitFor();
  await page.locator('.mobile-nav [data-page=home]').click();
  assert.equal(await page.locator('.collection-summary p').textContent(),'500 работ');
  assert.equal(await page.locator('.artist-card').count(),2);
  assert.equal(await page.locator('.story-photo').count(),4);
  await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:join(output,'Home.png')});
  await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
  await page.screenshot({path:join(output,'Comparisons.png')});
  const signature=()=>page.evaluate(async()=>{
    const {readArchive,readFile}=await import('/db.js');const archive=await readArchive();
    const blob=await readFile(archive.images[0].originalPath);
    return {archive,digest:[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))],lang:localStorage.getItem('little-archive-language')};
  });
  const albums=await checkAlbums(page,url,output,chromium);
  await page.locator('.mobile-nav [data-page=home]').click();
  const before=await signature();
  await browser.close();browser=await open();page=await browser.newPage();await page.goto(url);
  await page.locator('.archive-home').waitFor();assert.deepEqual(await signature(),before);
  await page.locator('.mobile-nav [data-page=settings]').click();
  await page.evaluate(()=>{
    document.documentElement.style.setProperty('--top-inset','47px');
    document.documentElement.style.setProperty('--bottom-inset','34px');
  });
  for(const [code,title] of [['en','Settings'],['es','Ajustes'],['ru','Настройки']]){
    await page.locator('.language-options [data-language='+code+']').click();
    assert.equal(await page.locator('.settings-intro h1').textContent(),title);
    const layout=await page.evaluate(()=>{
      const rect=selector=>document.querySelector(selector).getBoundingClientRect();
      const nav=rect('.mobile-nav'),add=rect('.nav-add'),topbar=rect('.topbar'),main=getComputedStyle(document.querySelector('.main'));
      return {
        top:topbar.top,bottom:innerHeight-nav.bottom,padding:parseFloat(main.paddingBottom),navHeight:nav.height,
        overflow:document.documentElement.scrollWidth>innerWidth,
        centered:Math.abs(add.left+add.width/2-innerWidth/2)<1&&add.top<nav.top,
        targets:[...document.querySelectorAll('.mobile-nav button,.settings-actions button,.language-options button')]
          .every(el=>el.offsetHeight>=44&&el.offsetWidth>=44)
      };
    });
    assert.ok(!layout.overflow&&layout.centered&&layout.targets&&layout.top>=47&&layout.bottom>=34&&
      layout.padding>=layout.navHeight+layout.bottom,JSON.stringify(layout));
  }
  await page.evaluate(()=>{
    document.documentElement.style.removeProperty('--top-inset');
    document.documentElement.style.removeProperty('--bottom-inset');
  });
  await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
  await page.screenshot({path:join(output,'Settings-backup.png')});
  assert.deepEqual(before.archive.albums.find(a=>a.id===albums.id).orderedArtworkIds,albums.order);
  await page.locator('.mobile-nav [data-page=archive]').click();
  await page.locator('.masonry img').first().evaluate(img=>img.decode());
  await page.screenshot({path:join(output,'Archive.png')});
  assert.equal(await page.locator('.masonry img').count(),500);
  for(const fraction of [0,.25,.5,.75,1,0]){
    await page.evaluate(f=>window.scrollTo(0,document.documentElement.scrollHeight*f),fraction);
    await page.waitForTimeout(180);
    const result=await page.evaluate(()=>{
      const imgs=[...document.querySelectorAll('.masonry img')];
      return {loaded:imgs.filter(i=>i.hasAttribute('src')).length,overflow:document.documentElement.scrollWidth>390,
        order:imgs.every((img,i)=>!i||img.getBoundingClientRect().top>=imgs[i-1].getBoundingClientRect().top-.01)};
    });
    assert.ok(result.loaded>0&&result.loaded<32,JSON.stringify({fraction,...result}));assert.ok(!result.overflow&&result.order);
  }
  await page.locator('.masonry button').first().click();await page.locator('#detail-image').waitFor();
  await page.locator('#detail-image').evaluate(image=>image.decode());
  await page.screenshot({path:join(output,'Artwork.png'),animations:'disabled'});
  await page.goBack();await page.locator('#modal').waitFor({state:'hidden'});
  assert.equal(await page.locator('.masonry .work-card').count(),500);
  await page.locator('.archive-options summary').click();
  await page.locator('#sort').selectOption('oldest');
  assert.equal(await page.locator('.masonry button').first().getAttribute('data-id'),'sample-499');
  await page.locator('.archive-options [data-action=favorites]').click();
  assert.equal(await page.locator('.masonry button').count(),72);
  await page.locator('.mobile-nav [data-page=home]').click();
  await page.locator('.mobile-nav [data-page=archive]').click();
  assert.equal(await page.locator('#sort').inputValue(),'oldest');
  assert.equal(await page.locator('.masonry button').count(),72);
  await page.locator('.masonry button').first().click();
  await page.locator('#modal [data-action=edit]').click();
  await page.locator('#photo-list img').first().evaluate(image=>image.decode());
  await page.screenshot({path:join(output,'Artwork-editor.png'),animations:'disabled'});
  await page.locator('#photo-list [data-action=crop]').first().click();
  await page.locator('.crop-dialog [data-op=enhance]').click();
  await page.screenshot({path:join(output,'Crop.png'),animations:'disabled'});
  for(const width of [390,320]){
    await page.setViewportSize({width,height:844});
    const brand=page.locator('.mobile-brand');
    assert.equal(await brand.innerText(),'');
    assert.equal(await brand.locator('img').getAttribute('alt'),'');
    await brand.locator('img').evaluate(image=>image.decode());
    const icon=await brand.locator('img').boundingBox();
    const header=await page.locator('.topbar').boundingBox();
    assert.equal(icon.width,icon.height);
    assert.ok(icon.x>=header.x&&icon.y>=header.y&&icon.x+icon.width<=header.x+header.width);
    const actions=await page.locator('.top-actions').boundingBox();
    if(actions?.width)assert.ok(icon.x+icon.width<=actions.x);
    assert.equal(await page.locator('.crop-dialog [data-op=done]').isEnabled(),true);
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('.crop-dialog [data-op=cancel]').click();
  const title=page.locator('#artwork-form input[name=title]');
  await title.fill('Unsaved edit');
  let prompted=false;
  page.once('dialog',async dialog=>{prompted=true;await dialog.dismiss();});
  await page.goBack();
  assert.equal(await title.inputValue(),'Unsaved edit');assert.ok(prompted);
  console.log('PASS: two independent Chromium launches retain 500 works, profiles and original bytes; sorted gallery, bounded thumbnail loads, browser Back, mobile screenshots.');
}finally{await browser?.close();server.close();}
