import {dailyMemory,chapters,layoutGallery} from './scrapbook.js';
import {editCrop} from './crop-editor.js';
import {storageErrorKey} from './storage-error.js';
import {draftQueue} from './draft-queue.js';
import {emptyArchive,today,validDate,ageAt,archiveFilters,dashboardData,filterWorks,deleteWork,validateArchive,categories,displayCategory,workCategory} from './domain.js';
import {createBackup,inspectBackup,planRestore} from './backup-restore.js';
import {readArchive,readFile,commit,clientId,readDrafts,saveDraft} from './db.js';
import {t,lang,setLanguage,dateText,countText,ageText,periodText} from './i18n.js';
import {preparePhoto,raster,loadImage,download,photoDate,chooseArtworkDate} from './media.js';
import {createPDF} from './pdf.js';
import {decoration,coverDecoration,albumTheme} from './ui.js';

const app=document.querySelector('#app'),modal=document.querySelector('#modal');
let state=emptyArchive(),realState,demonstration=false,page='home',filters=archiveFilters(),busy=false,dirty=false,stale=false;
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
function routeState(){return {archivePage:page,filters:{...filters},chapterChild,scroll:window.scrollY};}
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
    page=route.archivePage;filters={...archiveFilters(),...route.filters};chapterChild=route.chapterChild||'';
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
  if(root===app)layoutGallery(root.querySelector('.masonry'));
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
async function persist(next,puts=[],deletes=[],draft=null,missingOriginals=[]){
  if(stale&&!demonstration)throw Error(t('syncNotice'));
  if(demonstration){validateArchive(next);for(const[key,blob]of puts)demoFiles.set(key,blob);for(const key of deletes)demoFiles.delete(key);}
  else{await commit(next,puts,deletes,draft,missingOriginals);realState=next;}
  state=next;clearURLs();
}
function closeModal(force=false){
  if(busy&&!force){toast(t('busyClose'));return;}
  if(dirty&&!force&&draftActive&&draftState!=='saved'){toast(t(draftState==='saving'?'draftSaving':'draftError'));return;}
  if(dirty&&!force&&!confirm(t(draftActive?'draftClose':'discard')))return;
  dirty=false;imageObservers.get(modal)?.disconnect();modal.close();modalCleanup();modalCleanup=()=>{};draftActive=false;modal.innerHTML='';modalAction=null;
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

function navigation(mobile=false){return '<nav class="'+(mobile?'mobile-nav':'navigation')+'">'+[['home','home'],['archive','grid'],['albums','album'],['settings','settings']].map(([id,sym])=>button('nav',t(id),(mobile?'':'nav-button ')+(page===id?'active':''),sym,'data-page="'+id+'" aria-current="'+(page===id?'page':'false')+'"')).join('')+'</nav>';}
function render(){
  imagesById=new Map(state.images.map(image=>[image.id,image]));
  if(filters.child&&!state.children.some(c=>c.id===filters.child))filters.child='';
  document.documentElement.lang=lang;app.dataset.page=page;
  app.innerHTML='<aside class="sidebar"><div class="brand"><img src="./assets/icon.svg" alt=""><div><strong>Little Archive</strong><small>'+e(t('tagline'))+'</small></div></div>'+navigation()+
  '<div class="side-label">'+e(t('profiles'))+'</div>'+state.children.map(c=>'<button class="child-filter '+(filters.child===c.id?'selected':'')+'" data-action="filterChild" data-id="'+e(c.id)+'"><span class="child-dot" style="background:'+e(c.color)+'38">'+e(c.name[0])+'</span>'+e(c.name)+'</button>').join('')+
  button('newChild',t('addChild'),'child-filter add','plus')+'<div class="side-foot">'+icon('lock')+'<div>'+e(t('local'))+'<br>'+e(t('private'))+'</div></div></aside><main class="main">'+
  '<div class="topbar"><div class="mobile-brand"><img src="./assets/icon.svg" alt="">Little Archive</div><div class="breadcrumb">'+icon(page==='home'?'home':page==='archive'?'grid':page==='albums'?'album':'settings')+'<span>'+e(t(page))+'</span></div><div class="top-actions"><span class="status-pill"><i></i>'+e(t('onlyLocal'))+'</span><button class="language '+(lang==='ru'?'active':'')+'" data-action="language" data-language="ru" aria-label="Русский">RU</button><button class="language '+(lang==='en'?'active':'')+'" data-action="language" data-language="en" aria-label="English">EN</button>'+(page!=='home'?button('newWork','','global-add primary','plus','aria-label="'+e(t('addArtwork'))+'"'):'')+'</div></div>'+
  ({home:dashboardView,archive:archiveView,albums:albumsView,settings:settingsView}[page]())+'</main>'+navigation(true);
  hydrate();
}
let chapterChild='', filtersExpanded=false;
const memoryKey='little-archive-daily-memory';
const selections=new Map();
function memoryOfDay(){
  const key=demonstration?'demo':memoryKey,day=today();
  let previous=selections.get(key);
  if(!demonstration){try{previous=JSON.parse(localStorage.getItem(key))||previous;}catch{}}
  const work=dailyMemory(state.artworks,day,previous);
  if(work&&(previous?.day!==day||previous.id!==work.id)){
    const choice={day,id:work.id};
    if(!demonstration){try{localStorage.setItem(key,JSON.stringify(choice));}catch{}}
  }
  if(work)selections.set(key,{day,id:work.id});
  return work;
}
function displayTitle(work){return /\.(jpe?g|png|heic|heif|webp)$/i.test(work.title.trim())?'':work.title.trim();}
function dashboardView(){
  const child=state.children.find(c=>c.id===chapterChild)||state.children[0];
  const memory=memoryOfDay(),title=memory&&displayTitle(memory);
  return `<div class="dashboard"><header class="welcome-paper"><h1>Little Archive</h1>
    <p>${e(t(child?'welcomeFamily':'welcomeFirst'))}</p>${decoration('flower','welcome-flower')}
    ${button(child?'newWork':'newChild',t(child?'addDrawing':'addFirstChild'),'primary','plus')}
    ${child?'':button('demo',t('tryDemo'),'text-button','arrow')}</header>
    ${demoBanner()}${draftBanner()}
    <section class="dashboard-section"><h2>${e(t('dailyMemory'))}</h2>
    ${memory?`<button class="memory-card daily-card" data-action="detail" data-id="${e(memory.id)}">
      <img decoding="async" data-path="${e(coverPath(memory))}" alt="">
      <span>${title?`<strong>${e(title)}</strong>`:''}<small>${childLabel(memory.childId)}${validDate(memory.artworkDate)?' · '+e(dateText(memory.artworkDate)):''}</small>
      ${memory.notes?`<span class="memory-note">${e(memory.notes)}</span>`:''}</span></button>`:
      `<p class="dashboard-empty">${e(t('emptyHint'))}</p>`}</section>
    ${child?`<section class="dashboard-section"><h2>${e(t('growingArt'))}</h2>
      <label class="chapter-profile">${e(t('child'))} <select id="chapter-child">${state.children.map(c=>option(c.id,c.name,child.id)).join('')}</select></label>
      <div class="period-grid">${chapters(state.artworks,child).map(([period,count])=>
      `<button class="period-card tone-${period%5}" data-action="openPeriod" data-id="${e(child.id)}" data-period="${period}">
      <strong>${e(periodText(period))}</strong><span>${e(countText(count))}</span></button>`).join('')||`<p class="dashboard-empty">${e(t('emptyChapters'))}</p>`}</div></section>`:''}</div>`;
}
function refreshDailyMemory(){
  if(page==='home'&&app.querySelector('.dashboard')&&state.artworks.length&&selections.get(demonstration?'demo':memoryKey)?.day!==today())render();
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshDailyMemory();});
function scheduleMidnight(){
  const now=new Date(),next=new Date(now);next.setHours(24,0,0,0);
  setTimeout(()=>{refreshDailyMemory();scheduleMidnight();},next-now+100);
}
scheduleMidnight();
function draftBanner(){return drafts.length&&!demonstration?'<div class="draft-banner">'+button('drafts',t('resumeDraft')+' · '+drafts.length,'secondary','edit')+'</div>':'';}
function demoBanner(){return demonstration?'<div class="demo-banner">'+icon('spark')+'<div><strong>'+e(t('demo'))+'</strong><span>'+e(t('demoHint'))+'</span></div>'+button('own',t('start'),'text-button')+'</div>':'';}
function hero(title,subtitle,action,label){return '<section class="hero hero-'+page+'"><div class="hero-copy"><div class="eyebrow">'+e(t(page==='albums'?'albumEyebrow':'collection'))+'</div><h1>'+e(title)+'</h1><p>'+e(subtitle)+'</p></div>'+decoration(page==='albums'?'book':'flower','hero-decoration')+(action?button(action,label,'primary','plus'):'')+'</section>';}
function archiveHero(){
  const profiles=[{id:'',name:t('familyFilter')},...state.children];
  return `<section class="archive-home"><div class="archive-home-heading"><h1>${decoration('flower','home-flower')}${e(t('archive'))}</h1></div>
    <div class="child-tabs" role="group" aria-label="${e(t('profiles'))}">
      ${profiles.map(c=>button('filterChild',c.name,'child-tab '+(filters.child===c.id?'active':''),'',`data-id="${e(c.id)}" aria-pressed="${filters.child===c.id}"`)).join('')}
    </div></section>`;
}
function option(value,label,selected){return '<option value="'+e(value)+'" '+(value===selected?'selected':'')+'>'+e(label)+'</option>';}
function workCard(w){
  const image=imagesById.get(w.coverImageId);
  const label=[displayTitle(w)||t('untitled'),childLabel(w.childId),validDate(w.artworkDate)?dateText(w.artworkDate):''].filter(Boolean);
  return `<article class="work-card" data-ratio="${image.height/image.width}"><button class="work-open" data-action="detail" data-id="${e(w.id)}" aria-label="${e(label[0])} · ${label[1]} ${e(label[2])}">
    <img loading="lazy" decoding="async" width="${image.width}" height="${image.height}" data-path="${e(coverPath(w))}" alt=""></button></article>`;
}
function emptyView(title,message,action,label,symbol='frame'){return '<div class="empty empty-'+symbol+'">'+decoration(symbol,'empty-art')+'<h2>'+e(title)+'</h2><p>'+e(message)+'</p>'+button(action,label,'primary',action==='clear'?'arrow':'plus')+'</div>';}
function hasArchiveFilters(){
  const defaults=archiveFilters();
  return Object.keys(defaults).some(key=>filters[key]!==defaults[key]);
}
function archiveResults(works){
  if(works.length)return '<div class="art-grid masonry">'+works.map(workCard).join('')+'</div>';
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
  '<div class="collection-label"><select id="sort" aria-label="'+e(t('newest'))+'" style="width:auto;border:0;background:none;padding:0;font-size:11px">'+[['newest','newest'],['oldest','oldest'],['age','byAge'],['category','byCategory']].map(([id,key])=>option(id,t(key),filters.sort)).join('')+'</select></div>'+
  '<div class="category-chips">'+button('category',t('anyCategory'),'chip '+(!filters.category?'active':''),'','data-category=""')+categories.map(c=>button('category',t(c),'chip '+(filters.category===c?'active':''),'','data-category="'+c+'"')).join('')+'</div>'+
  '<div class="age-filter-row"><select id="period-filter" aria-label="'+e(t('ageCollections'))+'">'+option('',t('allAges'),filters.period)+[...periods].sort((a,b)=>a-b).map(n=>option(String(n),periodText(n),filters.period)).join('')+'</select>'+
  '</div></details>'+
  '<div class="collection-label"><strong id="archive-count" aria-live="polite">'+e(countText(works.length))+'</strong>'+ button('clear',t('clearFilters'),'text-button archive-reset','',hasArchiveFilters()?'':'hidden')+'</div>'+
  '<div id="archive-results">'+archiveResults(works)+'</div>';
}
function albumsView(){return hero(t('albumHeadline'),t('albumSubtitle'),'newAlbum',t('createAlbum'))+demoBanner()+(state.albums.length?'<div class="album-grid">'+state.albums.map(a=>{const theme=albumTheme(a.id);return '<button class="book-card" data-action="album" data-id="'+e(a.id)+'"><div class="album-cover theme-'+theme+'">'+coverDecoration(theme)+'<div class="book-imprint">Little Archive</div><h3>'+e(a.title)+'</h3><div class="book-owner">'+childLabel(a.childId)+'</div><div class="book-number">'+e(t('theme'+theme))+'</div></div><div class="book-caption"><span>'+e(countText(a.orderedArtworkIds.length))+'</span>'+icon('chevron')+'</div></button>';}).join('')+'</div>':emptyView(t('emptyAlbums'),t('emptyAlbumsHint'),'newAlbum',t('createAlbum'),'book'));}
function settingsView(){return hero(t('settingsHeadline'),t('local'))+demoBanner()+'<div class="settings-grid"><section class="panel"><h2>'+icon('photo')+e(t('profiles'))+'</h2>'+state.children.map(c=>'<div class="profile-row"><span class="child-dot" style="background:'+e(c.color)+'40">'+e(c.name[0])+'</span><div>'+e(c.name)+(c.birthDate?'<small>'+e(dateText(c.birthDate))+'</small>':'')+'</div>'+button('editChild',t('edit'),'text-button','','data-id="'+e(c.id)+'"')+'</div>').join('')+button('newChild',t('addChild'),'secondary','plus')+'</section>'+
  '<section class="panel"><h2>'+icon('download')+e(t('backup'))+'</h2><p>'+e(t('backupHint'))+'</p><div class="buttons">'+button('export',t('exportBackup'),'secondary','download')+button('import',t('importBackup'),'secondary','upload')+'</div><p class="warning">'+e(t('backupWarning'))+'</p></section>'+
  '<section class="panel"><h2>'+icon('lock')+e(t('privacyTitle'))+'</h2><p>'+e(t('privacyBody'))+'</p><p class="web-note">'+e(t('webNote'))+'</p></section><section class="panel"><h2>'+e(t('language'))+'</h2><div class="buttons">'+button('language','Русский',lang==='ru'?'primary':'secondary','','data-language="ru"')+button('language','English',lang==='en'?'primary':'secondary','','data-language="en"')+'</div></section></div>';}
