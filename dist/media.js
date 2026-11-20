import {validDate,today} from './domain.js';

export class UnreadableImageError extends Error {
  constructor(cause){super('Invalid image',{cause});}
}

async function nativeImage(blob){
  const url=URL.createObjectURL(blob);
  try{return await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=event=>reject(new UnreadableImageError(event));image.src=url;});}
  finally{URL.revokeObjectURL(url);}
}
async function heifType(blob){
  const header=new TextDecoder().decode(await blob.slice(4,12).arrayBuffer());
  if(/^ftyp(?:heic|heix|hevc|hevx)$/.test(header))return 'image/heic';
  if(/^ftyp(?:mif1|msf1)$/.test(header))return 'image/heif';
  return null;
}
export async function loadImage(blob){
  try{return await nativeImage(blob);}
  catch(error){
    if(!(error instanceof UnreadableImageError)||!await heifType(blob))throw error;
    const {heicTo}=await import('./vendor/heic-to.js');
    let converted;
    try{converted=await heicTo({blob,type:'image/png'});}
    catch(cause){
      if(cause?.code==='HEIF_INVALID_INPUT')throw new UnreadableImageError(cause);
      throw cause;
    }
    // A failure displaying the decoder's PNG says nothing about the original.
    try{return await nativeImage(converted);}
    catch(cause){throw new Error('Could not display decoded HEIF',{cause});}
  }
}
// Lift light paper more than dark strokes. The smooth shoulder leaves room
// between pale pencil marks and white; adding equally to RGB retains hue.
const paperLift=Uint8Array.from({length:256},(_,value)=>{
  const light=value/255;
  return Math.round(190*light**3*(1-light));
});
function brightenPaper(ctx){
  const {width,height}=ctx.canvas;
  // Limit temporary pixel memory even for a large image being shared.
  for(let y=0;y<height;y+=128){
    const strip=ctx.getImageData(0,y,width,Math.min(128,height-y));
    const pixels=strip.data;
    for(let i=0;i<pixels.length;i+=4){
      const r=pixels[i],g=pixels[i+1],b=pixels[i+2];
      const high=Math.max(r,g,b),chroma=high-Math.min(r,g,b);
      const light=(54*r+183*g+19*b)>>8;
      const lift=Math.min(255-high,Math.round(paperLift[light]*Math.max(0,1-chroma/96)));
      pixels[i]+=lift;pixels[i+1]+=lift;pixels[i+2]+=lift;
    }
    ctx.putImageData(strip,0,y);
  }
}
export function enhancedPreview(image,max){
  const scale=Math.min(1,max/Math.max(image.naturalWidth,image.naturalHeight));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
  canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(image,0,0,canvas.width,canvas.height);
  brightenPaper(ctx);
  return canvas;
}
export async function raster(blob,max=1600,rotation=0,crop=null,enhance=false){
  const image=blob instanceof HTMLImageElement?blob:await loadImage(blob),sw=crop?crop.w*image.naturalWidth:image.naturalWidth,sh=crop?crop.h*image.naturalHeight:image.naturalHeight;
  const scale=Math.min(1,max/Math.max(sw,sh)),w=Math.max(1,Math.round(sw*scale)),h=Math.max(1,Math.round(sh*scale)),canvas=document.createElement('canvas');
  const sideways=Math.abs(rotation%180)===90;canvas.width=sideways?h:w;canvas.height=sideways?w:h;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(rotation*Math.PI/180);
  if(crop)ctx.drawImage(image,crop.x*image.naturalWidth,crop.y*image.naturalHeight,sw,sh,-w/2,-h/2,w,h);else ctx.drawImage(image,-w/2,-h/2,w,h);
  try{
    if(enhance)brightenPaper(ctx);
    const result=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Cannot encode image')),'image/jpeg',0.92));
    return {blob:result,width:canvas.width,height:canvas.height};
  }finally{canvas.width=canvas.height=0;}
}
export async function preparePhoto(file){
  if(file.size>128*1024*1024)throw Error('Image too large');
  if(!file.type||file.type==='application/octet-stream'){
    const type=await heifType(file);
    if(type)file=file.slice(0,file.size,type);
  }
  if(!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type))throw Error('Unsupported image type');
  const image=await loadImage(file);
  if(image.naturalWidth>40000||image.naturalHeight>40000||image.naturalWidth*image.naturalHeight>120000000)throw Error('Image dimensions too large');
  return {blob:file,preview:image,width:image.naturalWidth,height:image.naturalHeight,thumb:(await raster(image,640)).blob};
}
export function download(blob,name){
  const a=document.createElement('a'),url=URL.createObjectURL(blob);
  try{
    a.href=url;a.download=name;document.body.append(a);a.click();
  }catch(error){
    URL.revokeObjectURL(url);throw error;
  }finally{a.remove();}
  setTimeout(()=>URL.revokeObjectURL(url),120000);
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
