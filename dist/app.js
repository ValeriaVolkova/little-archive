import {coverTemplates,moveWork,albumDrag,fitAlbumDialog} from './album-ux.js';
import {updateManager} from './pwa-update.js';
import {chapters,familyStory,layoutGallery} from './scrapbook.js';
import {editCrop} from './crop-editor.js';
import {storageErrorKey} from './storage-error.js';
import {draftQueue} from './draft-queue.js';
import {emptyArchive,today,validDate,ageAt,albumMembers,profilePhoto,childAlbums,archiveFilters,dashboardData,filterWorks,deleteWork,validateArchive,categories,displayCategory,workCategory} from './domain.js';
import {BackupPhotoError,createBackup,inspectBackup,planRestore} from './backup-restore.js';
import {BackupLimitError} from './zip.js';
import {readArchive,readFile,commit,clientId,readDrafts,saveDraft} from './db.js';
import {appName,languages,localizeDocument,t,lang,setLanguage,dateText,countText,ageText,periodText} from './i18n.js';
import {enhancementLevel,preparePhoto,raster,loadImage,download,photoDate,chooseArtworkDate} from './media.js';
import {createPDF} from './pdf.js';
import {decoration} from './ui.js';

const app=document.querySelector('#app'),modal=document.querySelector('#modal');
let state=emptyArchive(),realState,demonstration=false,page='archive',filters=archiveFilters(),busy=false,dirty=false,stale=false;
let section=null;
let drafts=[],draftActive=false,draftState="idle";
const lastChildKey='little-archive-last-child';
function preferredChild(){
  let saved='';
  try{saved=localStorage.getItem(lastChildKey)||'';}catch{}
  return (state.children.some(c=>c.id===saved)?saved:'')||filters.child||state.children[0]?.id||'';
}
function rememberChild(id){try{localStorage.setItem(lastChildKey,id);}catch{}}
// One history entry per open modal, including transitions from detail to edit.
let dismissingFromHistory=false,consumingModalEntry=false;
function routeState(){return {archivePage:page,section,filters:{...filters},scroll:window.scrollY};}
function rememberRoute(){history.replaceState(routeState(),'');}
function pushRoute(){history.pushState(routeState(),'');}
window.addEventListener('popstate',event=>{
  if(consumingModalEntry){consumingModalEntry=false;if(modal.open&&!history.state?.archiveModal)history.pushState({archiveModal:true},'');return;}
  if(modal.open){
    const crop=document.querySelector('.crop-dialog[open]');
    if(crop)crop.querySelector('[data-op=cancel]').click();
    else{dismissingFromHistory=true;try{closeModal();}finally{dismissingFromHistory=false;}}
    if(modal.open)history.pushState({archiveModal:true},'');
    return;
  }
  const route=event.state;
  if(route?.archivePage){
    page=route.archivePage;section=route.section||null;filters={...archiveFilters(),...route.filters};
    render();window.scrollTo(0,route.scroll||0);
  }
});
let modalCleanup=()=>{},modalAction=null,toastTimer;
const demoFiles=new Map(),urlCache=new Map(),modalUrls=[];
const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons={
home:'<path d="m3 11 9-8 9 8M5 10v10h14V10M10 20v-6h4v6"/>',
grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
album:'<path d="M5 3h13a2 2 0 0 1 2 2v15H6a3 3 0 0 1-3-3V5a2 2 0 0 1 2-2Zm1 0v17M3 17h17"/><path d="M10 7h6m-6 4h4"/>',
settings:'<path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="3" fill="var(--bg)"/><circle cx="16" cy="17" r="3" fill="var(--bg)"/>',
plus:'<path d="M12 5v14M5 12h14"/>',heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/>',
search:'<circle cx="10" cy="10" r="6.5"/><path d="m15 15 5 5"/>',chevron:'<path d="m9 5 7 7-7 7"/>',
close:'<path d="m6 6 12 12M18 6 6 18"/>',photo:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="2"/><path d="m3 17 6-6 4 4 3-3 5 5"/>',
camera:'<path d="M3 7h4l2-3h6l2 3h4v14H3Z"/><circle cx="12" cy="13" r="4"/>',edit:'<path d="m4 16 12-12 4 4-12 12-5 1zM14 6l4 4"/>',
trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
upload:'<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>',
rotate:'<path d="M4 9a8 8 0 1 1 0 7M4 3v6h6"/>',arrow:'<path d="m9 5-7 7 7 7M2 12h20"/>',
up:'<path d="m6 14 6-6 6 6"/>',down:'<path d="m6 10 6 6 6-6"/>',spark:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>',check:'<path d="m5 12 4 4L19 6"/>',
share:'<path d="M12 15V3m-5 5 5-5 5 5M6 11H4v10h16V11h-2"/>',crop:'<path d="M7 3v14h14M3 7h14v14"/>'
};
const icon=name=>'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">'+(icons[name]||icons.photo)+'</svg>';
const button=(action,label,kind='secondary',symbol='',extra='')=>'<button type="button" class="'+kind+'" data-action="'+action+'" '+extra+'>'+(symbol?icon(symbol):'')+e(label)+'</button>';
function toast(message){const el=document.querySelector('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),4000);}
function inlineError(message){let box=modal.querySelector('.inline-error');if(!box){box=document.createElement('p');box.className='inline-error';box.setAttribute('role','alert');(modal.querySelector('.modal-body')||modal).append(box);}box.textContent=message;}
const getFile=path=>demonstration?(demoFiles.has(path)?Promise.resolve(demoFiles.get(path)):Promise.reject(Error('Missing demo image'))):readFile(path);
async function imageURL(path){
  if(urlCache.has(path))return urlCache.get(path);
  const file=await getFile(path);
  if(urlCache.has(path))return urlCache.get(path);
  const url=URL.createObjectURL(file);urlCache.set(path,url);
  if(urlCache.size>90){const first=urlCache.keys().next().value;URL.revokeObjectURL(urlCache.get(first));urlCache.delete(first);}
  return url;
}
function clearURLs(){for(const url of urlCache.values())URL.revokeObjectURL(url);urlCache.clear();}
function temporaryURL(blob){const url=URL.createObjectURL(blob);modalUrls.push(url);return url;}
const imageObservers=new WeakMap();
function hydrate(root=app){
  layoutGallery(root.querySelector('.masonry'),root);
  imageObservers.get(root)?.disconnect();
  const load=async image=>{
    image.dataset.visible='1';
    try{const url=await imageURL(image.dataset.path);if(image.isConnected&&image.dataset.visible)image.src=url;}
    catch{if(image.isConnected)image.alt=t('imageError');}
  };
  const images=root.querySelectorAll('img[data-path]');
  if(typeof IntersectionObserver==='undefined'){images.forEach(load);return;}
  const observer=new IntersectionObserver(entries=>{
    for(const {target,isIntersecting} of entries){
      if(isIntersecting){if(!target.closest('.masonry'))observer.unobserve(target);load(target);}
      else if(target.closest('.masonry')){delete target.dataset.visible;target.removeAttribute('src');}
    }
  },{rootMargin:'240px'});
  imageObservers.set(root,observer);
  images.forEach(image=>observer.observe(image));
}
let imagesById=new Map();
function coverPath(work){const image=imagesById.get(work?.coverImageId);return image?image.originalPath+'.thumb':'';}
function childLabel(id,date){const child=state.children.find(c=>c.id===id);return child?e(child.name)+(date&&ageText(ageAt(child.birthDate,date))?' · '+e(ageText(ageAt(child.birthDate,date))):''):'';}
async function persist(next,puts=[],deletes=[],draft=null,restore=null){
  if(stale&&!demonstration)throw Error(t('syncNotice'));
  if(demonstration){validateArchive(next);for(const[key,blob]of puts)demoFiles.set(key,blob);for(const key of deletes)demoFiles.delete(key);}
  else{await commit(next,puts,deletes,draft,restore);realState=next;}
  state=next;clearURLs();
}
function closeModal(force=false){
  if(busy&&!force){toast(t('busyClose'));return;}
  if(dirty&&!force&&draftActive&&draftState!=='saved'){toast(t(draftState==='saving'?'draftSaving':'draftError'));return;}
  if(dirty&&!force&&!confirm(t(draftActive?'draftClose':'discard')))return;
  dirty=false;layoutGallery(null,modal);imageObservers.get(modal)?.disconnect();modal.close();modalCleanup();modalCleanup=()=>{};draftActive=false;modal.innerHTML='';modalAction=null;
  for(const url of modalUrls.splice(0))URL.revokeObjectURL(url);
}
modal.addEventListener('close',()=>{
  if(!modal.open&&history.state?.archiveModal&&!dismissingFromHistory&&!consumingModalEntry){
    // Consume the modal entry after an explicit close.
    consumingModalEntry=true;history.back();
  }
});
function showModal(content,{wide=false,narrow=false,action=null}={}){
  if(!modal.open&&!history.state?.archiveModal){rememberRoute();history.pushState({archiveModal:true},'');}
  closeModal(true);modal.className=wide?'wide':narrow?'narrow':'';modal.innerHTML=content;modalAction=action;modal.showModal();
}
const modalHeader=title=>'<header class="modal-header"><h2>'+e(title)+'</h2>'+button('close',t('close'),'icon-button','close','aria-label="'+e(t('close'))+'"')+'</header>';
const footer=(label=t('save'),action='submit')=>'<footer class="modal-footer">'+button('close',t('cancel'))+button(action,label,'primary')+'</footer>';
modal.addEventListener('cancel',event=>{event.preventDefault();closeModal();});
modal.addEventListener('click',event=>{const el=event.target.closest('[data-action]');if(!el)return;if(el.dataset.action==='close')closeModal();else if(modalAction)Promise.resolve(modalAction(el.dataset.action,el,event)).catch(()=>inlineError(t('saveError')));});

const buildVersion='3C-local';
let pendingActions=0;
const updates=updateManager({
  safe:()=>!busy&&!dirty&&!pendingActions&&!document.querySelector('dialog[open],.album-gallery.reordering'),
  reload:()=>location.reload(),
  paint:({available,applying,notice})=>{
    const banner=app.querySelector('.update-banner');
    if(!banner)return;
    banner.hidden=!available&&!applying;
    banner.querySelector('span').textContent=t(notice||(applying?'updating':'updateAvailable'));
    const control=banner.querySelector('button');
    control.disabled=applying;control.textContent=t('applyUpdate');
  }
});
function navigation(mobile=false){
  const tabs=[['home','home'],['archive','grid'],['albums','album'],['settings','settings']];
  const tab=([id,symbol])=>button('nav',t(id),(mobile?'':'nav-button ')+(page===id?'active':''),symbol,
    'data-page="'+id+'" aria-current="'+(page===id?'page':'false')+'"');
  const items=tabs.map(tab);
  if(mobile)items.splice(2,0,button('newWork','','nav-add','plus','aria-label="'+e(t('addArtwork'))+'"'));
  return '<nav class="'+(mobile?'mobile-nav':'navigation')+'">'+items.join('')+'</nav>';
}
let stopAlbumDrag;
function render(){
  stopAlbumDrag?.();stopAlbumDrag=null;
  imagesById=new Map(state.images.map(image=>[image.id,image]));
  if(filters.child&&!state.children.some(c=>c.id===filters.child))filters.child='';
  localizeDocument();app.dataset.page=page;
  app.innerHTML='<aside class="sidebar"><div class="brand"><img src="./assets/drawkeeper-192.png" alt=""><div><small>'+e(t('tagline'))+'</small></div></div>'+navigation()+
  '<div class="side-label">'+e(t('profiles'))+'</div>'+state.children.map(c=>'<button class="child-filter '+(filters.child===c.id?'selected':'')+'" data-action="childPage" data-id="'+e(c.id)+'"><span class="child-dot" style="background:'+e(c.color)+'38">'+e(c.name[0])+'</span>'+e(c.name)+'</button>').join('')+
  button('newChild',t('addChild'),'child-filter add','plus')+'<div class="side-foot">'+icon('lock')+'<div>'+e(t('local'))+'<br>'+e(t('private'))+'</div></div></aside><main class="main">'+
  '<div class="topbar"><div class="breadcrumb">'+icon(page==='home'?'home':page==='archive'?'grid':page==='albums'?'album':'settings')+'<span>'+e(t(page))+'</span></div><div class="top-actions"><span class="status-pill"><i></i>'+e(t('onlyLocal'))+'</span>'+button('newWork','','global-add primary','plus','aria-label="'+e(t('addArtwork'))+'"')+'</div></div>'+
  '<section class="update-banner panel" hidden><span role="status"></span>'+button('applyUpdate',t('applyUpdate'),'secondary')+'</section>'+
  (section?.type==='album'?albumView(section.id):section?.type==='child'?childView(section.id):{home:dashboardView,archive:archiveView,albums:albumsView,settings:settingsView}[page]())+'</main>'+navigation(true);
  hydrate();updates.show();
  const gallery=app.querySelector('.album-gallery');
  if(gallery)stopAlbumDrag=albumDrag(gallery,ids=>saveAlbumOrder(gallery.dataset.album,ids),
    ()=>!busy&&!modal.open&&!updates.applying);

}
let filtersExpanded=false;
function displayTitle(work){return /\.(jpe?g|png|heic|heif|webp)$/i.test(work.title.trim())?'':work.title.trim();}
const coverMotifs={cream:'arcs',peach:'waves',sage:'checker',sky:'loop',
  lavender:'offset',butter:'tiles',terracotta:'ribbon',paper:'lines'};
const motif=(name,className)=>`<svg class="playful-motif ${className}" viewBox="0 0 120 120" aria-hidden="true" focusable="false"><use href="./assets/playful-motifs.svg#${name}"/></svg>`;
function storyPhoto({work,child,age},label){
  const photo=imagesById.get(work.coverImageId);
  return `<button type="button" class="story-photo" data-action="detail" data-id="${e(work.id)}">
    <span class="story-print"><img loading="lazy" width="${photo.width}" height="${photo.height}" data-path="${e(coverPath(work))}" alt="${e(displayTitle(work)||t('untitled'))}"></span>
    <strong>${e(label||child.name)}</strong>
    <small>${e(label?dateText(work.artworkDate):ageText(age))}</small>
  </button>`;
}
function ageChart({child,periods},index,max){
  return `<div class="age-chart tone-${index%5}"><h3>${e(child.name)}</h3>
    <div class="age-bars">${periods.map(([period,count])=>`
      <button type="button" data-action="openPeriod" data-id="${e(child.id)}" data-period="${period}"
        aria-label="${e(periodText(period)+' · '+countText(count))}">
        <span class="age-column" aria-hidden="true" style="--height:${count/max}">
          <span>${count}</span><i></i>
        </span><small>${e(periodText(period))}</small>
      </button>`).join('')}</div>
  </div>`;
}
function dashboardView(){
  const story=familyStory(state);
  const max=story.artists.reduce((highest,artist)=>Math.max(highest,...artist.periods.map(([,count])=>count)),1);
  const charts=story.artists.map((artist,i)=>artist.periods.length?ageChart(artist,i,max):'').join('');
  return `<div class="dashboard family-story">
    <header class="collection-summary">
      <h1>${e(t('myCollection'))}</h1><p>${e(countText(story.count))}</p>
      ${motif('ribbon','collection-pattern')}
    </header>
    ${demoBanner()}${draftBanner()}
    ${story.artists.length?`<section class="dashboard-section"><h2>${e(t('littleArtists'))}</h2>
      <div class="artist-cards">${story.artists.map(({child,count},i)=>`
        <button type="button" class="artist-card tone-${i%5}" data-action="openChildArchive" data-id="${e(child.id)}">
          ${avatar(child)}<span><strong>${e(child.name)}</strong><small>${e(countText(count))}</small></span>${icon('chevron')}
        </button>`).join('')}</div></section>`:''}
    ${charts?`<section class="dashboard-section"><h2>${e(t('artByAge'))}</h2><div class="age-charts">${charts}</div></section>`:''}
    ${story.sameAge?`<section class="dashboard-section"><h2>${e(t('atTheSameAge'))}</h2>
      <div class="story-pair">${story.sameAge.map(entry=>storyPhoto(entry)).join('')}</div></section>`:''}
    ${story.timeline?`<section class="dashboard-section"><h2>${e(t('firstAndLast'))}</h2><p class="story-child">${e(story.timeline[0].child.name)}</p>
      <div class="story-pair">${storyPhoto(story.timeline[0],t('firstDrawing'))}${storyPhoto(story.timeline[1],t('latestDrawing'))}</div></section>`:''}
  </div>`;
}
function draftBanner(){return drafts.length&&!demonstration?'<div class="draft-banner">'+button('drafts',t('resumeDraft')+' · '+drafts.length,'secondary','edit')+'</div>':'';}
function demoBanner(){return demonstration?'<div class="demo-banner">'+icon('grid')+'<div><strong>'+e(t('demo'))+'</strong><span>'+e(t('demoHint'))+'</span></div>'+button('own',t('start'),'text-button')+'</div>':'';}
function archiveHero(){
  const profiles=[{id:'',name:t('familyFilter')},...state.children];
  return `<section class="archive-home"><div class="archive-home-heading"><h1>${e(t('archive'))}</h1>
      <div class="archive-pattern" aria-hidden="true">${motif('arcs','archive-arcs')}${motif('waves','archive-waves')}</div></div>
    <div class="child-tabs" role="group" aria-label="${e(t('profiles'))}">
      ${profiles.map(c=>button('filterChild',c.name,'child-tab '+(filters.child===c.id?'active':''),'',`data-id="${e(c.id)}" aria-pressed="${filters.child===c.id}"`)).join('')}
    </div></section>`;
}
function option(value,label,selected){return '<option value="'+e(value)+'" '+(value===selected?'selected':'')+'>'+e(label)+'</option>';}
function workCard(w,action='detail',selected=false,disabled=false){
  const image=imagesById.get(w.coverImageId);
  const label=[displayTitle(w)||t('untitled'),childLabel(w.childId),validDate(w.artworkDate)?dateText(w.artworkDate):''].filter(Boolean);
  return `<article class="work-card" data-ratio="${image.height/image.width}"><button class="work-open" data-action="${action}" ${action==='pick'?'aria-pressed="'+selected+'"':''} ${disabled?'disabled':''} data-id="${e(w.id)}" aria-label="${e(label[0])} · ${label[1]} ${e(label[2])}">
    <img loading="lazy" decoding="async" width="${image.width}" height="${image.height}" data-path="${e(coverPath(w))}" alt=""></button></article>`;
}
function emptyView(title,message,action,label,symbol='frame'){return '<div class="empty empty-'+symbol+'">'+decoration(symbol,'empty-art')+'<h2>'+e(title)+'</h2><p>'+e(message)+'</p>'+button(action,label,'primary',action==='clear'?'arrow':'plus')+'</div>';}
function hasArchiveFilters(){
  const defaults=archiveFilters();
  return Object.keys(defaults).some(key=>filters[key]!==defaults[key]);
}
function archiveResults(works){
  if(works.length)return '<div class="art-grid masonry">'+works.map(w=>workCard(w)).join('')+'</div>';
  if(state.artworks.length)return emptyView(t('noMatches'),t('noMatchesHint'),'clear',t('clearFilters'),'search');
  if(!state.children.length)return emptyView(t('empty'),t('welcomeFirst'),'newChild',t('addFirstChild'),'frame');
  return emptyView(t('empty'),t('emptyHint'),'newWork',t('firstArtwork'),'frame');
}
function archiveView(){
  const works=filterWorks(state,filters),years=[...new Set(state.artworks.filter(w=>validDate(w.artworkDate)).map(w=>w.artworkDate.slice(0,4)))].sort().reverse();
  const periods=new Set(dashboardData(state).periods.map(([period])=>period));
  if(filters.period!=='')periods.add(Number(filters.period));
  return archiveHero()+demoBanner()+draftBanner()+
  '<div class="archive-search"><div class="search">'+icon('search')+'<input id="search" value="'+e(filters.search)+'" aria-label="'+e(t('search'))+'" placeholder="'+e(t('search'))+'"></div></div>'+
  '<details class="archive-options" '+(filtersExpanded?'open':'')+'><summary>'+icon('settings')+e(t('filters'))+'</summary><div class="filter-row"><div class="segmented">'+button('all',t('all'),!filters.favorite?'active':'')+button('favorites',t('favorites'),filters.favorite?'active':'','heart')+'</div><span class="spacer"></span><select id="year-filter" class="year-select" aria-label="'+e(t('anyYear'))+'">'+option('',t('anyYear'),filters.year)+years.map(y=>option(y,y,filters.year)).join('')+'</select></div>'+
  '<div class="collection-label"><select id="sort" aria-label="'+e(t('newest'))+'">'+[['newest','newest'],['oldest','oldest'],['age','byAge'],['category','byCategory']].map(([id,key])=>option(id,t(key),filters.sort)).join('')+'</select></div>'+
  '<div class="category-chips">'+button('category',t('anyCategory'),'chip '+(!filters.category?'active':''),'','data-category=""')+categories.map(c=>button('category',t(c),'chip '+(filters.category===c?'active':''),'','data-category="'+c+'"')).join('')+'</div>'+
  '<div class="age-filter-row"><select id="period-filter" aria-label="'+e(t('ageCollections'))+'">'+option('',t('allAges'),filters.period)+[...periods].sort((a,b)=>a-b).map(n=>option(String(n),periodText(n),filters.period)).join('')+'</select>'+
  '</div></details>'+
  '<div class="collection-label archive-toolbar"><strong id="archive-count" aria-live="polite">'+e(countText(works.length))+'</strong>'+
  button('clear',t('clearFilters'),'text-button archive-reset','',hasArchiveFilters()?'':'hidden')+
  (works.length?button('pickForAlbum',t('selectWorks'),'text-button'):'')+'</div><div id="archive-results">'+archiveResults(works)+'</div>';
}
function albumCover(album,{caption=false,previewWork=false}={}){
  const explicit=state.artworks.find(w=>w.id===album.coverArtworkId);
  const work=explicit||(previewWork?state.artworks.find(w=>w.id===album.orderedArtworkIds[0]):null);
  const photo=work&&imagesById.get(work.coverImageId);
  const template=coverTemplates.includes(album.coverTemplate)?album.coverTemplate:'cream';
  return `<div class="album-cover book-jacket jacket-${template}${work?' has-art':''}">
    ${motif(coverMotifs[template],'jacket-art')}
    ${photo?`<img class="book-photo" width="${photo.width}" height="${photo.height}" data-path="${e(coverPath(work))}" alt="">`:''}
    <div class="jacket-copy"><h3>${e(album.title||t('albumPlaceholder'))}</h3>
      ${caption?'<span class="book-caption">'+e(countText(album.orderedArtworkIds.length))+'</span>':''}</div></div>`;
}
function albumCards(albums){
  return '<div class="album-grid">'+albums.map(a=>`<button class="book-card" data-action="album" data-id="${e(a.id)}">
    ${albumCover(a,{caption:true,previewWork:true})}</button>`).join('')+'</div>';
}
function albumsView(){
  return `<header class="section-hero albums-intro"><h1>${e(t('albums'))}</h1>${button('newAlbum',t('createAlbum'),'primary','plus')}</header>`+
    demoBanner()+(state.albums.length?albumCards(state.albums):
      '<div class="empty">'+motif('arcs','empty-art')+'<h2>'+e(t('emptyAlbums'))+'</h2><p>'+e(t('emptyAlbumsHint'))+'</p></div>');
}
function settingsView(){
  const language=(code,label)=>button('language',label,lang===code?'primary':'secondary','',
    'data-language="'+code+'" aria-pressed="'+(lang===code)+'"');
  return `<header class="section-hero settings-intro"><h1>${e(t('settings'))}</h1></header>
    ${demoBanner()}<div class="settings-grid">
      <section class="panel settings-profiles"><h2>${icon('photo')}${e(t('profiles'))}</h2>${motif('loop','settings-pattern')}
      ${state.children.map(c=>`<div class="profile-row">${avatar(c)}<div>${e(c.name)}
        ${c.birthDate?'<small>'+e(dateText(c.birthDate))+'</small>':''}</div>
        ${button('childPage',t('profile'),'text-button','','data-id="'+e(c.id)+'"')}</div>`).join('')}
      ${button('newChild',t('addChild'),'secondary','plus')}</section>
      <section class="panel settings-language"><h2>${icon('settings')}${e(t('language'))}</h2>${motif('checker','settings-pattern')}
        <div class="language-options">${Object.entries(languages).map(([code,label])=>language(code,label)).join('')}</div></section>
      <section class="panel settings-backup"><h2>${icon('download')}${e(t('backup'))}</h2>${motif('waves','settings-pattern')}
        <div class="settings-actions">${button('export',t('exportBackup'),'secondary','download')}${button('import',t('importBackup'),'secondary','upload')}</div></section>
      <aside class="warning backup-warning">${icon('lock')}<p>${e(t('backupWarning'))}</p></aside>
      <section class="panel"><h2>${icon('album')}${e(t('pdf'))}</h2>
        ${button('nav',t('albums'),'secondary','chevron','data-page="albums"')}</section>
      <section class="panel storage-info"><h2>${icon('lock')}${e(t('privacyTitle'))}</h2>
        <p>${e(t('appVersion'))}<br><code data-build>${e(buildVersion)}</code></p>
        <details><summary>${e(t('local'))}</summary><p>${e(t('privacyBody'))}</p><p class="web-note">${e(t('webNote'))}</p></details>
      </section>
    </div>`;
}
function openArchive(period='',child=''){clearTimeout(searchTimer);filters={...archiveFilters(),period,child};page='archive';section=null;render();window.scrollTo(0,0);}
async function enterOwn(){demonstration=false;state=realState;page='home';filters=archiveFilters();clearURLs();render();if(!state.children.length)profileEditor();}

function showSection(type,id){
  if(!modal.open&&!history.state?.archiveModal)rememberRoute();
  section={type,id};page=type==='album'?'albums':'settings';render();window.scrollTo(0,0);
  if(!history.state?.archiveModal)pushRoute();
}
const albumDetail=id=>showSection('album',id);
const childPage=id=>showSection('child',id);
function avatar(child){
  return profilePhoto(child)?'<img class="profile-avatar" data-path="'+e(profilePhoto(child))+'" alt="">':
    '<span class="child-dot profile-avatar" style="background:'+e(child.color)+'38">'+e(child.name[0])+'</span>';
}
function childView(id){
  const child=state.children.find(c=>c.id===id);if(!child)return settingsView();
  const works=state.artworks.filter(w=>w.childId===id).sort((a,b)=>b.addedAt.localeCompare(a.addedAt));
  const albums=childAlbums(state,id);
  return `<div class="dashboard child-story"><header class="welcome-paper">${motif('arcs','profile-pattern')}${avatar(child)}<h1>${e(child.name)}</h1>
    <p>${[ageText(ageAt(child.birthDate,today())),countText(works.length)].filter(Boolean).map(e).join(' · ')}</p>
    <div class="buttons">${button('childWorks',t('allDrawings'),'primary','grid')}${button('editProfile',t('edit'),'secondary','edit')}</div></header>
    <section class="dashboard-section"><h2>${e(t('growingArt'))}</h2><div class="period-grid">${chapters(works,child).map(([period,n])=>
      `<button class="period-card tone-${period%5}" data-action="openPeriod" data-period="${period}" data-id="${e(id)}"><strong>${e(periodText(period))}</strong><span>${e(countText(n))}</span></button>`).join('')||e(t('emptyChapters'))}</div></section>
    <section class="dashboard-section"><h2>${e(t('recentMemories'))}</h2><div class="memory-grid">${works.slice(0,3).map(w=>
      `<button class="memory-card" data-action="detail" data-id="${e(w.id)}"><img data-path="${e(coverPath(w))}" alt=""><strong>${e(displayTitle(w)||t('untitled'))}</strong></button>`).join('')||e(t('noWorks'))}</div></section>
    <section class="dashboard-section"><h2>${e(t('albums'))}</h2>${albums.length?albumCards(albums):e(t('emptyAlbums'))}</section></div>`;
}
function profileEditor(id){
  const child=state.children.find(c=>c.id===id);
  const first=!child&&!state.children.length;
  showModal(modalHeader(child?t('profile'):t(first?'addFirstChild':'addChild'))+`<form id="profile-form"><div class="modal-body">
    <label class="field">${e(t('name'))}<input name="name" maxlength="120" required autocomplete="given-name" value="${e(child?.name||'')}"></label>
    <label class="field">${e(t(first?'requiredBirthday':'birthday'))}<input type="date" name="birthday" max="${today()}" ${first?'required':''} value="${e(child?.birthDate||'')}"></label>
    <div id="avatar-preview">${child?avatar(child):''}</div><label class="field">${e(t('profilePhoto'))}<input type="file" id="avatar-file" accept="image/*,.heic,.heif"></label>
    ${button('removeAvatar',t('removePhoto'),'text-button','','id="remove-avatar"')}${child?button('deleteProfile',t('deleteProfile'),'text-button danger') :''}
    <div class="inline-error" role="alert"></div>${first?'':`<label class="field">${e(t('color'))}<input type="color" name="color" value="${e(child?.color||'#879989')}"></label>`}</div>${footer()}</form>`,{narrow:true,action:async action=>{if(busy)return;
    if(action==='submit')modal.querySelector('form').requestSubmit();
    if(action==='removeAvatar'){photo=null;dirty=true;paintAvatar();}
    if(action==='deleteProfile'){
      if(state.artworks.some(w=>w.childId===id)||state.albums.some(a=>a.childId===id)||drafts.some(d=>d.work?.childId===id)){inlineError(t('profileInUse'));return;}
      if(!confirm(t('confirmProfileDelete')))return;
      busy=true;try{
        const next=structuredClone(state);next.children=next.children.filter(c=>c.id!==id);
        await persist(next,[],profilePhoto(child)?[profilePhoto(child)]:[]);
        section=null;closeModal(true);render();
      }catch{inlineError(t('saveError'));}finally{busy=false;}
    }}});
  const form=modal.querySelector('form');form.oninput=()=>dirty=true;
  let photo; // undefined keeps the current avatar; null removes it.
  function paintAvatar(){
    const preview=form.querySelector('#avatar-preview');
    preview.innerHTML=photo?'<img class="profile-avatar" src="'+temporaryURL(photo)+'" alt="">':
      child?avatar(photo===null?{...child,profileImagePath:null}:child):'';
    form.querySelector('#remove-avatar').hidden=!(photo||(photo===undefined&&child&&profilePhoto(child)));
  }
  paintAvatar();hydrate(modal);
  form.querySelector('#avatar-file').onchange=async event=>{
    const file=event.target.files[0];if(!file||busy)return;
    busy=true;try{photo=(await preparePhoto(file)).thumb;dirty=true;paintAvatar();inlineError('');}
    catch{inlineError(t('imageError'));}finally{busy=false;event.target.value='';}
  };
  form.onsubmit=async event=>{
    event.preventDefault();if(busy)return;const f=new FormData(form),name=f.get('name').trim();if(!name)return;
    if(first&&!validDate(f.get('birthday'))){inlineError(t('saveInvalid'));return;}
    busy=true;
    try{const next=structuredClone(state),record={profileImagePath:null,...child,id:id||crypto.randomUUID(),name,birthDate:f.get('birthday')||null,color:f.get('color')||'#879989'};
      if(child)next.children[next.children.findIndex(c=>c.id===id)]=record;else next.children.push(record);
      const puts=[],deletes=[];
      if(photo!==undefined){
        if(child&&profilePhoto(child))deletes.push(profilePhoto(child));
        record.profileImagePath=photo?'profiles/'+record.id+'/'+crypto.randomUUID()+'.jpg':null;
        if(photo)puts.push([record.profileImagePath,photo]);
      }
      await persist(next,puts,deletes);
      if(first){page='archive';rememberChild(record.id);}
      busy=false;closeModal(true);render();toast(t('profileSaved'));
    }catch(err){inlineError(t(storageErrorKey(err)));}finally{busy=false;}
  };
}

async function artworkEditor(id,recovered=null){
  if(demonstration&&!id){await enterOwn();if(!state.children.length)return;}
  if(!state.children.length){profileEditor();return;}
  const originalWork=state.artworks.find(w=>w.id===id),work=originalWork||recovered?.work||{childId:preferredChild(),title:'',artworkDate:today(),category:'',notes:'',isFavorite:false};
  const legacyDraft=!id&&(recovered?.photos?.length||0)>1;
  const canPick=!id&&!legacyDraft;
  let photos=recovered?.photos||[],cover=originalWork?.coverImageId||recovered?.cover||null,photosReady=!originalWork;
  let manualDate=recovered?(recovered.manualDate??true):!!id;
  const draftId=recovered?.id||crypto.randomUUID();let draftRevision=recovered?.revision||0;
  const field=(key,html)=>'<label class="field">'+e(t(key))+html+'</label>';
  const category=workCategory(work)||'',legacyCategory=category&&!categories.includes(category);
  const inputs=`<input type="file" id="files" accept="image/*,.heic,.heif" hidden><input type="file" id="file-picker" hidden><input type="file" id="camera" accept="image/*" capture="environment" hidden>`;
  const picker=canPick?`<details class="quick-source" id="dropzone"><summary class="secondary">${icon('plus')}<span id="photo-source-label">${e(t('photoSource'))}</span></summary>
    <div class="photo-sources">${button('choose',t('mediaLibrary'),'secondary','photo')}${button('camera',t('camera'),'secondary','camera')}${button('chooseFile',t('chooseFile'),'secondary','upload')}</div>${inputs}</details>`:'';
  showModal(modalHeader(t(id?'editWork':'newWork'))+`<form id="artwork-form"><p class="draft-status" role="status"></p>
    <div class="modal-body quick-editor">
      <div class="quick-photo"><div id="photo-list" class="photo-list"></div>${picker}</div>
      <div class="quick-fields">
        <div class="quick-required">
          ${field('child','<select name="child" required>'+state.children.map(c=>option(c.id,c.name,work.childId)).join('')+'</select>')}
          ${field('date',`<input type="date" name="date" max="${today()}" required value="${e(work.artworkDate)}">`)}
        </div>
        ${field('title',`<input name="title" maxlength="300" value="${e(work.title)}">`)}
        ${field('category','<select name="category">'+option('',t('uncategorized'),category)+categories.map(c=>option(c,t(c),category)).join('')+(legacyCategory?option(category,t(category),category):'')+'</select>')}
        ${field('notes',`<textarea name="notes" rows="2" maxlength="20000">${e(work.notes)}</textarea>`)}
        ${id||recovered?.work.isFavorite?`<label class="check"><input name="favorite" type="checkbox" ${work.isFavorite?'checked':''}>${e(t('favorite'))}</label>`:''}
        <div class="inline-error" role="alert"></div>
      </div>
    </div>${footer()}</form>`,
    {wide:true,action:async(action,el)=>{
      if(busy)return;
      if(canPick&&['choose','chooseFile','camera'].includes(action))modal.querySelector('#'+({choose:'files',chooseFile:'file-picker',camera:'camera'}[action])).click();
      if(action==='submit')modal.querySelector('form').requestSubmit();
      const p=photos.find(p=>p.id===el.dataset.id);
      if(action==='cover'){cover=p.id;dirty=true;paintPhotos();}
      if(action==='crop'&&p){busy=true;try{await openCrop(p);}finally{busy=false;}}
    }});
  const form=modal.querySelector('form');
  draftActive=!id&&!demonstration;draftState=recovered?'saved':'idle';
  const status=form.querySelector('.draft-status');if(recovered)status.textContent=t('draftSaved');
  const queue=draftQueue(async value=>{draftRevision=await saveDraft(value,draftRevision);},state=>{if(form.isConnected){draftState=state;}if(form.isConnected&&status)status.textContent=t(state==='saved'?'draftSaved':state==='error'?'draftError':'draftSaving');});
  function autosave(){if(id||demonstration||!form.isConnected)return;const f=new FormData(form);queue.save({id:draftId,updatedAt:new Date().toISOString(),manualDate,work:{childId:f.get('child'),title:f.get('title'),artworkDate:f.get('date'),category:f.get('category'),notes:f.get('notes'),isFavorite:f.has('favorite')},photos:photos.map(p=>({...p})),cover});}
  const recordInput=event=>{if(event.target.name==='date')manualDate=true;dirty=true;autosave();};
  form.oninput=event=>{if(event.target.type!=='file')recordInput(event);};
  form.elements.date.addEventListener('change',recordInput);
  modalCleanup=()=>{pendingActions++;queue.flush().catch(()=>{}).then(async()=>{await refreshDrafts();render();}).finally(()=>{pendingActions--;});};
  if(recovered)paintPhotos();
  function paintPhotos(){
    if(dirty)autosave();
    const root=modal.querySelector('#photo-list');if(!root)return;
    root.innerHTML=photos.map(p=>'<div class="photo-tile"><img src="'+temporaryURL(p.thumb)+'" alt="'+e(t('photos'))+'">'+
      '<div class="photo-tools">'+(photos.length>1?button('cover',t(cover===p.id?'cover':'makeCover'),'cover-button '+(cover===p.id?'active':''),'','data-id="'+e(p.id)+'"'):'')+
      button('crop',t('crop'),'secondary','crop','data-id="'+e(p.id)+'"')+'</div></div>').join('');
    const label=form.querySelector('#photo-source-label');
    if(label)label.textContent=t(photos.length?'replacePhoto':'photoSource');
  }
  async function acceptFiles(files,fromCamera=false){
    if(busy||!canPick||!files.length)return;
    if(files.length!==1){inlineError(t('requiredPhoto'));return;}
    busy=true;
    try{
      const file=files[0],data=await preparePhoto(file),captured=fromCamera?null:await photoDate(file);
      const photo={id:crypto.randomUUID(),original:data.blob,edited:null,width:data.width,height:data.height,thumb:data.thumb};
      const before={photos,cover,date:form.elements.date.value};
      photos=[photo];cover=photo.id;
      form.elements.date.value=chooseArtworkDate(manualDate,form.elements.date.value,captured);
      zone.open=false;dirty=true;inlineError('');paintPhotos();
      await openCrop(photo,()=>{photos=before.photos;cover=before.cover;form.elements.date.value=before.date;paintPhotos();},data.preview);
    }catch{inlineError(t('imageError'));}finally{busy=false;form.querySelectorAll('input[type=file]').forEach(input=>input.value='');}
  }
  const zone=form.querySelector('#dropzone');
  if(zone){
    form.querySelectorAll('input[type=file]').forEach(input=>input.onchange=()=>acceptFiles([...input.files],input.id==='camera'));
    zone.ondragover=event=>{event.preventDefault();zone.classList.add('dragover');};
    zone.ondragleave=()=>zone.classList.remove('dragover');
    zone.ondrop=event=>{event.preventDefault();zone.classList.remove('dragover');acceptFiles([...event.dataTransfer.files]);};
  }
  async function openCrop(p,onCancel,preview){
    const source=preview||await loadImage(p.original);
    const legacyImage=p.edited&&!p.cropSettings?await loadImage(p.edited):null;
    editCrop(source,p.cropSettings,legacyImage,t,async (recipe,cropChanged,level)=>{
      let cropUpdate={};
      if(cropChanged){
        const full=recipe.rotation===0&&recipe.x<1e-9&&recipe.y<1e-9&&recipe.w>1-1e-9&&recipe.h>1-1e-9;
        const result=full?null:await raster(source,4096,recipe.rotation,recipe);
        cropUpdate={edited:result?.blob||null,width:result?.width||source.naturalWidth,
          height:result?.height||source.naturalHeight,cropSettings:full?null:recipe,changed:true};
      }
      const base=(cropChanged?cropUpdate.edited:p.edited)||source;
      const thumb=(await raster(base,640,0,null,level)).blob;
      Object.assign(p,cropUpdate,{thumb,enhanceIntensity:level,autoEnhance:level>0,generatedThumb:true});
      dirty=true;paintPhotos();
    },onCancel,preview?undefined:enhancementLevel(p));
  }
  if(originalWork){
    busy=true;
    try{
      const loaded=[];
      for(const meta of state.images.filter(i=>i.artworkId===id).sort((a,b)=>a.sortOrder-b.sortOrder)){
        const original=await getFile(meta.originalPath),edited=meta.editedPath?await getFile(meta.editedPath):null;
        let generatedThumb=false;
        const autoEnhance=meta.autoEnhance===true;
        const thumb=await getFile(meta.originalPath+'.thumb').catch(async()=>{generatedThumb=true;return (await raster(edited||original,640,0,null,enhancementLevel(meta))).blob;});
        loaded.push({id:meta.id,original,edited,width:meta.width,height:meta.height,thumb,meta,cropSettings:meta.cropSettings,generatedThumb,autoEnhance,enhanceIntensity:meta.enhanceIntensity});
      }
      photos=loaded;photosReady=true;paintPhotos();
    }catch{form.querySelector('[data-action=submit]').disabled=true;inlineError(t('editPhotosUnavailable'));}finally{busy=false;}
  }
  form.onsubmit=async event=>{
    event.preventDefault();if(busy||!photosReady)return;
    if(!photos.length||(canPick&&photos.length!==1)){inlineError(t('requiredPhoto'));return;}
    busy=true;form.querySelector('[data-action=submit]').disabled=true;
    try{
      await queue.flush().catch(()=>{});
      const fields=new FormData(form),artworkId=id||draftId,next=structuredClone(state),puts=[],deletes=[];
      const record={...originalWork,id:artworkId,childId:fields.get('child'),title:fields.get('title').trim(),artworkDate:fields.get('date'),addedAt:originalWork?.addedAt||new Date().toISOString(),category:fields.get('category'),notes:fields.get('notes').trim(),isFavorite:fields.has('favorite'),coverImageId:cover};
      delete record.uncategorized;
      if(!record.category){record.category='other';record.uncategorized=true;}
      if(!validDate(record.artworkDate)||!state.children.some(c=>c.id===record.childId)){inlineError(t('saveInvalid'));return;}
      if(id)next.artworks[next.artworks.findIndex(w=>w.id===id)]=record;else next.artworks.push(record);
      next.images=next.images.filter(i=>i.artworkId!==artworkId);
      for(let order=0;order<photos.length;order++){
        const p=photos[order],ext=({'image/png':'png','image/webp':'webp','image/heic':'heic','image/heif':'heif'})[p.original.type]||'jpg';
        const originalPath=p.meta?.originalPath||'images/'+p.id+'/original.'+ext;
        const editedPath=p.meta&&!p.changed?p.meta.editedPath:p.edited?'images/'+p.id+'/edited.jpg':null;
        if(!p.meta)puts.push([originalPath,p.original]);
        if(p.edited&&(!p.meta||p.changed))puts.push([editedPath,p.edited]);
        if(p.meta?.editedPath&&p.meta.editedPath!==editedPath)deletes.push(p.meta.editedPath);
        if(!p.meta||p.changed||p.generatedThumb)puts.push([originalPath+'.thumb',p.thumb]);
        const image={...p.meta,id:p.id,artworkId,originalPath,editedPath,...(p.changed||p.cropSettings?{cropSettings:p.cropSettings??null}:{}),width:p.width,height:p.height,sortOrder:p.meta?.sortOrder??order};
        if(p.enhanceIntensity!==undefined)image.enhanceIntensity=p.enhanceIntensity;
        if(p.autoEnhance===true)image.autoEnhance=true;
        else delete image.autoEnhance;
        next.images.push(image);
      }
      next.albums=next.albums.map(a=>a.childId&&a.childId!==record.childId?albumMembers(a,a.orderedArtworkIds.filter(x=>x!==artworkId)):a);
      await persist(next,puts,deletes,!id&&!demonstration?{id:draftId,revision:draftRevision}:null);
      if(!demonstration)rememberChild(record.childId);
      busy=false;closeModal(true);
      if(!id){openArchive();const card=app.querySelector('.work-open[data-id="'+record.id+'"]');card?.scrollIntoView({block:'nearest'});card?.focus({preventScroll:true});}
      else render();
      toast(t(demonstration?'demoChanges':'saved'));
    }catch(err){inlineError(t(storageErrorKey(err))+(err?.name?' ['+err.name+']':''));}finally{busy=false;if(form.isConnected)form.querySelector('[data-action=submit]').disabled=false;}
  };
}

async function artworkDetail(id,index=0){
  const work=state.artworks.find(w=>w.id===id);if(!work)return;
  const category=displayCategory(workCategory(work));
  const photos=state.images.filter(i=>i.artworkId===id).sort((a,b)=>a.sortOrder-b.sortOrder),photo=photos[index];
  showModal('<div class="detail">'+button('close','','icon-button detail-close','close','aria-label="'+e(t('close'))+'"')+
    '<div class="detail-photo"><img id="detail-image" alt="'+e(work.title||t('untitled'))+'" tabindex="0" role="button" aria-label="'+e(t('zoom'))+'">'+(photos.length>1?'<div class="gallery-nav">'+button('previous','','icon-button','arrow','aria-label="'+e(t('previous'))+'"')+'<span>'+(index+1)+' / '+photos.length+'</span>'+button('next','','icon-button','chevron','aria-label="'+e(t('next'))+'"')+'</div>':'')+'</div><div class="detail-info">'+(category?'<span class="eyebrow">'+e(t(category))+'</span>':'')+'<h2>'+e(work.title||t('untitled'))+'</h2><div class="card-meta">'+childLabel(work.childId,work.artworkDate)+'</div><div class="detail-date">'+e(dateText(work.artworkDate))+'</div>'+(work.notes?'<div class="notes"><span class="note-label">'+e(t('parentNote'))+'</span><p>'+e(work.notes)+'</p></div>':'')+
    '<div class="buttons">'+button('edit',t('edit'),'secondary','edit')+button('favorite','', 'icon-button '+(work.isFavorite?'selected':''),'heart','aria-label="'+e(t(work.isFavorite?'unfavorite':'favorite'))+'"')+'</div><div class="buttons">'+button('share',t('share'),'secondary','share')+button('addAlbum',t('addAlbum'),'secondary','album')+'</div>'+button('delete',t('delete'),'detail-delete','trash')+'</div></div>',{wide:true,action:async action=>{
      if(action==='edit')artworkEditor(id);
      if(action==='previous')artworkDetail(id,(index+photos.length-1)%photos.length);
      if(action==='next')artworkDetail(id,(index+1)%photos.length);
      if(action==='favorite'){await toggleFavorite(id);artworkDetail(id,index);}
      if(action==='delete'){showModal(modalHeader(t('deleteTitle'))+'<div class="modal-body"><p class="help">'+e(t('deleteHint'))+'</p></div><div class="modal-footer">'+button('close',t('cancel'))+button('confirmDelete',t('delete'),'danger')+'</div>',{narrow:true,action:async a=>{if(a!=='confirmDelete'||busy)return;busy=true;try{const paths=photos.flatMap(p=>[p.originalPath,p.originalPath+'.thumb',...(p.editedPath?[p.editedPath]:[])]);await persist(deleteWork(state,id),[],paths);busy=false;closeModal(true);render();toast(t('deleted'));}catch{inlineError(t('saveError'));}finally{busy=false;}}});}
      if(action==='addAlbum')addToAlbum(id);
      if(action==='share'){
        const path=photo.editedPath||photo.originalPath,source=await getFile(path);
        const level=enhancementLevel(photo);
        const blob=level?(await raster(source,4096,0,null,level)).blob:source;
        const extension=level?'jpg':path.split('.').at(-1);
        const file=new File([blob],(work.title||t('untitled')).replace(/[\\/:*?"<>|]/g,'-')+'.'+extension,{type:blob.type||'image/jpeg'});
        if(navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:work.title});}catch(error){if(error.name!=='AbortError')download(file,file.name);}}else download(file,file.name);
      }
    }});
  modal.classList.add('artwork-dialog');
  const img=modal.querySelector('#detail-image');
  try{img.src=temporaryURL((await raster(await getFile(photo.editedPath||photo.originalPath),2200,0,null,enhancementLevel(photo))).blob);}catch{img.alt=t('imageError');}
  const zoom=()=>img.classList.toggle('zoomed');img.onclick=zoom;img.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();zoom();}};
  let touchX=0;img.ontouchstart=event=>touchX=event.touches[0].clientX;img.ontouchend=event=>{const delta=event.changedTouches[0].clientX-touchX;if(Math.abs(delta)>70&&photos.length>1)artworkDetail(id,(index+(delta>0?-1:1)+photos.length)%photos.length);};
}
async function toggleFavorite(id){const next=structuredClone(state),w=next.artworks.find(w=>w.id===id);w.isFavorite=!w.isFavorite;await persist(next);render();}