function openArchive(period='',child=''){clearTimeout(searchTimer);filters={...archiveFilters(),period,child};page='archive';render();window.scrollTo(0,0);}
async function enterOwn(){demonstration=false;state=realState;page='home';filters=archiveFilters();clearURLs();render();if(!state.children.length)profileEditor();}

function profileEditor(id){
  const child=state.children.find(c=>c.id===id);
  const first=!child&&!state.children.length;
  showModal(modalHeader(child?t('profile'):t(first?'addFirstChild':'addChild'))+`<form id="profile-form"><div class="modal-body">
    <label class="field">${e(t('name'))}<input name="name" maxlength="120" required autocomplete="given-name" value="${e(child?.name||'')}"></label>
    <label class="field">${e(t(first?'requiredBirthday':'birthday'))}<input type="date" name="birthday" max="${today()}" ${first?'required':''} value="${e(child?.birthDate||'')}"></label>
    ${first?'':`<label class="field">${e(t('color'))}<input type="color" name="color" value="${e(child?.color||'#879989')}"></label>`}</div>${footer()}</form>`,{narrow:true,action:async action=>{if(action==='submit'&&!busy)modal.querySelector('form').requestSubmit();}});
  const form=modal.querySelector('form');form.oninput=()=>dirty=true;
  form.onsubmit=async event=>{
    event.preventDefault();if(busy)return;const f=new FormData(form),name=f.get('name').trim();if(!name)return;
    if(first&&!validDate(f.get('birthday'))){inlineError(t('saveInvalid'));return;}
    busy=true;
    try{const next=structuredClone(state),record={profileImagePath:null,...child,id:id||crypto.randomUUID(),name,birthDate:f.get('birthday')||null,color:f.get('color')||'#879989'};
      if(child)next.children[next.children.findIndex(c=>c.id===id)]=record;else next.children.push(record);
      await persist(next);
      if(first){page='home';rememberChild(record.id);}
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
  modalCleanup=()=>{queue.flush().catch(()=>{}).then(async()=>{await refreshDrafts();render();});};
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
    editCrop(source,p.cropSettings,!!p.edited&&!p.cropSettings,t,async recipe=>{
      const full=recipe.rotation===0&&recipe.x<1e-9&&recipe.y<1e-9&&recipe.w>1-1e-9&&recipe.h>1-1e-9;
      if(full&&!p.edited)return;
      const result=full?null:await raster(source,4096,recipe.rotation,recipe);
      const thumb=(await raster(result?.blob||source,640)).blob;
      Object.assign(p,{edited:result?.blob||null,thumb,width:result?.width||source.naturalWidth,
        height:result?.height||source.naturalHeight,cropSettings:full?null:recipe,changed:true});
      dirty=true;paintPhotos();
    },onCancel);
  }
  if(originalWork){
    busy=true;
    try{
      const loaded=[];
      for(const meta of state.images.filter(i=>i.artworkId===id).sort((a,b)=>a.sortOrder-b.sortOrder)){
        const original=await getFile(meta.originalPath),edited=meta.editedPath?await getFile(meta.editedPath):null;
        let generatedThumb=false;
        const thumb=await getFile(meta.originalPath+'.thumb').catch(async()=>{generatedThumb=true;return (await raster(edited||original,640)).blob;});
        loaded.push({id:meta.id,original,edited,width:meta.width,height:meta.height,thumb,meta,cropSettings:meta.cropSettings,generatedThumb});
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
        next.images.push({...p.meta,id:p.id,artworkId,originalPath,editedPath,...(p.changed||p.cropSettings?{cropSettings:p.cropSettings??null}:{}),width:p.width,height:p.height,sortOrder:p.meta?.sortOrder??order});
      }
      for(const album of next.albums)if(album.childId!==record.childId)album.orderedArtworkIds=album.orderedArtworkIds.filter(x=>x!==artworkId);
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
        const blob=await getFile(photo.editedPath||photo.originalPath),file=new File([blob],(work.title||'artwork').replace(/[\\/:*?"<>|]/g,'-')+'.'+(photo.editedPath||photo.originalPath).split('.').at(-1),{type:blob.type||'image/jpeg'});
        if(navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:work.title});}catch(error){if(error.name!=='AbortError')download(file,file.name);}}else download(file,file.name);
      }
    }});
  const img=modal.querySelector('#detail-image');
  try{img.src=temporaryURL((await raster(await getFile(photo.editedPath||photo.originalPath),2200)).blob);}catch{img.alt=t('imageError');}
  const zoom=()=>img.classList.toggle('zoomed');img.onclick=zoom;img.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();zoom();}};
  let touchX=0;img.ontouchstart=event=>touchX=event.touches[0].clientX;img.ontouchend=event=>{const delta=event.changedTouches[0].clientX-touchX;if(Math.abs(delta)>70&&photos.length>1)artworkDetail(id,(index+(delta>0?-1:1)+photos.length)%photos.length);};
}
async function toggleFavorite(id){const next=structuredClone(state),w=next.artworks.find(w=>w.id===id);w.isFavorite=!w.isFavorite;await persist(next);render();}

