// ZIP "store" format, with streamed CRC32 and bounded central-directory parsing.
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const table=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
export async function crc32(blob){let crc=0xffffffff;const reader=blob.stream().getReader();try{for(;;){const {done,value}=await reader.read();if(done)break;for(const b of value)crc=table[(crc^b)&255]^(crc>>>8);}}finally{reader.releaseLock();}return (crc^0xffffffff)>>>0;}
const header=n=>{const data=new Uint8Array(n);return {data,v:new DataView(data.buffer)};};
const safe=n=>typeof n==='string'&&n.length<240&&!n.startsWith('/')&&!n.includes('\\')&&!n.includes(':')&&!n.split('/').some(p=>p==='..'||p==='.'||!p);
// ZIP v1 uses stored entries and UTF-8 names. Include both headers, both
// copies of each name, and the end record when budgeting the complete ZIP.
export const zipLimits=Object.freeze({manifest:10*1024**2,archive:1024**3,entries:10000,entry:128*1024**2,directory:4_000_000});
export class BackupLimitError extends Error {
  constructor(limit){super('Backup exceeds '+limit+' limit');this.limit=limit;}
}
export function checkZipLimit(limit,value){
  if(value>zipLimits[limit])throw new BackupLimitError(limit);
}
// A backup can supply readers so path/count checks run before opening files.
export async function writeZip(files,onProgress=()=>{},validateEntry){
  checkZipLimit('entries',files.length);
  const names=new Set();
  let total=22,directory=0;
  for(const [name] of files){
    const bytes=encoder.encode(name);
    if(!safe(name)||decoder.decode(bytes)!==name||names.has(name))throw Error('Invalid or duplicate ZIP path');
    names.add(name);
    directory+=46+bytes.length;
    total+=76+2*bytes.length;
  }
  checkZipLimit('directory',directory);
  const entries=[];
  for(const [name,source] of files){
    const blob=typeof source==='function'?await source():source;
    if(!(blob instanceof Blob))throw Error('Missing backup file');
    checkZipLimit('entry',blob.size);
    total+=blob.size;
    checkZipLimit('archive',total);
    entries.push([name,blob]);
  }
  let offset=0;const parts=[],central=[];let index=0;
  for(const [name,blob]of entries){
    if(validateEntry)await validateEntry(name,blob);
    const bytes=encoder.encode(name),crc=await crc32(blob),{data,v}=header(30);
    v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint32(14,crc,true);v.setUint32(18,blob.size,true);v.setUint32(22,blob.size,true);v.setUint16(26,bytes.length,true);
    parts.push(data,bytes,blob);
    const c=header(46);c.v.setUint32(0,0x02014b50,true);c.v.setUint16(4,20,true);c.v.setUint16(6,20,true);c.v.setUint16(8,0x800,true);c.v.setUint32(16,crc,true);c.v.setUint32(20,blob.size,true);c.v.setUint32(24,blob.size,true);c.v.setUint16(28,bytes.length,true);c.v.setUint32(42,offset,true);
    central.push(c.data,bytes);offset+=30+bytes.length+blob.size;onProgress(++index,files.length);
  }
  const size=central.reduce((n,x)=>n+x.length,0),end=header(22);
  end.v.setUint32(0,0x06054b50,true);end.v.setUint16(8,files.length,true);end.v.setUint16(10,files.length,true);end.v.setUint32(12,size,true);end.v.setUint32(16,offset,true);
  return new Blob([...parts,...central,end.data],{type:'application/zip'});
}
export async function readZip(file){
  checkZipLimit('archive',file.size);
  if(file.size<22)throw Error('Incomplete ZIP');
  const tail=new Uint8Array(await file.slice(Math.max(0,file.size-65557)).arrayBuffer()),tv=new DataView(tail.buffer);
  let end=-1;
  for(let p=tail.length-22;p>=0;p--)if(tv.getUint32(p,true)===0x06054b50&&p+22+tv.getUint16(p+20,true)===tail.length){end=p;break;}
  if(end<0)throw Error('Incomplete ZIP');
  const count=tv.getUint16(end+10,true),size=tv.getUint32(end+12,true),offset=tv.getUint32(end+16,true);
  checkZipLimit('entries',count);
  checkZipLimit('directory',size);
  if(tv.getUint16(end+4,true)||tv.getUint16(end+6,true)||count!==tv.getUint16(end+8,true)||offset+size!==file.size-tail.length+end)throw Error('Invalid ZIP directory');
  const data=new Uint8Array(await file.slice(offset,offset+size).arrayBuffer()),v=new DataView(data.buffer),files=new Map(),ranges=[];let p=0;
  for(let k=0;k<count;k++){
    if(p+46>data.length||v.getUint32(p,true)!==0x02014b50)throw Error('Invalid ZIP entry');
    const flags=v.getUint16(p+8,true),method=v.getUint16(p+10,true),crc=v.getUint32(p+16,true),compressed=v.getUint32(p+20,true),length=v.getUint32(p+24,true),nl=v.getUint16(p+28,true),el=v.getUint16(p+30,true),cl=v.getUint16(p+32,true),start=v.getUint32(p+42,true);
    checkZipLimit('entry',length);
    if(flags!==0x800||method!==0||length!==compressed||p+46+nl+el+cl>data.length)throw Error('Unsupported ZIP encoding or size');
    const name=decoder.decode(data.slice(p+46,p+46+nl));
    if(!safe(name)||files.has(name)||start+30>offset)throw Error('Unsafe ZIP path');
    const local=new DataView(await file.slice(start,start+30).arrayBuffer());
    if(local.getUint32(0,true)!==0x04034b50||local.getUint16(6,true)!==flags||local.getUint16(8,true)!==method||local.getUint32(14,true)!==crc||local.getUint32(18,true)!==length||local.getUint32(22,true)!==length)throw Error('ZIP header mismatch');
    const lnl=local.getUint16(26,true),lel=local.getUint16(28,true),body=start+30+lnl+lel;
    if(body+length>offset)throw Error('Truncated ZIP');
    if(decoder.decode(new Uint8Array(await file.slice(start+30,start+30+lnl).arrayBuffer()))!==name)throw Error('ZIP filename mismatch');
    if(ranges.some(([a,b])=>start<b&&body+length>a))throw Error('Overlapping ZIP entries');
    ranges.push([start,body+length]);files.set(name,{blob:file.slice(body,body+length),crc});p+=46+nl+el+cl;
  }
  if(p!==data.length)throw Error('Invalid directory length');
  return {names:[...files.keys()],async get(name,limit){const entry=files.get(name);if(!entry)throw Error('Missing backup file');if(limit)checkZipLimit(limit,entry.blob.size);if(await crc32(entry.blob)!==entry.crc)throw Error('Backup checksum mismatch');return entry.blob;}};
}