function albumView(id){
  const a=state.albums.find(a=>a.id===id);if(!a)return albumsView();
  const works=new Map(state.artworks.map(w=>[w.id,w]));
  return `<div class="dashboard album-story"><header class="panel album-front">
    <div class="album-portrait">${albumCover(a)}</div>
    <h1>${e(a.title)}</h1>${a.description?'<p>'+e(a.description)+'</p>':''}
    <p>${a.childId?childLabel(a.childId):e(t('familyAlbum'))} · ${e(countText(a.orderedArtworkIds.length))}</p>
    <div class="buttons">${button('albumPick',t('addWorks'),'primary','plus')}
      <details><summary class="secondary">${e(t('edit'))}</summary>
        ${button('albumEdit',t('albumSettings'))}${button('albumDelete',t('delete'),'danger')}</details></div></header>
    ${a.orderedArtworkIds.length?'<div class="art-grid masonry album-gallery" data-album="'+e(id)+'">'+a.orderedArtworkIds.map((id,i)=>albumWorkCard(works.get(id),i,a.orderedArtworkIds.length)).join('')+'</div>':
      '<p class="dashboard-empty">'+e(t('emptyBook'))+'</p>'}
    <div class="panel"><label class="check"><input id="captions" type="checkbox" checked>${e(t('captions'))}</label>
      ${button('albumPDF',t('pdf'),'secondary','download',a.orderedArtworkIds.length?'':'disabled')}</div></div>`;
}
function albumWorkCard(work,index,count){
  const attrs='data-id="'+e(work.id)+'"';
  const menu='<details class="album-card-menu"><summary aria-label="'+e(t('artworkActions'))+'">···</summary><div>'+
    button('albumEarlier',t('moveUp'),'secondary','up',attrs+(index===0?' disabled':''))+
    button('albumLater',t('moveDown'),'secondary','down',attrs+(index===count-1?' disabled':''))+
    button('albumUnlink',t('unlink'),'secondary','close',attrs)+'</div></details>';
  return workCard(work).replace('</article>',menu+'</article>');
}
async function saveAlbumOrder(albumId,ids,focusId,focusAction){
  if(busy||updates.applying)return;
  const next=structuredClone(state),i=next.albums.findIndex(a=>a.id===albumId);
  if(i<0)return;
  busy=true;
  try{
    next.albums[i]=albumMembers(next.albums[i],ids);await persist(next);render();
    if(focusId){
      const action=app.querySelector('[data-action="'+focusAction+'"][data-id="'+focusId+'"]');
      const menu=action?.closest('details');if(menu){menu.open=true;(action.disabled?menu.querySelector('summary'):action).focus();}
    }
  }catch{toast(t(stale?'syncNotice':'saveError'));}finally{busy=false;}
}
function albumEditor(id,preselected=[]){
  const existing=state.albums.find(a=>a.id===id);
  let selected=[...(existing?.orderedArtworkIds||preselected)],child=existing?.childId||'';
  let cover=existing?.coverArtworkId||null,template=existing?.coverTemplate||'cream',showArt=!!cover;
  showModal(modalHeader(t(existing?'albumSettings':'createAlbum'))+`<form id="album-form"><div class="modal-body">
    <label class="field">${e(t('albumTitle'))}<input required maxlength="300" name="title" value="${e(existing?.title)}"></label>
    <label class="field">${e(t('description'))}<textarea maxlength="20000" name="description">${e(existing?.description)}</textarea></label>
    <label class="field">${e(t('child'))}<select name="child">${option('',t('familyAlbum'),child)+state.children.map(c=>option(c.id,c.name,child)).join('')}</select></label>
    <label class="field">${e(t('coverStyle'))}<select name="style">${['warm','minimal'].map(k=>option(k,t(k),existing?.coverStyle||'warm')).join('')}</select></label>
    <fieldset class="cover-options"><legend>${e(t('cover'))}</legend><div id="cover-preview"></div>
    <div id="cover-choices"></div></fieldset><div class="inline-error" role="alert"></div></div>${footer()}</form>`,{action:(action,el)=>{
      if(busy)return;
      if(action==='submit'){form.requestSubmit();return;}
      if(!['coverTemplate','coverArt','coverArtwork'].includes(action))return;
      if(action==='coverTemplate'){template=el.dataset.template;cover=null;showArt=false;}
      if(action==='coverArt'){showArt=!showArt;}
      if(action==='coverArtwork'){cover=el.dataset.id;}
      dirty=true;paint();
      const suffix=el.dataset.id?'[data-id="'+el.dataset.id+'"]':el.dataset.template?'[data-template="'+el.dataset.template+'"]':'';
      form.querySelector('[data-action="'+action+'"]'+suffix)?.focus({preventScroll:true});
    }});
  const form=modal.querySelector('form');modal.classList.add('album-dialog');modalCleanup=fitAlbumDialog(modal,form);
  function preview(){
    form.querySelector('#cover-preview').innerHTML=albumCover({title:form.elements.title.value,coverTemplate:template,coverArtworkId:cover});
    hydrate(modal);
  }
  function paint(){
    const choices=form.querySelector('#cover-choices');
    choices.innerHTML='<div class="cover-swatches">'+coverTemplates.map(key=>`<button type="button" class="cover-swatch" data-action="coverTemplate" data-template="${key}" aria-pressed="${!cover&&template===key}"><span class="jacket-${key}" aria-hidden="true">${motif(coverMotifs[key],'swatch-art')}</span>${e(t('jacket'+key))}</button>`).join('')+'</div>'+
      (selected.length?button('coverArt',t('childArtworkCover'),'secondary','','aria-expanded="'+showArt+'"'):'')+
      (showArt?'<div class="cover-artworks">'+selected.map(id=>{
        const work=state.artworks.find(w=>w.id===id);
        return `<button type="button" data-action="coverArtwork" data-id="${e(id)}" aria-pressed="${cover===id}" aria-label="${e(work.title||t('untitled'))}"><img data-path="${e(coverPath(work))}" alt=""></button>`;
      }).join('')+'</div>':'');
    preview();
  }
  form.oninput=event=>{dirty=true;if(event.target===form.elements.title)preview();};
  form.elements.child.onchange=()=>{
    const next=form.elements.child.value;
    const eligible=selected.filter(id=>!next||state.artworks.some(w=>w.id===id&&w.childId===next));
    if(eligible.length!==selected.length&&!confirm(t('changeAlbumChild'))){form.elements.child.value=child;return;}
    child=next;selected=eligible;
    if(!selected.includes(cover))cover=null;
    if(!selected.length)showArt=false;
    paint();
  };
  paint();form.onsubmit=async event=>{
    event.preventDefault();if(busy)return;
    const title=form.elements.title.value.trim();if(!title){inlineError(t('saveInvalid'));return;}
    busy=true;try{
      const next=structuredClone(state),record={...existing,id:id||crypto.randomUUID(),title,description:form.elements.description.value.trim(),
        childId:child||null,createdAt:existing?.createdAt||new Date().toISOString(),coverStyle:form.elements.style.value,
        orderedArtworkIds:selected,coverArtworkId:cover,coverTemplate:template};
      if(existing)next.albums[next.albums.findIndex(a=>a.id===id)]=record;else next.albums.push(record);
      await persist(next);closeModal(true);albumDetail(record.id);toast(t('saved'));
    }catch{inlineError(t('saveError'));}finally{busy=false;}
  };
}
async function linkWorks(id,ids){
  if(busy)return;
  busy=true;try{
    const next=structuredClone(state),i=next.albums.findIndex(a=>a.id===id),album=next.albums[i];
    next.albums[i]=albumMembers(album,[...album.orderedArtworkIds,...ids]);
    await persist(next);closeModal(true);render();toast(t('saved'));
  }catch{inlineError(t('saveError'));}finally{busy=false;}
}
function addToAlbum(workIds){
  const ids=Array.isArray(workIds)?workIds:[workIds],chosen=new Set(ids);
  const children=new Set(state.artworks.filter(w=>chosen.has(w.id)).map(w=>w.childId));
  const albums=state.albums.filter(a=>!a.childId||(children.size===1&&children.has(a.childId)));
  showModal(modalHeader(t('addToAlbumTitle'))+'<div class="modal-body">'+albums.map(a=>
    button('chooseAlbum',a.title,'secondary','','data-id="'+e(a.id)+'" '+(ids.every(id=>a.orderedArtworkIds.includes(id))?'disabled':''))).join('')+
    button('newAlbum',t('createAlbum'),'primary','plus')+'</div>',{narrow:true,action:async(action,el)=>{
      if(action==='chooseAlbum')await linkWorks(el.dataset.id,ids);
      if(action==='newAlbum')albumEditor(null,ids);
    }});
}
function pickWorks(album=null){
  const selected=new Set(),included=new Set(album?.orderedArtworkIds||[]);
  showModal(modalHeader(t('selectWorks'))+`<div class="modal-body">
    <label class="field">${e(t('search'))}<input id="pick-search" type="search"></label>
    <label class="field">${e(t('child'))}<select id="pick-child" ${album?.childId?'disabled':''}>
    ${option('',t('familyFilter'),album?.childId||'')+state.children.map(c=>option(c.id,c.name,album?.childId||'')).join('')}</select></label>
    <div id="pick-grid"></div><div class="inline-error" role="alert"></div></div>
    <footer class="modal-footer"><span id="pick-count" aria-live="polite"></span>${button('confirmPick',t('addAlbum'),'primary')}</footer>`,
    {wide:true,action:async(action,el)=>{
      if(busy)return;
      if(action==='pick'){
        const id=el.dataset.id;if(included.has(id))return;
        if(selected.has(id))selected.delete(id);else selected.add(id);
        dirty=selected.size>0;el.setAttribute('aria-pressed',String(selected.has(id)));updateCount();
      }
      if(action==='confirmPick'&&selected.size){
        if(album)await linkWorks(album.id,[...selected]);else addToAlbum([...selected]);
      }
    }});
  const search=modal.querySelector('#pick-search'),child=modal.querySelector('#pick-child');
  function updateCount(){modal.querySelector('#pick-count').textContent=t('selectedWorks')+' · '+selected.size;
    modal.querySelector('[data-action=confirmPick]').disabled=!selected.size;}
  function paint(){
    const works=filterWorks(state,{search:search.value,child:child.value});
    modal.querySelector('#pick-grid').innerHTML=works.length?'<div class="art-grid masonry">'+works.map(w=>workCard(w,'pick',selected.has(w.id)||included.has(w.id),included.has(w.id))).join('')+'</div>':e(t('noMatches'));
    updateCount();hydrate(modal);
  }
  search.oninput=paint;child.onchange=paint;paint();
}