function albumEditor(id,preselected=[]){
  if(!state.children.length){profileEditor();return;}
  const existing=state.albums.find(a=>a.id===id);let selected=[...(existing?.orderedArtworkIds||preselected)],child=existing?.childId||state.artworks.find(w=>w.id===preselected[0])?.childId||filters.child||state.children[0].id,dragId=null;
  showModal(modalHeader(t(existing?'edit':'createAlbum'))+'<form id="album-form"><div class="modal-body"><div class="form-row"><label class="field">'+e(t('albumTitle'))+'<input required name="title" maxlength="300" placeholder="'+e(t('albumPlaceholder'))+'" value="'+e(existing?.title||'')+'"></label><label class="field">'+e(t('child'))+'<select name="child">'+state.children.map(c=>option(c.id,c.name,child)).join('')+'</select></label></div><fieldset class="pdf-style-picker"><legend>'+e(t('coverStyle'))+'</legend>'+['minimal','warm'].map(style=>'<label class="pdf-style '+style+'"><input type="radio" name="style" value="'+style+'" '+((existing?.coverStyle||'warm')===style?'checked':'')+'><span class="mini-page">Aa<span></span></span><strong>'+e(t(style))+'</strong></label>').join('')+'</fieldset><h3 style="font-size:14px">'+e(t('selectWorks'))+'</h3><div id="work-selection" class="selection-grid"></div><h3 style="font-size:14px">'+e(t('order'))+'</h3><p class="help">'+e(t('orderHint'))+'</p><div id="work-order"></div><div class="inline-error" role="alert"></div></div>'+footer()+'</form>',{action:async(action,el)=>{
    const workId=el.dataset.id;
    if(action==='select'){selected=selected.includes(workId)?selected.filter(x=>x!==workId):[...selected,workId];dirty=true;paint();}
    if(action==='up'||action==='down'){const a=selected.indexOf(workId),b=a+(action==='up'?-1:1);if(b>=0&&b<selected.length){[selected[a],selected[b]]=[selected[b],selected[a]];dirty=true;paint();}}
    if(action==='submit')modal.querySelector('form').requestSubmit();
  }});
  const form=modal.querySelector('form');form.oninput=()=>dirty=true;form.elements.child.onchange=()=>{child=form.elements.child.value;selected=selected.filter(id=>state.artworks.some(w=>w.id===id&&w.childId===child));dirty=true;paint();};
  function paint(){
    modal.querySelector('#work-selection').innerHTML=state.artworks.filter(w=>w.childId===child).map(w=>'<button type="button" class="select-work '+(selected.includes(w.id)?'selected':'')+'" data-action="select" data-id="'+w.id+'" aria-pressed="'+selected.includes(w.id)+'"><img data-path="'+e(coverPath(w))+'" alt=""><span>'+e(w.title||t('untitled'))+'</span>'+(selected.includes(w.id)?'<i>'+(selected.indexOf(w.id)+1)+'</i>':'')+'</button>').join('')||'<p class="help">'+e(t('noWorks'))+'</p>';
    const order=modal.querySelector('#work-order');order.innerHTML=selected.map((id,i)=>{const w=state.artworks.find(w=>w.id===id);return '<div class="order-item" draggable="true" data-id="'+id+'"><span style="flex:0">'+(i+1)+'</span><img data-path="'+e(coverPath(w))+'" alt=""><span>'+e(w.title||t('untitled'))+'</span>'+button('up','','icon-button','up','type="button" data-id="'+id+'" aria-label="'+e(t('moveUp'))+'"')+button('down','','icon-button','down','type="button" data-id="'+id+'" aria-label="'+e(t('moveDown'))+'"')+'</div>';}).join('');
    order.ondragstart=event=>{dragId=event.target.closest('.order-item')?.dataset.id;};order.ondragover=event=>event.preventDefault();order.ondrop=event=>{event.preventDefault();const target=event.target.closest('.order-item')?.dataset.id;if(dragId&&target&&dragId!==target){const from=selected.indexOf(dragId),to=selected.indexOf(target);selected.splice(from,1);selected.splice(to,0,dragId);dirty=true;paint();}};
    hydrate(modal);
  }
  paint();
  form.onsubmit=async event=>{event.preventDefault();if(busy)return;busy=true;try{
    const next=structuredClone(state),data=new FormData(form),record={id:id||crypto.randomUUID(),childId:child,title:data.get('title').trim(),createdAt:existing?.createdAt||new Date().toISOString(),coverStyle:data.get('style'),orderedArtworkIds:selected};
    if(!record.title)return;if(existing)next.albums[next.albums.findIndex(a=>a.id===id)]=record;else next.albums.push(record);
    await persist(next);busy=false;closeModal(true);page='albums';render();toast(t('saved'));
  }catch{inlineError(t('saveError'));}finally{busy=false;}};
}
function addToAlbum(workId){
  const w=state.artworks.find(w=>w.id===workId),albums=state.albums.filter(a=>a.childId===w.childId);
  showModal(modalHeader(t('addToAlbumTitle'))+'<div class="modal-body">'+(albums.length?albums.map(a=>button('chooseAlbum',a.title,'secondary','','data-id="'+a.id+'" style="width:100%;margin-bottom:10px"')).join(''):'<p class="help">'+e(t('noAlbum'))+'</p>')+button('newAlbum',t('createAlbum'),'primary','plus')+'</div>',{narrow:true,action:async(action,el)=>{
    if(action==='newAlbum')albumEditor(null,[workId]);
    if(action==='chooseAlbum'){const next=structuredClone(state),a=next.albums.find(a=>a.id===el.dataset.id);if(!a.orderedArtworkIds.includes(workId))a.orderedArtworkIds.push(workId);await persist(next);closeModal(true);render();toast(t('saved'));}
  }});
}
function albumDetail(id){
  const a=state.albums.find(a=>a.id===id);
  showModal(modalHeader(a.title)+'<div class="modal-body"><p class="help">'+childLabel(a.childId)+' · '+e(countText(a.orderedArtworkIds.length))+'</p><div class="selection-grid">'+a.orderedArtworkIds.map(id=>{const w=state.artworks.find(w=>w.id===id);return '<div class="select-work"><img data-path="'+e(coverPath(w))+'" alt=""><span>'+e(w.title||t('untitled'))+'</span></div>';}).join('')+'</div><label class="check"><input id="captions" type="checkbox" checked>'+e(t('captions'))+'</label><p class="help">'+e(t('pdfNote'))+'</p></div><div class="modal-footer">'+button('delete',t('delete'),'danger')+button('edit',t('edit'))+button('pdf',t('pdf'),'primary','download',a.orderedArtworkIds.length?'':'disabled')+'</div>',{action:async action=>{
    if(action==='edit')albumEditor(id);
    if(action==='delete'&&confirm(t('albumDelete'))){const next=structuredClone(state);next.albums=next.albums.filter(x=>x.id!==id);await persist(next);closeModal(true);render();}
    if(action==='pdf')exportPDF(a,modal.querySelector('#captions').checked);
  }});hydrate(modal);
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
    busy=false;closeModal(true);download(zip,'LittleArchive-'+today()+'.zip');toast(t('backupDone'));
  }catch{busy=false;inlineError(t('saveError'));}
}
async function importBackup(file){
  progress(t('importCheck'));
  try{
    const {incoming,verifiedFiles}=await inspectBackup(file,(n,total)=>modal.querySelector('#progress').textContent=n+' / '+total);
    busy=false;
    showModal(modalHeader(t('importBackup'))+'<div class="modal-body"><h3>'+e(countText(incoming.artworks.length))+'</h3><p class="help">'+e(t('importConfirm'))+'</p></div><div class="modal-footer">'+button('close',t('cancel'))+button('merge',t('merge'),'primary')+'</div>',{narrow:true,action:async action=>{
      if(action!=='merge'||busy)return;busy=true;
      try{
        const {archive:next,puts,missingOriginals}=planRestore(demonstration?realState:state,incoming,verifiedFiles);
        if(demonstration){await commit(next,puts,[],null,missingOriginals);demonstration=false;state=realState=next;clearURLs();}
        else await persist(next,puts,[],null,missingOriginals);
        busy=false;closeModal(true);openArchive();toast(t('imported'));
      }catch{inlineError(t('invalidBackup'));}finally{busy=false;}
    }});
  }catch{busy=false;showModal(modalHeader(t('error'))+'<div class="modal-body"><p class="help">'+e(t('invalidBackup'))+'</p></div>',{narrow:true});}
}
const backupInput=document.createElement('input');backupInput.type='file';backupInput.accept='.zip,application/zip';backupInput.hidden=true;document.body.append(backupInput);backupInput.onchange=()=>{if(backupInput.files[0])importBackup(backupInput.files[0]);backupInput.value='';};
app.onclick=async event=>{
  const el=event.target.closest('[data-action]');if(!el)return;
  try{
    if(busy)return;
    const action=el.dataset.action;
    if(action==='nav'&&page!==el.dataset.page){rememberRoute();page=el.dataset.page;render();window.scrollTo(0,0);pushRoute();}
    if(action==='openArchive')openArchive();
    if(action==='openPeriod'){rememberRoute();openArchive(el.dataset.period,el.dataset.id);pushRoute();}
    if(action==='language'){setLanguage(el.dataset.language);render();}
    if(action==='filterChild'){filters.child=el.dataset.id;page='archive';render();}
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
    if(action==='editChild')profileEditor(el.dataset.id);
    if(action==='newWork')await artworkEditor();
    if(action==='drafts')await showDrafts();
    if(action==='detail')await artworkDetail(el.dataset.id);
    if(action==='favorite')await toggleFavorite(el.dataset.id);
    if(action==='newAlbum')albumEditor();
    if(action==='album')albumDetail(el.dataset.id);
    if(action==='export')await exportBackup();
    if(action==='import')backupInput.click();
  }catch{toast(stale?t('syncNotice'):t('error'));}
};
app.addEventListener('toggle',event=>{if(event.target.matches('.archive-options')&&event.target.isConnected)filtersExpanded=event.target.open;},true);
app.onchange=event=>{if(event.target.id==='chapter-child'){chapterChild=event.target.value;render();return;}const map={'year-filter':'year','period-filter':'period','sort':'sort'};if(map[event.target.id]){filters[map[event.target.id]]=event.target.value;render();}};
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

