export const categories=['drawing','collage','modeling','craft','other'];
export const emptyArchive=()=>({version:1,children:[],artworks:[],images:[],albums:[]});
export const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
export function validDate(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T12:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===s;}
export function ageAt(birth,date){
  if(!validDate(birth)||!validDate(date)||date<birth)return null;
  const [y,m,d]=date.split('-').map(Number),[by,bm,bd]=birth.split('-').map(Number);
  const months=(y-by)*12+m-bm-(d<bd?1:0);
  return {years:Math.floor(months/12),months:months%12,total:months};
}
export function filterWorks(state,{child='',favorite=false,year='',category='',sort='newest',search=''}={}){
  const term=search.trim().toLocaleLowerCase();
  const filtered=state.artworks.filter(w=>(!child||w.childId===child)&&(!favorite||w.isFavorite)&&(!year||w.artworkDate.startsWith(year))&&(!category||w.category===category)&&(!term||(w.title+' '+w.notes).toLocaleLowerCase().includes(term)));
  return filtered.sort((a,b)=>{
    if(sort==='oldest')return a.artworkDate.localeCompare(b.artworkDate)||a.addedAt.localeCompare(b.addedAt);
    if(sort==='category')return a.category.localeCompare(b.category)||b.artworkDate.localeCompare(a.artworkDate);
    if(sort==='age'){
      const aa=ageAt(state.children.find(c=>c.id===a.childId)?.birthDate,a.artworkDate)?.total??Infinity;
      const bb=ageAt(state.children.find(c=>c.id===b.childId)?.birthDate,b.artworkDate)?.total??Infinity;
      return aa-bb||a.artworkDate.localeCompare(b.artworkDate);
    }
    return b.artworkDate.localeCompare(a.artworkDate)||b.addedAt.localeCompare(a.addedAt);
  });
}
export function deleteWork(state,id){
  return {...state,artworks:state.artworks.filter(w=>w.id!==id),images:state.images.filter(i=>i.artworkId!==id),albums:state.albums.map(a=>({...a,orderedArtworkIds:a.orderedArtworkIds.filter(x=>x!==id)}))};
}
export function validateArchive(s){
  if(!s||s.version!==1)throw Error('Unsupported archive version');
  for(const key of ['children','artworks','images','albums']){
    if(!Array.isArray(s[key])||s[key].length>10000)throw Error('Invalid collection');
    const ids=new Set();
    for(const item of s[key]){if(!item||typeof item.id!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(item.id)||ids.has(item.id))throw Error('Invalid or duplicate identifier');ids.add(item.id);}
  }
  const text=(v,max=20000)=>typeof v==='string'&&v.length<=max;
  for(const c of s.children)if(!text(c.name,120)||!c.name.trim()||(c.birthDate!==null&&!validDate(c.birthDate))||typeof c.color!=='string'||!/^#[0-9a-f]{6}$/i.test(c.color))throw Error('Invalid profile');
  for(const w of s.artworks){
    if(!s.children.some(c=>c.id===w.childId)||!text(w.title,300)||!text(w.notes)||!validDate(w.artworkDate)||!Number.isFinite(Date.parse(w.addedAt))||!([...categories,'painting'].includes(w.category))||typeof w.isFavorite!=='boolean')throw Error('Invalid artwork');
    const images=s.images.filter(i=>i.artworkId===w.id);
    if(!images.length||images.length>5||!images.some(i=>i.id===w.coverImageId))throw Error('Invalid cover or image count');
  }
  const paths=new Set();
  for(const i of s.images){
    if(!s.artworks.some(w=>w.id===i.artworkId)||!Number.isInteger(i.width)||!Number.isInteger(i.height)||i.width<1||i.height<1||i.width>40000||i.height>40000||i.width*i.height>120000000||!Number.isInteger(i.sortOrder)||i.sortOrder<0||i.sortOrder>4||typeof i.originalPath!=='string'||!i.originalPath.startsWith('images/'+i.id+'/original.')||(i.editedPath!=null&&(typeof i.editedPath!=='string'||!i.editedPath.startsWith('images/'+i.id+'/edited.'))))throw Error('Invalid image');
    for(const p of [i.originalPath,i.editedPath].filter(Boolean)){
      if(!/^images\/[a-zA-Z0-9-]+\/(?:original|edited)\.(?:jpg|jpeg|png|webp|heic|heif)$/.test(p)||paths.has(p))throw Error('Unsafe or duplicate path');
      paths.add(p);
    }
  }
  for(const a of s.albums){
    if(!text(a.title,300)||!a.title.trim()||!s.children.some(c=>c.id===a.childId)||!['minimal','warm'].includes(a.coverStyle)||!Array.isArray(a.orderedArtworkIds)||new Set(a.orderedArtworkIds).size!==a.orderedArtworkIds.length||a.orderedArtworkIds.some(id=>!s.artworks.some(w=>w.id===id&&w.childId===a.childId)))throw Error('Invalid album');
  }
  return s;
}
export function mergeArchives(current,incoming){
  validateArchive(current);validateArchive(incoming);
  const result=structuredClone(current);
  for(const c of incoming.children)if(!result.children.some(x=>x.id===c.id))result.children.push(c);
  const newIds=new Set(incoming.artworks.filter(w=>!result.artworks.some(x=>x.id===w.id)).map(w=>w.id));
  result.artworks.push(...incoming.artworks.filter(w=>newIds.has(w.id)));
  result.images.push(...incoming.images.filter(i=>newIds.has(i.artworkId)));
  for(const album of incoming.albums){
    if(!result.albums.some(a=>a.id===album.id))result.albums.push({...album,orderedArtworkIds:album.orderedArtworkIds.filter(id=>result.artworks.some(w=>w.id===id&&w.childId===album.childId))});
  }
  return normalizeCategories(validateArchive(result));
}

export function normalizeCategories(archive){return {...archive,artworks:archive.artworks.map(w=>w.category==='painting'?{...w,category:'drawing'}:w)};}
