import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {extname,join,resolve} from 'node:path';

const executable=process.env.BROWSER_PATH;
if(!executable)throw Error('Set BROWSER_PATH to a Chromium browser executable');
const pagesArtifact=process.argv[2]?resolve(process.argv[2]):null;
const profile=await mkdtemp(join(tmpdir(),'little-archive-test-'));
console.log('Isolated test profile:',profile);
let finish,fail;
const result=new Promise((resolve,reject)=>{finish=resolve;fail=reject;});
const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.ttf':'font/ttf','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/result'&&req.method==='POST'){
    let data='';
    for await(const chunk of req)data+=chunk;
    res.end();
    const report=JSON.parse(data);
    if(report.error)fail(Error(report.error));else finish(report.passed);
    return;
  }
  if(path==='/test'){
    res.writeHead(200,{'Content-Type':'text/html'}).end('<script type="module" src="/tests/storage-browser.js"></script>');
    return;
  }
  if(pagesArtifact&&path.startsWith('/little-archive/')){
    const relative=path.slice('/little-archive/'.length)||'index.html';
    if(!/^[\w./-]+$/.test(relative)||relative.includes('..')){res.writeHead(404).end();return;}
    try{
      const data=await readFile(join(pagesArtifact,relative));
      res.writeHead(200,{'Content-Type':types[extname(relative)]||'application/octet-stream'}).end(data);
    }catch{res.writeHead(404).end();}
    return;
  }
  if(!/^\/(dist|tests)\/[\w./-]+$/.test(path)||path.includes('..')){res.writeHead(404).end();return;}
  try{
    const data=await readFile(new URL('..'+path,import.meta.url));
    res.writeHead(200,{'Content-Type':types[path.slice(path.lastIndexOf('.'))]||'application/octet-stream'}).end(data);
  }catch{res.writeHead(404).end();}
});
server.listen(0,'127.0.0.1');
await once(server,'listening');
const browser=spawn(executable,['--headless','--no-first-run','--disable-background-networking',
  '--disable-extensions','--user-data-dir='+profile,'http://127.0.0.1:'+server.address().port+(pagesArtifact?'/test?pages':'/test')],
  {stdio:'ignore',windowsHide:true});
browser.once('error',fail);
browser.once('exit',code=>fail(Error('Browser exited before completing tests: '+code)));
const timeout=setTimeout(()=>fail(Error('Storage integration test timed out')),30000);
try{
  const passed=await result;
  for(const name of passed)console.log('PASS:',name);
}finally{
  clearTimeout(timeout);
  browser.kill();
  server.closeAllConnections();
  server.close();
}
