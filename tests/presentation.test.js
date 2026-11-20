import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {albumTheme,themes,decoration} from '../dist/ui.js';
test('legacy album IDs produce all four stable themes without changing records',()=>{const seen=new Set();for(let i=0;i<100;i++){const album={id:'old-album-'+i,title:'Сохранённый альбом',coverStyle:'minimal'};const before=JSON.stringify(album),theme=albumTheme(album.id);assert.equal(albumTheme(album.id),theme);assert.equal(JSON.stringify(album),before);seen.add(theme);}assert.deepEqual([...seen].sort(),[...themes].sort());});
test('each empty-state illustration is distinct and excluded from accessible text',()=>{const svg=['frame','heart','book','search'].map(x=>decoration(x));assert.equal(new Set(svg).size,4);for(const s of svg){assert.match(s,/aria-hidden="true"/);assert.doesNotMatch(s,/<script|https?:/);}});
for(const [font,license] of [
 ['Onest.ttf','Onest-OFL.txt']
]) test(font+' includes Cyrillic and Latin glyphs and its OFL license',async()=>{
 const b=await readFile(new URL('../dist/assets/fonts/'+font,import.meta.url));
 let cmap;for(let i=0;i<b.readUInt16BE(4);i++){const at=12+i*16;if(b.toString('ascii',at,at+4)==='cmap')cmap=b.readUInt32BE(at+8);}assert.ok(cmap);
 const codes=new Set();for(let k=0;k<b.readUInt16BE(cmap+2);k++){const offset=cmap+b.readUInt32BE(cmap+4+k*8+4),format=b.readUInt16BE(offset);if(format===12){for(let g=0;g<b.readUInt32BE(offset+12);g++){const at=offset+16+g*12;for(let c=b.readUInt32BE(at);c<=b.readUInt32BE(at+4);c++)codes.add(c);}}if(format===4){const n=b.readUInt16BE(offset+6)/2;for(let g=0;g<n;g++){const end=b.readUInt16BE(offset+14+g*2),start=b.readUInt16BE(offset+16+n*2+g*2);for(let c=start;c<=end;c++)codes.add(c);}}}
 for(const c of 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюяABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚÜÑáéíóúüñ¡¿')assert.ok(codes.has(c.codePointAt(0)),c);
 assert.match(await readFile(new URL('../dist/assets/fonts/'+license,import.meta.url),'utf8'),/SIL OPEN FONT LICENSE/);
});
test('PWA caches all added presentation assets without clearing user stores',async()=>{const sw=await readFile(new URL('../dist/sw.js',import.meta.url),'utf8');for(const path of ['editorial.css','playful.css','ui.js','assets/playful-motifs.svg','assets/fonts/Onest.ttf'])assert.ok(sw.includes(path));assert.doesNotMatch(sw,/indexedDB|localStorage/);});

test('Drawkeeper icon sizes are correct and the assets are available offline',async()=>{
  const read=name=>readFile(new URL('../dist/'+name,import.meta.url));
  const manifest=JSON.parse(await read('manifest.webmanifest'));
  assert.deepEqual(
    {name:manifest.name,shortName:manifest.short_name,id:manifest.id,start:manifest.start_url,scope:manifest.scope},
    {name:'Drawkeeper',shortName:'Drawkeeper',id:undefined,start:'./',scope:'./'}
  );
  const html=await read('index.html'),worker=await read('sw.js');
  assert.match(html.toString(),/rel="icon" href="\.\/assets\/drawkeeper-32\.png"/);
  assert.match(html.toString(),/rel="apple-touch-icon" href="\.\/assets\/drawkeeper-180\.png"/);
  assert.deepEqual(manifest.icons.map(icon=>[icon.src,icon.sizes,icon.type]),[
    ['./assets/drawkeeper-192.png','192x192','image/png'],
    ['./assets/drawkeeper-512.png','512x512','image/png']
  ]);
  for(const size of [32,180,192,512]){
    const path='assets/drawkeeper-'+size+'.png';
    const png=await read(path);
    assert.equal(png.subarray(1,4).toString(),'PNG');
    assert.deepEqual([png.readUInt32BE(16),png.readUInt32BE(20)],[size,size]);
    assert.ok(worker.includes("'./"+path+"'"));
  }
});
