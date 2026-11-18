import {validDate,today} from './domain.js';

export async function loadImage(blob){
  const url=URL.createObjectURL(blob);
  try{return await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('Invalid image'));image.src=url;});}
  finally{URL.revokeObjectURL(url);}
}
export async function raster(blob,max=1600,rotation=0,crop=null){
  const image=await loadImage(blob),sw=crop?crop.w*image.naturalWidth:image.naturalWidth,sh=crop?crop.h*image.naturalHeight:image.naturalHeight;
  const scale=Math.min(1,max/Math.max(sw,sh)),w=Math.max(1,Math.round(sw*scale)),h=Math.max(1,Math.round(sh*scale)),canvas=document.createElement('canvas');
  const sideways=Math.abs(rotation%180)===90;canvas.width=sideways?h:w;canvas.height=sideways?w:h;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(rotation*Math.PI/180);
  if(crop)ctx.drawImage(image,crop.x*image.naturalWidth,crop.y*image.naturalHeight,sw,sh,-w/2,-h/2,w,h);else ctx.drawImage(image,-w/2,-h/2,w,h);
  const result=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Cannot encode image')),'image/jpeg',0.92));
  return {blob:result,width:canvas.width,height:canvas.height};
}
export async function preparePhoto(file){
  if(file.size>128*1024*1024)throw Error('Image too large');
  if(!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type))throw Error('Unsupported image type');
  const image=await loadImage(file);
  if(image.naturalWidth>40000||image.naturalHeight>40000||image.naturalWidth*image.naturalHeight>120000000)throw Error('Image dimensions too large');
  return {blob:file,width:image.naturalWidth,height:image.naturalHeight,thumb:(await raster(file,640)).blob};
}
export function download(blob,name){
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),120000);
}
// Read only JPEG EXIF DateTimeOriginal. A file modification time or generic
// EXIF edit timestamp cannot reliably identify the capture date.
export async function photoDate(file){
  if(file.type!=='image/jpeg')return null;
  try{
    const data=new DataView(await file.slice(0,256*1024).arrayBuffer());
    if(data.getUint16(0)!==0xffd8)return null;
    for(let at=2;at+4<=data.byteLength;){
      if(data.getUint8(at++)!==0xff)return null;
      while(at<data.byteLength&&data.getUint8(at)===0xff)at++;
      const marker=data.getUint8(at++);
      if(marker===0xda||marker===0xd9)return null;
      const length=data.getUint16(at);
      const end=at+length;
      if(length<2||end>data.byteLength)return null;
      if(marker===0xe1&&length>=16&&data.getUint32(at+2)===0x45786966&&data.getUint16(at+6)===0){
        const tiff=new DataView(data.buffer,at+8,end-at-8);
        const order=tiff.getUint16(0),little=order===0x4949;
        if((!little&&order!==0x4d4d)||tiff.getUint16(2,little)!==42)return null;
        const entry=(offset,tag)=>{
          if(offset<8||offset+2>tiff.byteLength)return null;
          const count=tiff.getUint16(offset,little);
          if(offset+2+count*12>tiff.byteLength)return null;
          for(let i=0;i<count;i++){
            const start=offset+2+i*12;
            if(tiff.getUint16(start,little)===tag)return start;
          }
          return null;
        };
        const exif=entry(tiff.getUint32(4,little),0x8769);
        if(exif===null||tiff.getUint16(exif+2,little)!==4||tiff.getUint32(exif+4,little)!==1)return null;
        const original=entry(tiff.getUint32(exif+8,little),0x9003);
        if(original===null||tiff.getUint16(original+2,little)!==2||tiff.getUint32(original+4,little)!==20)return null;
        const offset=tiff.getUint32(original+8,little);
        if(offset<8||offset+20>tiff.byteLength||tiff.getUint8(offset+19)!==0)return null;
        const value=new TextDecoder().decode(new Uint8Array(tiff.buffer,tiff.byteOffset+offset,19));
        const match=/^(\d{4}):(\d{2}):(\d{2}) (?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.exec(value);
        const date=match?.slice(1).join('-');
        return validDate(date)&&date<=today()?date:null;
      }
      at=end;
    }
  }catch{}
  return null;
}

export const chooseArtworkDate=(manual,current,captured,fallback=today())=>manual?current:captured||fallback;
