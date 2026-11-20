import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {mkdir,readFile} from 'node:fs/promises';
import {extname,join,resolve} from 'node:path';

const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'playwright');
const [artifact,output]=process.argv.slice(2).map(path=>resolve(path));
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.ttf':'font/ttf',
  '.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://127.0.0.1').pathname.slice(1)||'index.html';
  if(!/^[\w./-]+$/.test(pathname)||pathname.includes('..'))return res.writeHead(404).end();
  try{
    const bytes=await readFile(join(artifact,pathname));
    res.writeHead(200,{'Content-Type':types[extname(pathname)]||'application/octet-stream'}).end(bytes);
  }catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url='http://127.0.0.1:'+server.address().port;
let browser;
try{
  await mkdir(output,{recursive:true});
  browser=await chromium.launch({executablePath:process.env.BROWSER_PATH,headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844},locale:'en-GB',hasTouch:true});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',res=>{if(res.status()>=400&&new URL(res.url()).origin===url)errors.push(res.status()+' '+res.url());});
  await page.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{
    document.documentElement?.style.setProperty('--top-inset','34px');
    document.documentElement?.style.setProperty('--bottom-inset','24px');
  },{once:true}));
  await page.goto(url);
  const tab=name=>page.locator('nav [data-page="'+name+'"]:visible');
  const go=name=>name==='settings'?page.locator('.settings-shortcut:visible').click():tab(name).click();
  const appearance=()=>page.locator('html').getAttribute('data-theme');
  const shot=async name=>{
    await page.evaluate(async()=>{await document.fonts.ready;await new Promise(requestAnimationFrame);});
    await page.screenshot({path:join(output,name+'.png'),animations:'disabled'});
  };
  await page.locator('.archive-home h1').waitFor();
  assert.equal(await tab('archive').getAttribute('aria-current'),'page');
  assert.equal(await appearance(),'bright');
  assert.deepEqual(await page.locator('.mobile-nav button').evaluateAll(buttons=>
    buttons.map(button=>button.dataset.page||button.dataset.action)),['archive','albums','newWork','favorites','stats']);
  await go('favorites');
  assert.equal(await page.locator('#archive-results h2').innerText(),'A place for your favorites');
  await page.locator('#archive-results [data-page=archive]').click();

  // Photos and records live exclusively in this temporary browser context.
  await page.evaluate(async()=>{
    const {commit,readArchive}=await import('./db.js');
    const state=await readArchive();
    const blobs=[];
    const drawings=['sun','rainbow','flowers','fish','leaf','house'];
    const colors=['#fff3dc','#faf3e7','#ffebe4','#e9f5ee','#f0f5df','#f8e9f1'];
    state.children.push({id:'sample-child',name:'Aurora',birthDate:'2024-12-10',color:'#71a897'});
    for(let index=0;index<10;index++){
      const key=drawings[index%drawings.length];
      const image=new Image();image.src='./assets/'+key+'.svg';await image.decode();
      const canvas=document.createElement('canvas');
      canvas.width=360;canvas.height=[360,235,486,220,410,310][index%drawings.length];
      const ctx=canvas.getContext('2d');ctx.fillStyle=colors[index%colors.length];ctx.fillRect(0,0,canvas.width,canvas.height);
      const extent=Math.min(canvas.width,canvas.height)*.91;
      ctx.drawImage(image,(canvas.width-extent)/2,(canvas.height-extent)/2,extent,extent);
      const blob=await new Promise(done=>canvas.toBlob(done,'image/png'));
      const id='test-'+index,originalPath='images/'+id+'/original.png';
      const date=new Date(Date.UTC(2026,10,20-index*3)).toISOString();
      state.artworks.push({id,childId:'sample-child',artworkDate:date.slice(0,10),addedAt:date,notes:'',
        title:key[0].toUpperCase()+key.slice(1),category:'drawing',coverImageId:id,isFavorite:index%2===0});
      state.images.push({id,artworkId:id,originalPath,editedPath:null,width:canvas.width,height:canvas.height,sortOrder:0});
      blobs.push([originalPath,blob],[originalPath+'.thumb',blob]);
    }
    state.albums.push({id:'test-album',title:'With papa',childId:'sample-child',description:'',orderedArtworkIds:['test-0','test-1','test-2'],
      coverArtworkId:'test-0',coverTemplate:'cream',coverStyle:'warm'});
    await commit(state,blobs);
  });
  await page.reload();
  await page.locator('#archive-results img').first().evaluate(img=>img.decode());
  assert.equal(await page.locator('#archive-count').innerText(),'10 artworks');
  await shot('Archive');
  await go('albums');
  await page.locator('.book-photo').first().evaluate(img=>img.decode());
  await shot('Albums');
  await go('favorites');
  assert.equal(await page.locator('#archive-count').innerText(),'5 artworks');
  await page.locator('#archive-results img').first().evaluate(img=>img.decode());
  await shot('Favorites');
  await page.locator('#search').fill('Rainbow');
  await page.waitForFunction(()=>document.querySelector('#archive-results .work-card')===null);
  await page.locator('#search').fill('');
  await page.waitForFunction(()=>document.querySelectorAll('#archive-results .work-card').length===5);
  await page.locator('#archive-results .work-open').first().click();
  await page.getByRole('button',{name:'Remove from favorites',exact:true}).click();
  await page.locator('#modal [data-action=close]').click();
  assert.equal(await page.locator('#archive-count').innerText(),'4 artworks');
  await go('stats');
  assert.equal(await page.locator('.collection-summary p').innerText(),'10 artworks');
  await shot('Stats');
  await go('settings');
  assert.equal(await page.locator('.mobile-nav [data-page=settings]').count(),0);
  await shot('Settings-1');
  await page.locator('.settings-pdf').evaluate(el=>window.scrollTo(0,el.getBoundingClientRect().top+scrollY-25));
  await shot('Settings-2');
  await page.locator('[data-action=design][data-theme=classic]').click();
  assert.equal(await appearance(),'classic');
  await page.reload();await page.locator('.archive-home h1').waitFor();
  assert.equal(await appearance(),'classic');
  assert.equal(await page.locator('#archive-count').innerText(),'10 artworks');
  await go('settings');
  await page.locator('[data-action=design][data-theme=bright]').click();
  assert.equal(await appearance(),'bright');
  await page.locator('.settings-pdf [data-page=albums]').click();
  await page.locator('.book-card').first().click();
  assert.equal(await page.locator('.album-front h1').innerText(),'With papa');
  await page.locator('[data-action=albumPDF]').click();
  await page.locator('#pdf-previews img').first().waitFor();
  const pdfDownload=page.waitForEvent('download');
  await page.locator('[data-action=downloadPDF]').click();
  const pdf=await readFile(await (await pdfDownload).path());
  assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
  await page.locator('#modal .modal-header [data-action=close]').click();
  await go('archive');

  for(const width of [320,375,390,430,768,1280]){
    await page.setViewportSize({width,height:844});
    for(const name of ['albums','favorites','stats','settings','archive']){
      await go(name);
      assert.equal(await page.locator('#app').getAttribute('data-page'),name);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),
        name+' overflows at '+width+'px');
      if(width<=800){
        const layout=await page.evaluate(()=>{
          const nav=document.querySelector('.mobile-nav').getBoundingClientRect();
          const center=document.querySelector('.nav-add').getBoundingClientRect();
          const main=getComputedStyle(document.querySelector('.main'));
          return {center:Math.abs(center.left+center.width/2-innerWidth/2)<=1,
            padding:parseFloat(main.paddingBottom)>=innerHeight-nav.top,inset:innerHeight-nav.bottom>=24,
            targets:[...document.querySelectorAll('.mobile-nav button')].every(button=>button.offsetHeight>=44&&button.offsetWidth>=44)};
        });
        assert.ok(Object.values(layout).every(Boolean),JSON.stringify({width,name,layout}));
      }
    }
  }
  await page.setViewportSize({width:320,height:720});
  await go('settings');
  for(const code of ['es','ru','en']){
    await page.locator('.language-options [data-language='+code+']').click();
    assert.equal(await page.locator('html').getAttribute('lang'),code);
    const layout=await page.evaluate(()=>{
      const controls=[...document.querySelectorAll('.settings-actions button,.design-choice,.language-options button')];
      return document.documentElement.scrollWidth<=innerWidth&&controls.every(control=>
        control.offsetWidth>=44&&control.offsetHeight>=44);
    });
    assert.ok(layout,'Settings controls at 320px in '+code);
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: navigation, Favorites, theme persistence, Settings-to-album PDF route and responsive widths from 320px to desktop');
}finally{await browser?.close();server.close();}
