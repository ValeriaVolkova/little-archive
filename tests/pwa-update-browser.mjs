import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdtemp} from 'node:fs/promises';
import {join,extname,resolve} from 'node:path';
import {tmpdir} from 'node:os';

const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'playwright');
const [old,current]=process.argv.slice(2).map(arg=>resolve(arg));
let stage=0,failInstall=false;
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{
  if(req.url==='/harness'){res.writeHead(200,{'Content-Type':'text/html'}).end('<title>Local test</title>');return;}
  const path=new URL(req.url,'http://localhost').pathname.replace(/^\/little-archive\//,'')||'index.html';
  if(!/^[\w./-]+$/.test(path)||path.includes('..'))return res.writeHead(404).end();
  try{
    let bytes=await readFile(join(stage?current:old,path));
    if(stage===2&&(path==='sw.js'||path==='app.js')){
      const text=bytes.toString().replace(/(CACHE_PREFIX\+'|3B · )[a-f0-9]{16}/g,'$1aaaaaaaaaaaaaaaa');
      bytes=Buffer.from(text);
    }
    if(failInstall&&path==='scrapbook.js')return res.writeHead(503).end();
    res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-store'}).end(bytes);
  }catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url='http://127.0.0.1:'+server.address().port+'/little-archive/';
const profile=await mkdtemp(join(tmpdir(),'little-archive-pwa-'));
const open=()=>chromium.launchPersistentContext(profile,{executablePath:process.env.BROWSER_PATH,headless:true,args:['--disable-os-integration-for-testing'],viewport:{width:390,height:844},locale:'en'});
let browser;
async function launch(){
  const opened=browser.waitForEvent('page');
  const {targetId}=await cdp.send('PWA.launch',{manifestId:url});
  const app=await opened;await app.waitForURL(url);
  assert.equal((await cdp.send('Target.getTargetInfo',{targetId})).targetInfo.url,url);
  assert.ok(await app.evaluate(()=>matchMedia('(display-mode: standalone)').matches),'Expected installed standalone window');
  return app;
}
const snapshot=page=>page.evaluate(async()=>{
  const {readArchive,readFile}=await import('./db.js'),archive=await readArchive();
  const bytes=await Promise.all(archive.images.map(async image=>[...new Uint8Array(await (await readFile(image.originalPath)).arrayBuffer())]));
  return {archive,bytes,marker:localStorage.getItem('test-marker')};
});
let cdp;
try{
  browser=await open();
  const tab=await browser.newPage();await tab.goto(url);
  await tab.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));
  cdp=await browser.newCDPSession(tab);
  await cdp.send('PWA.install',{manifestId:url,installUrlOrBundleUrl:url});
  await cdp.send('PWA.changeAppUserSettings',{manifestId:url,displayMode:'standalone'});
  let app=await launch();const harness=await browser.newPage();await harness.goto(new URL('/harness',url).href);cdp=await browser.newCDPSession(harness);await tab.close();
  for(const candidate of browser.pages())if(candidate!==app&&candidate!==harness&&candidate.url().startsWith(url))await candidate.close();
  await app.locator('.welcome-paper [data-action=newChild]').click();
  await app.locator('#profile-form [name=name]').fill('Test');
  await app.locator('#profile-form [name=birthday]').fill('2020-01-01');
  await app.locator('#profile-form [data-action=submit]').click();
  for(let i=0;i<2;i++){
    await app.locator('[data-action=newWork]:visible').first().click();
    const png=await app.evaluate(i=>{
      const canvas=document.createElement('canvas');canvas.width=16+i;canvas.height=24;
      const ctx=canvas.getContext('2d');ctx.fillStyle=i?'orange':'green';ctx.fillRect(0,0,17,24);return canvas.toDataURL().split(',')[1];
    },i);
    await app.locator('#files').setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
    await app.locator('.crop-dialog [data-op=skip]').click();
    await app.locator('#artwork-form [data-action=submit]').click();
    await app.locator('#artwork-form').waitFor({state:'detached'});
  }
  await app.evaluate(()=>localStorage.setItem('test-marker','keep'));
  const before=await snapshot(app);assert.equal(before.archive.artworks.length,2);
  const oldZip=await app.evaluate(async()=>{
    const {createBackup}=await import('./backup-restore.js'),{readArchive,readFile}=await import('./db.js');
    return [...new Uint8Array(await (await createBackup(await readArchive(),readFile)).arrayBuffer())];
  });
  const oldCaches=await app.evaluate(()=>caches.keys());
  stage=1;
  await app.evaluate(async()=>{await (await navigator.serviceWorker.ready).update();});
  await app.waitForFunction(async()=>!!(await navigator.serviceWorker.ready).waiting);
  if(await app.locator('.update-banner').count()){
    await app.locator('[data-action=applyUpdate]').click();
    await app.waitForFunction(()=>document.querySelector('.daily-card')&&performance.getEntriesByType('navigation')[0]?.type==='reload');
  }
  await app.close();
  for(let i=0;i<150;i++){
    const keys=await harness.evaluate(()=>caches.keys());
    if(keys.length===1&&!oldCaches.includes(keys[0]))break;
    if(i===149)throw Error('Previous worker still has clients: '+JSON.stringify(await cdp.send('Target.getTargets')));
    await new Promise(r=>setTimeout(r,100));
  }
  app=await launch();
  await app.locator('.mobile-nav [data-page=settings]').click();
  const first=await app.locator('[data-build]').innerText();
  assert.deepEqual(await snapshot(app),before);
  const restoreBrowser=await chromium.launch({executablePath:process.env.BROWSER_PATH,headless:true});
  try{
    const clean=await restoreBrowser.newPage();await clean.goto(url);
    const restored=await clean.evaluate(async bytes=>{
      const {inspectBackup,planRestore}=await import('./backup-restore.js');
      const {readArchive,commit}=await import('./db.js');
      const {incoming,verifiedFiles}=await inspectBackup(new Blob([Uint8Array.from(bytes)]));
      const destination=await readArchive();
      if(destination.children.length)throw Error('Expected empty restore profile');
      const plan=planRestore(destination,incoming,verifiedFiles);await commit(plan.archive,plan.puts);
      return true;
    },oldZip);
    assert.ok(restored);
    const portable=await snapshot(clean);
    for(const key of ['children','artworks','images','albums'])assert.deepEqual(portable.archive[key],before.archive[key]);
    assert.deepEqual(portable.bytes,before.bytes);
  }finally{await restoreBrowser.close();}
  console.log('PASS: installed app upgraded from previous release by closing and reopening the same installation');
  await app.locator('.global-add').click();
  await app.locator('#artwork-form [name=title]').fill('Unfinished');
  stage=2;failInstall=true;
  await app.evaluate(async()=>{await (await navigator.serviceWorker.ready).update();});
  await app.waitForFunction(async()=>!(await navigator.serviceWorker.ready).installing);
  assert.equal(await app.locator('.update-banner:visible').count(),0);
  failInstall=false;
  await app.evaluate(()=>window.dispatchEvent(new Event('online')));
  await app.locator('.update-banner:visible').waitFor();
  await app.locator('[data-action=applyUpdate]').evaluate(el=>el.click());
  assert.equal(await app.locator('#artwork-form [name=title]').inputValue(),'Unfinished');
  assert.ok(await app.evaluate(async()=>!!(await navigator.serviceWorker.ready).waiting));
  await app.waitForFunction(()=>document.querySelector('.draft-status')?.textContent?.includes('saved'));
  app.once('dialog',dialog=>dialog.accept());
  await app.locator('#artwork-form [data-action=close]').click();
  // Hold byte encoding mid-save, before the real IndexedDB commit.
  await app.locator('.global-add').click();
  await app.locator('#files').setInputFiles({name:'third.png',mimeType:'image/png',buffer:Buffer.from(before.bytes[0])});
  await app.locator('.crop-dialog [data-op=skip]').click();
  await app.waitForFunction(()=>document.querySelector('.draft-status')?.textContent?.includes('saved'));
  await app.evaluate(()=>{
    const read=Blob.prototype.arrayBuffer;
    const gate=new Promise(resolve=>{window.releaseSave=resolve;});
    Blob.prototype.arrayBuffer=async function(){window.encoding=true;await gate;return read.call(this);};
  });
  await app.locator('#artwork-form [data-action=submit]').click();
  await app.waitForFunction(()=>window.encoding);
  await app.locator('[data-action=applyUpdate]').evaluate(el=>el.click());
  assert.ok(await app.evaluate(async()=>!!(await navigator.serviceWorker.ready).waiting));
  await app.evaluate(()=>window.releaseSave());
  await app.locator('#artwork-form').waitFor({state:'detached'});
  const saved=await snapshot(app);
  assert.equal(saved.archive.artworks.length,3);assert.deepEqual(saved.bytes.slice(0,2),before.bytes);
  const other=await browser.newPage();await other.goto(url);await other.locator('.dashboard').waitFor();
  await app.locator('[data-action=applyUpdate]').click();
  await app.locator('.update-banner').filter({hasText:'other Little Archive windows'}).waitFor();
  await other.close();
  await app.locator('[data-action=applyUpdate]').click();
  await app.locator('.dashboard').waitFor();
  await app.locator('.mobile-nav [data-page=settings]').click();
  assert.match(await app.locator('[data-build]').innerText(),/aaaaaaaaaaaaaaaa/);
  assert.doesNotMatch(first,/aaaaaaaaaaaaaaaa/);
  assert.deepEqual(await snapshot(app),saved);
  console.log('PASS: failed download leaves old version usable; prompt, editor and other-window guards, explicit update and correct build');
  await browser.close();browser=await open();
  const blank=await browser.newPage();cdp=await browser.newCDPSession(blank);
  app=await launch();await app.locator('.daily-card').waitFor();
  assert.deepEqual(await snapshot(app),saved);
  assert.equal(await app.evaluate(async()=>(await (await import('./db.js')).readDrafts()).items[0].work.title),'Unfinished');
  console.log('PASS: installed app after browser restart preserves child, three artworks, exact originals, draft and localStorage marker');
}finally{await browser?.close();server.close();}
