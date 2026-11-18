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
