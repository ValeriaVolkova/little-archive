import test from 'node:test';
import assert from 'node:assert/strict';
import {crc32,readZip,writeZip} from '../dist/zip.js';
test('CRC32 matches standard known vector',async()=>assert.equal(await crc32(new Blob(['123456789'])),0xcbf43926));
test('ZIP round trip preserves binary originals and UTF8 manifest',async()=>{const files=[['manifest.json',new Blob(['{"name":"Аврора"}'])],['images/id/original.jpg',new Blob([new Uint8Array([0,255,23,88])])]];const zip=await readZip(await writeZip(files));assert.deepEqual(zip.names,files.map(x=>x[0]));for(const[n,b]of files)assert.deepEqual(await (await zip.get(n)).arrayBuffer(),await b.arrayBuffer());});
test('corrupt payload is rejected by checksum before import',async()=>{const bytes=new Uint8Array(await (await writeZip([['manifest.json',new Blob(['hello'])]])).arrayBuffer());bytes[43]^=255;const zip=await readZip(new Blob([bytes]));await assert.rejects(zip.get('manifest.json'),/checksum/);});
test('truncated archive and missing files fail',async()=>{const blob=await writeZip([['manifest.json',new Blob(['hello'])]]);await assert.rejects(readZip(blob.slice(0,-1)));const zip=await readZip(blob);await assert.rejects(zip.get('missing'));});
test('ZIP rejects unsafe names, duplicate names and excessive size',async()=>{for(const path of ['../a','/a','images/../a','C:/a','a\\b'])await assert.rejects(writeZip([[path,new Blob(['x'])]]));await assert.rejects(writeZip([['a',new Blob(['x'])],['a',new Blob(['y'])]]));await assert.rejects(readZip({size:1024**3+1}));});
test('reader still rejects duplicate names in an externally produced ZIP',async()=>{
  const files=['a','b'].map(name=>[name,new Blob()]);
  const bytes=new Uint8Array(await (await writeZip(files)).arrayBuffer());
  // Two empty files: 31 bytes per local record, 47 per central record.
  bytes[31+30]=bytes[62+47+46]='a'.charCodeAt(0);
  await assert.rejects(readZip(new Blob([bytes])),/Unsafe ZIP path/);
});
