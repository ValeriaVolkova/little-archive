import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstat, mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runInNewContext} from 'node:vm';

// Deliberate allowlist. Repository metadata, tests, ZIPs and anything newly
// dropped into dist are excluded unless explicitly reviewed and listed here.
const allowedFiles=[
  'index.html','manifest.webmanifest','style.css','editorial.css','sw.js',
  'app.js','pwa-update.js','backup-restore.js','db.js','domain.js','draft-queue.js','i18n.js',
  'vendor/heic-to.js','vendor/heic-to.LICENSE.txt','crop-editor.js','scrapbook.js','media.js','pdf.js','storage-codec.js','storage-error.js','ui.js','zip.js',
  'assets/background-doodles.svg','assets/fish.svg','assets/flowers.svg',
  'assets/house.svg','assets/icon.svg','assets/leaf.svg','assets/rainbow.svg',
  'assets/sun.svg','assets/fonts/Nunito.ttf','assets/fonts/OFL.txt',
  'vendor/pdf-lib.min.js','vendor/pdf-lib.LICENSE.md'
];
const source=fileURLToPath(new URL('../dist/',import.meta.url));
const output=resolve(process.argv[2]||'.artifacts/pages');
const files=new Map();
const hash=createHash('sha256');
for(const name of allowedFiles){
  const path=resolve(source,name);
  assert((await lstat(path)).isFile(),`Expected regular file: ${name}`);
  const content=await readFile(path);
  files.set(name,content);
  hash.update(name).update('\0').update(createHash('sha256').update(content).digest());
}
const release=hash.digest('hex').slice(0,16);
files.set('app.js',Buffer.from(replaceOnce(files.get('app.js').toString('utf8'),/const buildVersion='3A.1-local';/,"const buildVersion='3A.1 · "+release+"';")));
const site=new URL('https://example.github.io/project-review/');
function checkPath(ref,from){
  assert(ref.startsWith('./')||ref.startsWith('../'),`Non-relative URL in ${from}: ${ref}`);
  const uri=new URL(ref,new URL(from,site));
  assert(uri.origin===site.origin&&uri.pathname.startsWith(site.pathname),`Path escapes project: ${ref}`);
  const name=decodeURIComponent(uri.pathname.slice(site.pathname.length))||'index.html';
  assert(files.has(name),`Missing artifact file: ${name} (from ${from})`);
  return name;
}
for(const [name,content] of files){
  const body=content.toString('utf8');
  if(name==='index.html'){
    for(const match of body.matchAll(/\b(?:src|href)="([^"]+)"/g))checkPath(match[1],name);
  }else if(name.endsWith('.css')){
    for(const match of body.matchAll(/url\(\s*['"]?([^'")\s]+)/g))checkPath(match[1],name);
  }else if(name.endsWith('.js')&&!name.startsWith('vendor/')){
    for(const match of body.matchAll(/^\s*(?:import\s+(?:[^'";\r\n]+?\s+from\s+)?|export\s+[^'";\r\n]+?\s+from\s+)['"]([^'"]+)['"]/gm)){
      checkPath(match[1],name);
    }
  }
}
const manifest=JSON.parse(files.get('manifest.webmanifest'));
for(const ref of [manifest.start_url,manifest.scope,...manifest.icons.map(icon=>icon.src)]){
  checkPath(ref,'manifest.webmanifest');
}
const registration=files.get('app.js').toString('utf8').match(/serviceWorker\.register\('([^']+)'/);
assert(registration,'Service Worker registration is missing');
assert.equal(checkPath(registration[1],'app.js'),'sw.js');

// Pages project sites share a browser origin. Scope the shell cache to this
// project, and rotate it whenever published bytes change. Leave app storage,
// the source worker and any existing hosted site untouched.
function replaceOnce(body,search,replacement){
  const pattern=new RegExp(search.source,search.flags.includes('g')?search.flags:search.flags+'g');
  assert.equal([...body.matchAll(pattern)].length,1,`Review Pages SW configuration: ${search}`);
  return body.replace(search,()=>replacement);
}
let worker=files.get('sw.js').toString('utf8');
worker=replaceOnce(worker,/^const CACHE='little-archive-shell-[^']+';/m,
  "const CACHE_PREFIX='little-archive-pages-shell:'+self.registration.scope+':';\n"+
  `const CACHE=CACHE_PREFIX+'${release}';`);
worker=replaceOnce(worker,/k\.startsWith\('little-archive-shell-'\)/,'k.startsWith(CACHE_PREFIX)');
worker=replaceOnce(worker,/caches\.match\(event\.request\)/,'caches.open(CACHE).then(cache=>cache.match(event.request))');
files.set('sw.js',Buffer.from(worker));

const handlers={},cached=new Set(),deleted=[],prefix='little-archive-pages-shell:'+site.href+':';
const active=prefix+release,previous=prefix+'previous',other='little-archive-pages-shell:https://example.github.io/other/:old';
runInNewContext(worker,{
  URL,Request,
  self:{
    location:site,registration:{scope:site.href},
    addEventListener(name,handler){handlers[name]=handler;}
  },
  caches:{
    async open(name){
      assert.equal(name,active);
      return {
        async addAll(paths){for(const ref of paths){assert.equal(ref.cache,'reload');cached.add(checkPath('./'+new URL(ref.url).pathname.slice(site.pathname.length),'sw.js'));};},
        async match(){return 'cached app shell';}
      };
    },
    async keys(){return [active,previous,other,'little-archive-shell-editorial-v15','user-cache'];},
    async delete(name){deleted.push(name);}
  }
});
for(const name of ['install','activate']){
  let wait;
  handlers[name]({waitUntil(promise){wait=promise;}});
  await wait;
}
assert.deepEqual(deleted,[previous],'Only an earlier shell cache from this project may be removed');
for(const name of allowedFiles.filter(path=>!path.endsWith('.md')&&!path.endsWith('.txt')&&path!=='sw.js')){
  assert(cached.has(name),`File missing from offline shell: ${name}`);
}
let response;
handlers.fetch({request:{method:'GET',url:new URL('./app.js',site).href},respondWith(value){response=value;}});
assert.equal(await response,'cached app shell');
handlers.fetch({request:{method:'GET',url:new URL('/other/app.js',site).href},respondWith(){assert.fail('Worker handled a neighbouring project');}});

await mkdir(dirname(output),{recursive:true});
// Require a new directory so stale files can never enter the upload.
await mkdir(output);
for(const [name,content] of files){
  const path=resolve(output,name);
  await mkdir(dirname(path),{recursive:true});
  await writeFile(path,content,{flag:'wx'});
}
console.log(`Verified ${files.size} allowlisted files for a Pages project subpath. Shell version: ${release}.`);
console.log(output);
