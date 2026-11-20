const CACHE='little-archive-shell-editorial-v32-bright';
const FILES=['./','./index.html','./style.css','./app.js','./domain.js','./db.js','./i18n.js','./media.js','./pdf.js','./zip.js','./vendor/pdf-lib.min.js','./assets/drawkeeper-32.png','./assets/drawkeeper-180.png','./assets/drawkeeper-192.png','./assets/drawkeeper-512.png','./assets/flowers.svg','./assets/rainbow.svg','./assets/fish.svg','./assets/house.svg','./assets/sun.svg','./assets/leaf.svg'];
FILES.push('./playful.css','./bright.css','./assets/bright-top.svg','./assets/bright-bottom.svg','./assets/playful-motifs.svg','./assets/fonts/Onest.ttf','./album-ux.js','./pwa-update.js','./vendor/heic-to.js','./crop-editor.js','./scrapbook.js','./backup-restore.js','./storage-error.js','./storage-codec.js','./draft-queue.js','./editorial.css','./ui.js','./manifest.webmanifest');
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES.map(path=>new Request(new URL(path,self.registration.scope),{cache:'reload'}))))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('little-archive-shell-')&&k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
  if(!FILES.some(path=>new URL(path,self.registration.scope).pathname===url.pathname))return;
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
});

self.addEventListener('message',event=>{
  if(event.data?.type!=='activate-update'||!event.source?.id)return;
  event.waitUntil((async()=>{
    try{
      const windows=(await self.clients.matchAll({type:'window',includeUncontrolled:true}))
        .filter(client=>client.url.startsWith(self.registration.scope));
      if(!windows.some(client=>client.id===event.source.id))return;
      if(windows.some(client=>client.id!==event.source.id)){
        event.ports[0]?.postMessage('other-windows');return;
      }
      await self.skipWaiting();
    }catch{event.ports[0]?.postMessage('failed');}
  })());
});
