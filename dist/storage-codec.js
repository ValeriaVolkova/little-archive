// Store bytes rather than file-backed Blob references. Old Blob records remain readable.
export async function encodeImage(blob){
  if(!(blob instanceof Blob))throw new TypeError('Invalid image storage value');
  return {format:'little-archive-bytes-v1',type:blob.type,bytes:await blob.arrayBuffer()};
}
export function decodeImage(value){
  if(value instanceof Blob)return value;
  if(value?.format==='little-archive-bytes-v1'&&value.bytes instanceof ArrayBuffer)return new Blob([value.bytes],{type:value.type});
  throw new TypeError('Invalid image storage value');
}
export async function encodeDraft(draft){
  const photos=[];
  for(const photo of draft.photos){photos.push({...photo,original:await encodeImage(photo.original),edited:photo.edited?await encodeImage(photo.edited):null,thumb:await encodeImage(photo.thumb)});}
  return {...draft,photos};
}
export function decodeDraft(draft){return {...draft,photos:draft.photos.map(p=>({...p,original:decodeImage(p.original),edited:p.edited?decodeImage(p.edited):null,thumb:decodeImage(p.thumb)}))};}