function progress(title){showModal(modalHeader(title)+'<div class="loading-box"><div class="spinner"></div><p id="progress">'+e(t('working'))+'</p></div>');busy=true;}
async function exportPDF(album,captions){
  progress(t('pdfBuilding'));
  try{
    const result=await createPDF(state,album,getFile,captions,(n,total)=>{modal.querySelector('#progress').textContent=n+' / '+total;});
    busy=false;showModal(modalHeader(t('pdfReady'))+'<div class="modal-body"><p class="help">'+e(t('pdfNote'))+' · '+(album.orderedArtworkIds.length+1)+' '+e(t('allPages'))+'</p><div id="pdf-previews" class="pdf-previews"></div>'+(result.lowResolution?'<p class="warning">'+e(t('resolution'))+'</p>':'')+'</div><div class="modal-footer">'+button('close',t('close'))+button('downloadPDF',t('downloadPDF'),'primary','download')+'</div>',{wide:true,action:async action=>{if(action==='downloadPDF')download(result.blob,album.title.replace(/[\\/:*?"<>|]/g,'-')+'.pdf');}});
    modal.querySelector('#pdf-previews').innerHTML=result.previews.map(blob=>'<img src="'+temporaryURL(blob)+'" alt="'+e(t('pdf'))+'">').join('');
  }catch{busy=false;showModal(modalHeader(t('error'))+'<div class="modal-body"><p>'+e(t('saveError'))+'</p></div>');}
}
async function exportBackup(){
  progress(t('exportBackup'));
  try{
    const zip=await createBackup(state,getFile,(n,total)=>modal.querySelector('#progress').textContent=n+' / '+total);
    download(zip,appName+'-'+today()+'.zip');busy=false;closeModal(true);toast(t('backupDone'));
  }catch(error){
    busy=false;
    const key=error instanceof BackupLimitError
      ?(error.limit==='manifest'?'backupManifestTooLarge':'backupTooLarge')
      :'backupExportFailed';
    let message=t(key);
    if(error instanceof BackupPhotoError){
      message=t(error.messageKey).replace('{owner}',()=>error.label);
    }
    showModal(modalHeader(t('error'))+'<div class="modal-body"><p role="alert">'+e(message)+'</p></div>',{narrow:true});
  }
}
async function importBackup(file){
  progress(t('importCheck'));
  try{
    const {incoming,verifiedFiles}=await inspectBackup(file,(n,total)=>modal.querySelector('#progress').textContent=n+' / '+total);
    busy=false;
    showModal(modalHeader(t('importBackup'))+'<div class="modal-body"><h3>'+e(countText(incoming.artworks.length))+'</h3><p class="help">'+e(t('importConfirm'))+'</p></div><div class="modal-footer">'+button('close',t('cancel'))+button('merge',t('merge'),'primary')+'</div>',{narrow:true,action:async action=>{
      if(action!=='merge'||busy)return;busy=true;
      try{
        const {archive:next,puts,restore,skippedEdits}=await planRestore(demonstration?realState:state,incoming,verifiedFiles);
        if(demonstration){await commit(next,puts,[],null,restore);demonstration=false;state=realState=next;clearURLs();}
        else await persist(next,puts,[],null,restore);
        busy=false;closeModal(true);openArchive();
        if(skippedEdits)showModal(modalHeader(t('importBackup'))+'<div class="modal-body"><p>'+e(t('restoreSkipped').replace('{count}',String(skippedEdits)))+'</p></div>',{narrow:true});
        else toast(t('imported'));
      }catch{inlineError(t('restoreFailed'));}finally{busy=false;}
    }});
  }catch(error){busy=false;showModal(modalHeader(t('error'))+'<div class="modal-body"><p class="help" role="alert">'+e(t(error instanceof BackupLimitError?'restoreTooLarge':'invalidBackup'))+'</p></div>',{narrow:true});}
}
const backupInput=document.createElement('input');backupInput.type='file';backupInput.accept='.zip,application/zip';backupInput.hidden=true;document.body.append(backupInput);backupInput.onchange=()=>{if(backupInput.files[0])importBackup(backupInput.files[0]);backupInput.value='';};
app.onclick=async event=>{
  const el=event.target.closest('[data-action]');if(!el)return;
  if(updates.applying)return;
  if(el.dataset.action==='applyUpdate'){updates.apply();return;}
  pendingActions++;
  try{
    if(busy)return;
    const action=el.dataset.action;
    if(action==='nav'&&(section||page!==el.dataset.page)){rememberRoute();section=null;page=el.dataset.page;render();window.scrollTo(0,0);pushRoute();}
    if(action==='openArchive')openArchive();
    if(action==='openPeriod'||action==='openChildArchive'){
      rememberRoute();openArchive(el.dataset.period||'',el.dataset.id);pushRoute();
    }
    if(action==='language'){
      const previous=lang;
      setLanguage(el.dataset.language);
      if(demonstration&&previous!==lang)localizeDemo(previous);
      render();
    }
    if(action==='filterChild'){filters.child=el.dataset.id;page='archive';section=null;render();}
    if(action==='all'||action==='favorites'){filters.favorite=action==='favorites';render();}
    if(action==='category'){filters.category=el.dataset.category;render();}
    if(action==='clear')openArchive();
    if(action==='own')await enterOwn();
    if(action==='demo'){
      busy=true;
      try{const sample=await makeDemo();clearURLs();demonstration=true;state=sample;page='home';filters=archiveFilters();render();}
      finally{busy=false;}
    }
    if(action==='newChild'){if(demonstration)await enterOwn();else profileEditor();}
    if(action==='childPage')childPage(el.dataset.id);
    if(action==='editProfile')profileEditor(section.id);
    if(action==='childWorks'){rememberRoute();openArchive('',section.id);pushRoute();}
    if(['albumEarlier','albumLater','albumUnlink'].includes(action)){
      const album=state.albums.find(a=>a.id===section.id),id=el.dataset.id,ids=album.orderedArtworkIds;
      const index=ids.indexOf(id)+(action==='albumEarlier'?-1:1);
      await saveAlbumOrder(album.id,action==='albumUnlink'?ids.filter(value=>value!==id):moveWork(ids,id,index),
        action==='albumUnlink'?null:id,action);
    }
    if(action==='albumEdit')albumEditor(section.id);
    if(action==='albumPick')pickWorks(state.albums.find(a=>a.id===section.id));
    if(action==='albumPDF')await exportPDF(state.albums.find(a=>a.id===section.id),app.querySelector('#captions').checked);
    if(action==='albumDelete'&&confirm(t('albumDelete'))){
      busy=true;try{const next=structuredClone(state);next.albums=next.albums.filter(a=>a.id!==section.id);
        await persist(next);section=null;render();}finally{busy=false;}
    }
    if(action==='pickForAlbum')pickWorks();
    if(action==='newWork')await artworkEditor();
    if(action==='drafts')await showDrafts();
    if(action==='detail')await artworkDetail(el.dataset.id);
    if(action==='favorite')await toggleFavorite(el.dataset.id);
    if(action==='newAlbum')albumEditor();
    if(action==='album')albumDetail(el.dataset.id);
    if(action==='export')await exportBackup();
    if(action==='import')backupInput.click();
  }catch{toast(stale?t('syncNotice'):t('error'));}finally{pendingActions--;}
};
app.addEventListener('toggle',event=>{if(event.target.matches('.archive-options')&&event.target.isConnected)filtersExpanded=event.target.open;},true);
app.onchange=event=>{const map={'year-filter':'year','period-filter':'period','sort':'sort'};if(map[event.target.id]){filters[map[event.target.id]]=event.target.value;render();}};
let searchTimer;
app.oninput=event=>{
  if(event.target.id!=='search')return;
  filters.search=event.target.value;
  clearTimeout(searchTimer);
  searchTimer=setTimeout(()=>{
    if(page!=='archive')return;
    const works=filterWorks(state,filters);
    app.querySelector('#archive-count').textContent=countText(works.length);
    app.querySelector('#archive-results').innerHTML=archiveResults(works);
    app.querySelector('.archive-reset').hidden=!hasArchiveFilters();
    hydrate();
  },180);
};
window.addEventListener('beforeunload',event=>{if(dirty||busy){event.preventDefault();event.returnValue='';}});
if(typeof BroadcastChannel!=='undefined'){const channel=new BroadcastChannel('little-archive');channel.onmessage=event=>{if(!demonstration&&event.data?.source!==clientId){stale=true;toast(t('syncNotice'));}};}

const demoTitleKeys=['demoFlowers','demoRainbow','demoFish','demoHouse','demoSun','demoLeaf'];
function localizeDemo(previous){
  const samples=['flowers','rainbow','fish','house','sun','leaf'];
  function update(record,field,key){
    if(record?.[field]===t(key,previous))record[field]=t(key);
  }
  samples.forEach((sample,index)=>update(state.artworks.find(work=>work.id==='demo-'+sample),'title',demoTitleKeys[index]));
  update(state.artworks.find(work=>work.id==='demo-flowers'),'notes','demoNote');
  update(state.albums.find(album=>album.id==='demo-album'),'title','demoAlbum');
}
async function makeDemo(){
  const childId='demo-aurora';
  const samples=['flowers','rainbow','fish','house','sun','leaf'],dates=['2026-10-18','2026-10-12','2026-10-07','2026-09-24','2026-09-15','2026-09-08'];
  const result=emptyArchive();result.children.push({id:childId,name:'Aurora',birthDate:'2023-02-14',color:'#879989',profileImagePath:null});
  for(let i=0;i<samples.length;i++){
    const source=await (await fetch('./assets/'+samples[i]+'.svg')).blob(),converted=await raster(source,1200),id='demo-'+samples[i],path='images/'+id+'/original.jpg';
    demoFiles.set(path,converted.blob);demoFiles.set(path+'.thumb',(await raster(converted.blob,640)).blob);
    result.artworks.push({id,childId,title:t(demoTitleKeys[i]),artworkDate:dates[i],addedAt:dates[i]+'T12:00:00Z',category:['painting','drawing','drawing','drawing','painting','collage'][i],notes:i===0?t('demoNote'):'',isFavorite:i===0||i===2,coverImageId:id});
    result.images.push({id,artworkId:id,originalPath:path,editedPath:null,width:converted.width,height:converted.height,sortOrder:0});
  }
  result.albums.push({id:'demo-album',childId,title:t('demoAlbum'),createdAt:'2026-10-20T12:00:00Z',coverStyle:'warm',orderedArtworkIds:result.artworks.slice(0,4).map(w=>w.id)});
  return result;
}
localizeDocument();
app.querySelector('.boot span').textContent=t('boot');
try{realState=await readArchive();state=realState;render();if(await refreshDrafts()&&drafts.length)render();}
catch{app.innerHTML='<div class="empty">'+icon('lock')+'<h2>'+e(t('error'))+'</h2><p>'+e(t('storageError'))+'</p></div>';}
if('serviceWorker' in navigator)updates.start(navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}));

async function refreshDrafts(){
  try{
    const {items,unreadable}=await readDrafts();
    drafts=items;
    if(unreadable)toast(t('draftReadError'));
    return true;
  }catch{toast(t('draftReadError'));return false;}
}

async function showDrafts(){
  if(!await refreshDrafts())return;
  showModal(modalHeader(t('resumeDraft'))+'<div class="modal-body draft-list">'+drafts.map(d=>button('resume',(d.work.title||t('untitled'))+' · '+(state.children.find(c=>c.id===d.work.childId)?.name||t('child')),'secondary','','data-id="'+e(d.id)+'"')).join('')+'</div>',{action:async(action,el)=>{if(action==='resume'){const d=drafts.find(d=>d.id===el.dataset.id);if(d)await artworkEditor(null,d);}}});
}
