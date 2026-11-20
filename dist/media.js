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
// This anchor exactly reproduces the original on/off recipe.
export const legacyIntensity=30;
export function enhancementLevel(meta){
  const value=meta.enhanceIntensity;
  return Number.isInteger(value)&&value>=0&&value<=100?value:meta.autoEnhance===true?legacyIntensity:0;
}

// A local upper quartile measures the paper while ignoring thin darker strokes.
// A fixed normalized grid makes this estimate independent of the export resolution.
function paperGrid(canvas){
  const size=8, sample=document.createElement('canvas');
  sample.width=sample.height=size*6;
  try{
    const ctx=sample.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(canvas,0,0,sample.width,sample.height);
    const pixels=ctx.getImageData(0,0,sample.width,sample.height).data;
    const grid=new Float32Array(size*size);
    for(let gy=0;gy<size;gy++)for(let gx=0;gx<size;gx++){
      const values=[];
      for(let y=Math.max(0,gy*6-3);y<Math.min(sample.height,gy*6+9);y++)
        for(let x=Math.max(0,gx*6-3);x<Math.min(sample.width,gx*6+9);x++){
          const i=(y*sample.width+x)*4;
          values.push((54*pixels[i]+183*pixels[i+1]+19*pixels[i+2])/256);
        }
      values.sort((a,b)=>a-b);
      grid[gy*size+gx]=Math.max(125,Math.min(246,values[Math.floor(values.length*.75)]));
    }
    return grid;
  }finally{sample.width=sample.height=0;}
}

function brightenPaper(ctx,level){
  const {width,height}=ctx.canvas;
  const grid=level>legacyIntensity?paperGrid(ctx.canvas):null;
  const mix=grid?(level-legacyIntensity)/(100-legacyIntensity):level/legacyIntensity;
  const upperRow=new Float32Array(8);
  const xPosition=Float32Array.from({length:width},(_,x)=>Math.max(0,Math.min(7,(x+.5)*8/width-.5)));
  for(let y=0;y<height;y+=128){
    const strip=ctx.getImageData(0,y,width,Math.min(128,height-y));
    const pixels=strip.data;
    for(let row=0;row<strip.height;row++){
      if(grid){
        const pos=Math.max(0,Math.min(7,(y+row+.5)*8/height-.5));
        const a=Math.floor(pos),b=Math.min(7,a+1);
        for(let k=0;k<8;k++)upperRow[k]=grid[a*8+k]+(grid[b*8+k]-grid[a*8+k])*(pos-a);
      }
      for(let x=0;x<width;x++){
        const i=(row*width+x)*4,r=pixels[i],g=pixels[i+1],b=pixels[i+2];
        const high=Math.max(r,g,b),chroma=high-Math.min(r,g,b);
        const light=(54*r+183*g+19*b)>>8;
        const legacyLift=Math.min(255-high,Math.round(paperLift[light]*Math.max(0,1-chroma/96)));
        if(!grid){
          const lift=Math.round(legacyLift*mix);
          pixels[i]+=lift;pixels[i+1]+=lift;pixels[i+2]+=lift;
          continue;
        }
        const pos=xPosition[x],left=Math.floor(pos);
        const paper=upperRow[left]+(upperRow[Math.min(7,left+1)]-upperRow[left])*(pos-left);
        // Map local paper to 246. Keep headroom above paper and deepen
        // strokes below it. Taper correction for ink and saturated pigments.
        const target=light>paper?246+(light-paper)*9/(255-paper):246-(paper-light)*1.30;
        const weight=Math.min(1,(light/paper)**2)*Math.max(.12,1-chroma/170);
        const shift=(target-light)*weight;
        const saturation=.08*Math.min(1,chroma/65);
        for(let channel=0;channel<3;channel++){
          const input=pixels[i+channel];
          const maximum=Math.max(0,Math.min(255,input+shift+(input-light)*saturation));
          pixels[i+channel]=input+legacyLift+(maximum-input-legacyLift)*mix;
        }
      }
    }
    ctx.putImageData(strip,0,y);
  }
}
export function enhancedPreview(image,max,level=legacyIntensity,crop=null){
  const rect=crop||{x:0,y:0,w:1,h:1};
  const sw=rect.w*image.naturalWidth,sh=rect.h*image.naturalHeight;
  const scale=Math.min(1,max/Math.max(sw,sh));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(sw*scale));canvas.height=Math.max(1,Math.round(sh*scale));
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(image,rect.x*image.naturalWidth,rect.y*image.naturalHeight,sw,sh,0,0,canvas.width,canvas.height);
  if(level)brightenPaper(ctx,level);
  return canvas;
}
export async function raster(blob,max=1600,rotation=0,crop=null,level=0){
  const image=blob instanceof HTMLImageElement?blob:await loadImage(blob),sw=crop?crop.w*image.naturalWidth:image.naturalWidth,sh=crop?crop.h*image.naturalHeight:image.naturalHeight;
  const scale=Math.min(1,max/Math.max(sw,sh)),w=Math.max(1,Math.round(sw*scale)),h=Math.max(1,Math.round(sh*scale)),canvas=document.createElement('canvas');
  const sideways=Math.abs(rotation%180)===90;canvas.width=sideways?h:w;canvas.height=sideways?w:h;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(rotation*Math.PI/180);
  if(crop)ctx.drawImage(image,crop.x*image.naturalWidth,crop.y*image.naturalHeight,sw,sh,-w/2,-h/2,w,h);else ctx.drawImage(image,-w/2,-h/2,w,h);
  try{
    if(level)brightenPaper(ctx,level);
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
