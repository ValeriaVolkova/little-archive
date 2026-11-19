export const categories=['drawing','painting','craft','other'];
const legacyCategories=['collage','modeling'];
export const emptyArchive=()=>({version:1,children:[],artworks:[],images:[],albums:[]});
export const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
export function validDate(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T12:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===s;}
export function ageAt(birth,date){
  if(!validDate(birth)||!validDate(date)||date<birth)return null;
  const [y,m,d]=date.split('-').map(Number),[by,bm,bd]=birth.split('-').map(Number);
  const lastDay=m===2?(y%4===0&&(y%100!==0||y%400===0)?29:28):[4,6,9,11].includes(m)?30:31;
  const months=(y-by)*12+m-bm-(d<Math.min(bd,lastDay)?1:0);
  return {years:Math.floor(months/12),months:months%12,total:months};
}
// February 29 birthdays are observed on February 28 in non-leap years.
export const agePeriod=(birth,date)=>ageAt(birth,date)?.years??null;
export const displayCategory=value=>legacyCategories.includes(value)?'craft':value;
export const workCategory=work=>work.uncategorized?'':work.category;
export const archiveFilters=()=>({child:'',favorite:false,year:'',category:'',period:'',sort:'newest',search:''});
export function dashboardData(state){
  const birthdays=new Map(state.children.map(c=>[c.id,c.birthDate]));
  const recent=[...state.artworks].sort((a,b)=>Date.parse(b.addedAt)-Date.parse(a.addedAt)||a.id.localeCompare(b.id));
  const groups=new Map();
  for(const work of recent){
    const period=agePeriod(birthdays.get(work.childId),work.artworkDate);
    if(period===null)continue;
    if(!groups.has(period))groups.set(period,[]);
    groups.get(period).push(work);
  }
  return {children:state.children.length,works:state.artworks.length,albums:state.albums.length,
    recent:recent.slice(0,6),periods:[...groups].sort(([a],[b])=>a-b)};
}
export function filterWorks(state,{child='',favorite=false,year='',category='',period='',sort='newest',search=''}={}){
  const term=search.trim().toLocaleLowerCase();
  const birthdays=new Map(state.children.map(c=>[c.id,c.birthDate]));
  const ages=new Map();
  const age=w=>{if(!ages.has(w.id))ages.set(w.id,ageAt(birthdays.get(w.childId),w.artworkDate));return ages.get(w.id);};
  const filtered=state.artworks.filter(w=>(!child||w.childId===child)&&(!favorite||w.isFavorite)&&(!year||w.artworkDate.startsWith(year))&&(!category||displayCategory(workCategory(w))===category)&&(period===''||String(age(w)?.years)===String(period))&&(!term||(w.title+' '+w.notes).toLocaleLowerCase().includes(term)));
  return filtered.sort((a,b)=>{
    if(sort==='oldest')return a.artworkDate.localeCompare(b.artworkDate)||a.addedAt.localeCompare(b.addedAt);
    if(sort==='category')return displayCategory(workCategory(a)).localeCompare(displayCategory(workCategory(b)))||b.artworkDate.localeCompare(a.artworkDate);
    if(sort==='age'){
      const aa=age(a)?.total??Infinity;
      const bb=age(b)?.total??Infinity;
      return aa-bb||a.artworkDate.localeCompare(b.artworkDate);
    }
    return b.artworkDate.localeCompare(a.artworkDate)||b.addedAt.localeCompare(a.addedAt);
  });
}
export function albumMembers(album,ids){
  const result={...album,orderedArtworkIds:[...new Set(ids)]};
  if(result.coverArtworkId&&!result.orderedArtworkIds.includes(result.coverArtworkId))delete result.coverArtworkId;
  return result;
}
export function profilePhoto(child){
  const path=child.profileImagePath;
  return typeof path==='string'&&path.startsWith('profiles/'+child.id+'/')&&/^profiles\/[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+\.jpg$/.test(path)?path:null;
}
export function childAlbums(state,childId){
  const works=new Set(state.artworks.filter(w=>w.childId===childId).map(w=>w.id));
  return state.albums.filter(a=>a.childId===childId||(a.childId===null&&a.orderedArtworkIds.some(id=>works.has(id))));
}
export function deleteWork(state,id){
  return {...state,artworks:state.artworks.filter(w=>w.id!==id),images:state.images.filter(i=>i.artworkId!==id),albums:state.albums.map(a=>albumMembers(a,a.orderedArtworkIds.filter(x=>x!==id)))};
}
export function validateArchive(s,{allowInvalidDates=false}={}){
  if(!s||s.version!==1)throw Error('Unsupported archive version');
  for(const key of ['children','artworks','images','albums']){
    if(!Array.isArray(s[key])||s[key].length>10000)throw Error('Invalid collection');
    const ids=new Set();
    for(const item of s[key]){if(!item||typeof item.id!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(item.id)||ids.has(item.id))throw Error('Invalid or duplicate identifier');ids.add(item.id);}
  }
  const text=(v,max=20000)=>typeof v==='string'&&v.length<=max;
  const date=v=>validDate(v)||(allowInvalidDates&&text(v,40));
  for(const c of s.children)if(!text(c.name,120)||!c.name.trim()||(c.birthDate!==null&&!date(c.birthDate))||typeof c.color!=='string'||!/^#[0-9a-f]{6}$/i.test(c.color))throw Error('Invalid profile');
  for(const w of s.artworks){
    if(!s.children.some(c=>c.id===w.childId)||!text(w.title,300)||!text(w.notes)||!date(w.artworkDate)||!Number.isFinite(Date.parse(w.addedAt))||![...categories,...legacyCategories].includes(w.category)||typeof w.isFavorite!=='boolean'||(w.uncategorized!==undefined&&(w.uncategorized!==true||w.category!=='other')))throw Error('Invalid artwork');
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
    if(!text(a.title,300)||!a.title.trim()||(a.childId!==null&&!s.children.some(c=>c.id===a.childId))||(a.description!=null&&!text(a.description))||(a.coverArtworkId!=null&&!a.orderedArtworkIds?.includes(a.coverArtworkId))||!['minimal','warm'].includes(a.coverStyle)||!Array.isArray(a.orderedArtworkIds)||new Set(a.orderedArtworkIds).size!==a.orderedArtworkIds.length||a.orderedArtworkIds.some(id=>!s.artworks.some(w=>w.id===id&&(a.childId===null||w.childId===a.childId))))throw Error('Invalid album');
  }
  return s;
}
export function mergeArchives(current,incoming){
  validateArchive(current,{allowInvalidDates:true});validateArchive(incoming,{allowInvalidDates:true});
  const result=structuredClone(current);
  for(const c of incoming.children)if(!result.children.some(x=>x.id===c.id))result.children.push(c);
  const newIds=new Set(incoming.artworks.filter(w=>!result.artworks.some(x=>x.id===w.id)).map(w=>w.id));
  result.artworks.push(...incoming.artworks.filter(w=>newIds.has(w.id)));
  result.images.push(...incoming.images.filter(i=>newIds.has(i.artworkId)));
  for(const album of incoming.albums){
    if(!result.albums.some(a=>a.id===album.id))result.albums.push(albumMembers(album,album.orderedArtworkIds.filter(id=>result.artworks.some(w=>w.id===id&&(album.childId===null||w.childId===album.childId)))));
  }
  return validateArchive(result,{allowInvalidDates:true});
}
