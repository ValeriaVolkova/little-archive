const CACHE='little-archive-shell-editorial-v18-crop';
const FILES=['./','./index.html','./style.css','./app.js','./domain.js','./db.js','./i18n.js','./media.js','./pdf.js','./zip.js','./vendor/pdf-lib.min.js','./assets/icon.svg','./assets/flowers.svg','./assets/rainbow.svg','./assets/fish.svg','./assets/house.svg','./assets/sun.svg','./assets/leaf.svg'];
FILES.push('./vendor/heic-to.js','./crop-editor.js','./backup-restore.js','./storage-error.js','./storage-codec.js','./draft-queue.js','./assets/background-doodles.svg','./editorial.css','./ui.js','./assets/fonts/Nunito.ttf','./manifest.webmanifest');
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('little-archive-shell-')&&k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
  if(!FILES.some(path=>new URL(path,self.registration.scope).pathname===url.pathname))return;
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
});
