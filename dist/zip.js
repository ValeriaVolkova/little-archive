// ZIP "store" format, with streamed CRC32 and bounded central-directory parsing.
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const table=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
export async function crc32(blob){let crc=0xffffffff;const reader=blob.stream().getReader();try{for(;;){const {done,value}=await reader.read();if(done)break;for(const b of value)crc=table[(crc^b)&255]^(crc>>>8);}}finally{reader.releaseLock();}return (crc^0xffffffff)>>>0;}
const header=n=>{const data=new Uint8Array(n);return {data,v:new DataView(data.buffer)};};
const safe=n=>typeof n==='string'&&n.length<240&&!n.startsWith('/')&&!n.includes('\\')&&!n.includes(':')&&!n.split('/').some(p=>p==='..'||p==='.'||!p);
export async function writeZip(files,onProgress=()=>{}){
  if(files.length>10000||files.reduce((n,[name,blob])=>n+blob.size+76+encoder.encode(name).length*2,22)>1024*1024*1024)throw Error('Backup exceeds supported 1 GB or 10000 file limit');
  let offset=0;const parts=[],central=[];let index=0;
  for(const [name,blob]of files){
    if(!safe(name)||blob.size>0xffffffff)throw Error('Invalid ZIP entry');
    const bytes=encoder.encode(name),crc=await crc32(blob),{data,v}=header(30);
    v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint32(14,crc,true);v.setUint32(18,blob.size,true);v.setUint32(22,blob.size,true);v.setUint16(26,bytes.length,true);
    parts.push(data,bytes,blob);
    const c=header(46);c.v.setUint32(0,0x02014b50,true);c.v.setUint16(4,20,true);c.v.setUint16(6,20,true);c.v.setUint16(8,0x800,true);c.v.setUint32(16,crc,true);c.v.setUint32(20,blob.size,true);c.v.setUint32(24,blob.size,true);c.v.setUint16(28,bytes.length,true);c.v.setUint32(42,offset,true);
    central.push(c.data,bytes);offset+=30+bytes.length+blob.size;onProgress(++index,files.length);
    if(offset>0xffffffff)throw Error('ZIP64 is not supported');
  }
  const size=central.reduce((n,x)=>n+x.length,0),end=header(22);
  if(files.length>65535)throw Error('Too many files');
  end.v.setUint32(0,0x06054b50,true);end.v.setUint16(8,files.length,true);end.v.setUint16(10,files.length,true);end.v.setUint32(12,size,true);end.v.setUint32(16,offset,true);
  return new Blob([...parts,...central,end.data],{type:'application/zip'});
}
export async function readZip(file){
  if(file.size>1024*1024*1024||file.size<22)throw Error('Archive exceeds 1 GB or is incomplete');
  const tail=new Uint8Array(await file.slice(Math.max(0,file.size-65557)).arrayBuffer()),tv=new DataView(tail.buffer);
  let end=-1;
  for(let p=tail.length-22;p>=0;p--)if(tv.getUint32(p,true)===0x06054b50&&p+22+tv.getUint16(p+20,true)===tail.length){end=p;break;}
  if(end<0)throw Error('Incomplete ZIP');
  const count=tv.getUint16(end+10,true),size=tv.getUint32(end+12,true),offset=tv.getUint32(end+16,true);
  if(tv.getUint16(end+4,true)||tv.getUint16(end+6,true)||count!==tv.getUint16(end+8,true)||count>10000||size>4e6||offset+size!==file.size-tail.length+end)throw Error('Invalid ZIP directory');
  const data=new Uint8Array(await file.slice(offset,offset+size).arrayBuffer()),v=new DataView(data.buffer),files=new Map(),ranges=[];let p=0;
  for(let k=0;k<count;k++){
    if(p+46>data.length||v.getUint32(p,true)!==0x02014b50)throw Error('Invalid ZIP entry');
    const flags=v.getUint16(p+8,true),method=v.getUint16(p+10,true),crc=v.getUint32(p+16,true),compressed=v.getUint32(p+20,true),length=v.getUint32(p+24,true),nl=v.getUint16(p+28,true),el=v.getUint16(p+30,true),cl=v.getUint16(p+32,true),start=v.getUint32(p+42,true);
    if(flags!==0x800||method!==0||length!==compressed||length>128*1024*1024||p+46+nl+el+cl>data.length)throw Error('Unsupported ZIP encoding or size');
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
  return {names:[...files.keys()],async get(name){const entry=files.get(name);if(!entry)throw Error('Missing backup file');if(await crc32(entry.blob)!==entry.crc)throw Error('Backup checksum mismatch');return entry.blob;}};
}