async function makeDemo(){
  const childId='demo-aurora',names=lang==='ru'?['Цветы для мамы','После дождя','Рыбка мечты','Наш уютный дом','Солнечный день','Осенние сокровища']:['Flowers for mum','After the rain','A little dream fish','Home, sweet home','A sunny kind of day','Autumn treasures'];
  const samples=['flowers','rainbow','fish','house','sun','leaf'],dates=['2026-10-18','2026-10-12','2026-10-07','2026-09-24','2026-09-15','2026-09-08'];
  const result=emptyArchive();result.children.push({id:childId,name:lang==='ru'?'Аврора':'Aurora',birthDate:'2023-02-14',color:'#879989',profileImagePath:null});
  for(let i=0;i<samples.length;i++){
    const source=await (await fetch('./assets/'+samples[i]+'.svg')).blob(),converted=await raster(source,1200),id='demo-'+samples[i],path='images/'+id+'/original.jpg';
    demoFiles.set(path,converted.blob);demoFiles.set(path+'.thumb',(await raster(converted.blob,640)).blob);
    result.artworks.push({id,childId,title:names[i],artworkDate:dates[i],addedAt:dates[i]+'T12:00:00Z',category:['painting','drawing','drawing','drawing','painting','collage'][i],notes:i===0?(lang==='ru'?'«Это тебе, мама. Чтобы цветы были всегда».':'“These are for you, mum. So the flowers stay forever.”'):'',isFavorite:i===0||i===2,coverImageId:id});
    result.images.push({id,artworkId:id,originalPath:path,editedPath:null,width:converted.width,height:converted.height,sortOrder:0});
  }
  result.albums.push({id:'demo-album',childId,title:lang==='ru'?'Маленькие открытия':'Little discoveries',createdAt:'2026-10-20T12:00:00Z',coverStyle:'warm',orderedArtworkIds:result.artworks.slice(0,4).map(w=>w.id)});
  return result;
}
try{realState=await readArchive();state=realState;render();if(await refreshDrafts()&&drafts.length)render();}
catch{app.innerHTML='<div class="empty">'+icon('lock')+'<h2>'+e(t('error'))+'</h2><p>'+e(t('storageError'))+'</p></div>';}
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});

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
