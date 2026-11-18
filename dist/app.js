import {storageErrorKey} from './storage-error.js';
import {draftQueue} from './draft-queue.js';
import {emptyArchive,today,ageAt,filterWorks,deleteWork,validateArchive,categories,normalizeCategories} from './domain.js';
import {createBackup,inspectBackup,planRestore} from './backup-restore.js';
import {readArchive,readFile,commit,clientId,readDrafts,saveDraft} from './db.js';
import {t,lang,setLanguage,dateText,countText,ageText} from './i18n.js';
import {preparePhoto,raster,loadImage,download} from './media.js';
import {createPDF} from './pdf.js';
import {decoration,coverDecoration,albumTheme,visualIndex} from './ui.js';

const app=document.querySelector('#app'),modal=document.querySelector('#modal');
let state=emptyArchive(),realState,demonstration=false,page='archive',filters={child:'',favorite:false,year:'',category:'',sort:'newest',search:''},busy=false,dirty=false,stale=false;
let drafts=[],draftActive=false,draftState="idle";
let modalCleanup=()=>{},modalAction=null,toastTimer;
const demoFiles=new Map(),urlCache=new Map(),modalUrls=[];
const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons={
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
  const url=URL.createObjectURL(await getFile(path));urlCache.set(path,url);
  if(urlCache.size>90){const first=urlCache.keys().next().value;URL.revokeObjectURL(urlCache.get(first));urlCache.delete(first);}
  return url;
}
function clearURLs(){for(const url of urlCache.values())URL.revokeObjectURL(url);urlCache.clear();}
function temporaryURL(blob){const url=URL.createObjectURL(blob);modalUrls.push(url);return url;}
async function hydrate(root=app){
  await Promise.allSettled([...root.querySelectorAll('img[data-path]')].map(async image=>{
    try{const path=image.dataset.path;image.src=await imageURL(path);}
    catch{image.alt=lang==='ru'?'Фотография недоступна':'Photo unavailable';}
  }));
}
function coverPath(work){const image=state.images.find(i=>i.id===work?.coverImageId);return image?image.originalPath+'.thumb':'';}
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
  dirty=false;modal.close();modalCleanup();modalCleanup=()=>{};draftActive=false;modal.innerHTML='';modalAction=null;
  for(const url of modalUrls.splice(0))URL.revokeObjectURL(url);
}
function showModal(content,{wide=false,narrow=false,action=null}={}){
  closeModal(true);modal.className=wide?'wide':narrow?'narrow':'';modal.innerHTML=content;modalAction=action;modal.showModal();
}
const modalHeader=title=>'<header class="modal-header"><h2>'+e(title)+'</h2>'+button('close',t('close'),'icon-button','close','aria-label="'+e(t('close'))+'"')+'</header>';
const footer=(label=t('save'),action='submit')=>'<footer class="modal-footer">'+button('close',t('cancel'))+button(action,label,'primary')+'</footer>';
modal.addEventListener('cancel',event=>{event.preventDefault();closeModal();});
modal.addEventListener('click',event=>{const el=event.target.closest('[data-action]');if(!el)return;if(el.dataset.action==='close')closeModal();else if(modalAction)Promise.resolve(modalAction(el.dataset.action,el,event)).catch(()=>inlineError(t('saveError')));});

function navigation(mobile=false){return '<nav class="'+(mobile?'mobile-nav':'navigation')+'">'+[['archive','grid'],['albums','album'],['settings','settings']].map(([id,sym])=>button('nav',t(id),(mobile?'':'nav-button ')+(page===id?'active':''),sym,'data-page="'+id+'" aria-current="'+(page===id?'page':'false')+'"')).join('')+'</nav>';}
function render(){
  if(!state.children.some(c=>c.id===filters.child))filters.child=state.children[0]?.id||'';
  document.documentElement.lang=lang;app.dataset.page=page;
  app.innerHTML='<aside class="sidebar"><div class="brand"><img src="./assets/icon.svg" alt=""><div><strong>Little Archive</strong><small>'+e(t('tagline'))+'</small></div></div>'+navigation()+
  '<div class="side-label">'+e(t('profiles'))+'</div>'+state.children.map(c=>'<button class="child-filter '+(filters.child===c.id?'selected':'')+'" data-action="filterChild" data-id="'+e(c.id)+'"><span class="child-dot" style="background:'+e(c.color)+'38">'+e(c.name[0])+'</span>'+e(c.name)+'</button>').join('')+
  button('newChild',t('addChild'),'child-filter add','plus')+'<div class="side-foot">'+icon('lock')+'<div>'+e(t('local'))+'<br>'+e(t('private'))+'</div></div></aside><main class="main">'+
  '<div class="topbar"><div class="mobile-brand"><img src="./assets/icon.svg" alt="">Little Archive</div><div class="breadcrumb">'+icon(page==='archive'?'grid':page==='albums'?'album':'settings')+'<span>'+e(t(page))+'</span></div><div class="top-actions"><span class="status-pill"><i></i>'+e(t('onlyLocal'))+'</span><button class="language '+(lang==='ru'?'active':'')+'" data-action="language" data-language="ru" aria-label="Русский">RU</button><button class="language '+(lang==='en'?'active':'')+'" data-action="language" data-language="en" aria-label="English">EN</button></div></div>'+
  (page==='archive'?archiveView():page==='albums'?albumsView():settingsView())+'</main>'+navigation(true);
  hydrate();
}
function demoBanner(){return demonstration?'<div class="demo-banner">'+icon('spark')+'<div><strong>'+e(t('demo'))+'</strong><span>'+e(t('demoHint'))+'</span></div>'+button('own',t('start'),'text-button')+'</div>':'';}
function hero(title,subtitle,action,label){return '<section class="hero hero-'+page+'"><div class="hero-copy"><div class="eyebrow">'+e(t(page==='albums'?'albumEyebrow':'collection'))+'</div><h1>'+e(title)+'</h1><p>'+e(subtitle)+'</p></div>'+decoration(page==='albums'?'book':'flower','hero-decoration')+(action?button(action,label,'primary','plus'):'')+'</section>';}
function archiveHero(){return '<section class="archive-home"><div class="archive-home-heading"><h1>'+decoration('flower','home-flower')+e(t('archive'))+'</h1></div>'+button('newWork',t('addPhoto'),'primary','plus')+'<div class="child-tabs" role="group" aria-label="'+e(t('profiles'))+'">'+state.children.map(c=>button('filterChild',c.name,'child-tab '+(filters.child===c.id?'active':''),'','data-id="'+e(c.id)+'" aria-pressed="'+(filters.child===c.id)+'"')).join('')+button('newChild',t('addChild'),'child-tab add-child','plus')+'</div></section>';}
function option(value,label,selected){return '<option value="'+e(value)+'" '+(value===selected?'selected':'')+'>'+e(label)+'</option>';}
function workCard(w){return '<article class="work-card tone-'+visualIndex(w.id,5)+'"><button class="work-open" data-action="detail" data-id="'+e(w.id)+'"><div class="art-frame"><img loading="lazy" data-path="'+e(coverPath(w))+'" alt="'+e(w.title||t('untitled'))+'"></div><div class="card-caption"><h3>'+e(w.title||t('untitled'))+'</h3><div class="card-meta">'+childLabel(w.childId,w.artworkDate)+'</div><div class="card-bottom"><time datetime="'+e(w.artworkDate)+'">'+e(dateText(w.artworkDate))+'</time><span class="category-tag">'+e(t(w.category))+'</span></div></div></button>'+button('favorite','', 'icon-button fav '+(w.isFavorite?'selected':''),'heart','data-id="'+e(w.id)+'" aria-label="'+e(t(w.isFavorite?'unfavorite':'favorite'))+'" aria-pressed="'+w.isFavorite+'"')+'</article>';}
function emptyView(title,message,action,label,symbol='frame'){return '<div class="empty empty-'+symbol+'">'+decoration(symbol,'empty-art')+'<h2>'+e(title)+'</h2><p>'+e(message)+'</p>'+button(action,label,'primary',action==='clear'?'arrow':'plus')+'</div>';}
function archiveView(){
  const works=filterWorks(state,filters),years=[...new Set(state.artworks.filter(w=>w.childId===filters.child).map(w=>w.artworkDate.slice(0,4)))].sort().reverse();
  return archiveHero()+demoBanner()+(drafts.length&&!demonstration?'<div class="draft-banner">'+button('drafts',t('resumeDraft')+' · '+drafts.length,'secondary','edit')+'</div>':'')+
  '<div class="filter-row"><div class="segmented">'+button('all',t('all'),!filters.favorite?'active':'')+button('favorites',t('favorites'),filters.favorite?'active':'','heart')+'</div><span class="spacer"></span><div class="search">'+icon('search')+'<input id="search" value="'+e(filters.search)+'" aria-label="'+e(t('search'))+'" placeholder="'+e(t('search'))+'"></div><select id="year-filter" class="year-select" aria-label="'+e(t('anyYear'))+'">'+option('',t('anyYear'),filters.year)+years.map(y=>option(y,y,filters.year)).join('')+'</select></div>'+
  '<div class="collection-label"><strong>'+e(countText(works.length))+'</strong><select id="sort" aria-label="'+e(t('newest'))+'" style="width:auto;border:0;background:none;padding:0;font-size:11px">'+[['newest','newest'],['oldest','oldest'],['age','byAge'],['category','byCategory']].map(([id,key])=>option(id,t(key),filters.sort)).join('')+'</select></div>'+
  '<div class="category-chips">'+button('category',t('anyCategory'),'chip '+(!filters.category?'active':''),'','data-category=""')+categories.map(c=>button('category',t(c),'chip '+(filters.category===c?'active':''),'','data-category="'+c+'"')).join('')+'</div>'+
  (works.length?'<div class="art-grid">'+works.map(workCard).join('')+'</div>':state.artworks.some(w=>w.childId===filters.child)?(filters.favorite&&!filters.search&&!filters.category&&!filters.year?emptyView(t('emptyFavorites'),t('emptyFavoritesHint'),'all',t('browseWorks'),'heart'):emptyView(t('noMatches'),t('noMatchesHint'),'clear',t('clearFilters'),'search')):emptyView(t('empty'),t('emptyHint'),'newWork',t('add'),'frame'))+
  '';
}
function albumsView(){return hero(t('albumHeadline'),t('albumSubtitle'),'newAlbum',t('createAlbum'))+demoBanner()+(state.albums.length?'<div class="album-grid">'+state.albums.map(a=>{const theme=albumTheme(a.id);return '<button class="book-card" data-action="album" data-id="'+e(a.id)+'"><div class="album-cover theme-'+theme+'">'+coverDecoration(theme)+'<div class="book-imprint">Little Archive</div><h3>'+e(a.title)+'</h3><div class="book-owner">'+childLabel(a.childId)+'</div><div class="book-number">'+e(t('theme'+theme))+'</div></div><div class="book-caption"><span>'+e(countText(a.orderedArtworkIds.length))+'</span>'+icon('chevron')+'</div></button>';}).join('')+'</div>':emptyView(t('emptyAlbums'),t('emptyAlbumsHint'),'newAlbum',t('createAlbum'),'book'));}
function settingsView(){return hero(t('settingsHeadline'),t('local'))+demoBanner()+'<div class="settings-grid"><section class="panel"><h2>'+icon('photo')+e(t('profiles'))+'</h2>'+state.children.map(c=>'<div class="profile-row"><span class="child-dot" style="background:'+e(c.color)+'40">'+e(c.name[0])+'</span><div>'+e(c.name)+(c.birthDate?'<small>'+e(dateText(c.birthDate))+'</small>':'')+'</div>'+button('editChild',t('edit'),'text-button','','data-id="'+e(c.id)+'"')+'</div>').join('')+button('newChild',t('addChild'),'secondary','plus')+'</section>'+
  '<section class="panel"><h2>'+icon('download')+e(t('backup'))+'</h2><p>'+e(t('backupHint'))+'</p><div class="buttons">'+button('export',t('exportBackup'),'secondary','download')+button('import',t('importBackup'),'secondary','upload')+'</div><p class="warning">'+e(t('backupWarning'))+'</p></section>'+
  '<section class="panel"><h2>'+icon('lock')+e(t('privacyTitle'))+'</h2><p>'+e(t('privacyBody'))+'</p><p class="web-note">'+e(t('webNote'))+'</p></section><section class="panel"><h2>'+e(t('language'))+'</h2><div class="buttons">'+button('language','Русский',lang==='ru'?'primary':'secondary','','data-language="ru"')+button('language','English',lang==='en'?'primary':'secondary','','data-language="en"')+'</div></section></div>';}
async function enterOwn(){demonstration=false;state=realState;filters={child:'',favorite:false,year:'',category:'',sort:'newest',search:''};clearURLs();render();if(!state.children.length)profileEditor();}

function profileEditor(id){
  const child=state.children.find(c=>c.id===id);
  showModal(modalHeader(child?t('profile'):t('addChild'))+'<form id="profile-form"><div class="modal-body"><label class="field">'+e(t('name'))+'<input name="name" maxlength="120" required autocomplete="given-name" value="'+e(child?.name||'')+'"></label><label class="field">'+e(t('birthday'))+'<input type="date" name="birthday" max="'+today()+'" value="'+e(child?.birthDate||'')+'"></label><label class="field">'+e(t('color'))+'<input type="color" name="color" value="'+e(child?.color||'#879989')+'"></label></div>'+footer()+'</form>',{narrow:true,action:async action=>{if(action==='submit')modal.querySelector('form').requestSubmit();}});
  const form=modal.querySelector('form');form.oninput=()=>dirty=true;
  form.onsubmit=async event=>{
    event.preventDefault();const f=new FormData(form),name=f.get('name').trim();if(!name)return;
    busy=true;
    try{const next=structuredClone(state),record={id:id||crypto.randomUUID(),name,birthDate:f.get('birthday')||null,color:f.get('color'),profileImagePath:null};
      if(child)next.children[next.children.findIndex(c=>c.id===id)]=record;else next.children.push(record);
      await persist(next);filters.child=record.id;busy=false;closeModal(true);render();toast(t('profileSaved'));
    }catch(err){inlineError(t(storageErrorKey(err)));}finally{busy=false;}
  };
}

async function artworkEditor(id,recovered=null){
  if(demonstration&&!id){await enterOwn();if(!state.children.length)return;}
  if(!state.children.length){profileEditor();return;}
  const originalWork=state.artworks.find(w=>w.id===id),work=originalWork||(recovered?{...recovered.work,category:recovered.work.category==='painting'?'drawing':recovered.work.category}:null)||{childId:filters.child||state.children[0].id,title:'',artworkDate:today(),category:filters.category||'drawing',notes:'',isFavorite:false};
  let photos=recovered?.photos||[],cover=originalWork?.coverImageId||recovered?.cover||null,selectedCrop=null,photosReady=!originalWork;
  const draftId=recovered?.id||crypto.randomUUID();let draftRevision=recovered?.revision||0;
  const field=(key,html)=>'<label class="field">'+e(t(key))+html+'</label>';
  showModal(modalHeader(t(id?'editWork':'newWork'))+'<form id="artwork-form"><p class="draft-status" role="status"></p><div class="modal-body editor-grid"><div class="artwork-date">'+field('date','<input type="date" name="date" max="'+today()+'" required value="'+e(work.artworkDate)+'">')+'</div><div><div id="dropzone" class="dropzone">'+icon('photo')+'<p>'+e(t('drop'))+'</p><div class="buttons">'+button('choose',t('choose'),'secondary','photo')+button('camera',t('camera'),'secondary','camera')+'</div><small>'+e(t('formats'))+'</small><input type="file" id="files" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple><input type="file" id="camera" accept="image/*" capture="environment"></div><div id="photo-list" class="photo-list"></div><p class="help">'+e(t('photoHint'))+'</p></div><div>'+
    field('title','<input name="title" maxlength="300" placeholder="'+e(t('titlePlaceholder'))+'" value="'+e(work.title)+'">')+
    field('child','<select name="child">'+state.children.map(c=>option(c.id,c.name,work.childId)).join('')+'</select>')+
    '<div class="form-row">'+field('category','<select name="category">'+categories.map(c=>option(c,t(c),work.category)).join('')+'</select>')+'</div>'+
    field('notes','<textarea name="notes" maxlength="20000" placeholder="'+e(t('notesPlaceholder'))+'">'+e(work.notes)+'</textarea>')+
    '<label class="check"><input name="favorite" type="checkbox" '+(work.isFavorite?'checked':'')+'>'+e(t('favorite'))+'</label><div class="inline-error" role="alert"></div></div></div>'+footer()+'</form>',
    {wide:true,action:async(action,el)=>{
      if(busy)return;
      if(action==='choose')modal.querySelector('#files').click();
      if(action==='camera')modal.querySelector('#camera').click();
      if(action==='submit')modal.querySelector('form').requestSubmit();
      const p=photos.find(p=>p.id===el.dataset.id);
      if(action==='cover'){cover=p.id;dirty=true;paintPhotos();}
      if(action==='removePhoto'){photos=photos.filter(x=>x.id!==p.id);if(cover===p.id)cover=photos[0]?.id;dirty=true;paintPhotos();}
      if(action==='rotate'){busy=true;try{const r=await raster(p.edited||p.original,6000,90);p.edited=r.blob;p.width=r.width;p.height=r.height;p.thumb=(await raster(r.blob,640)).blob;dirty=true;paintPhotos();}finally{busy=false;}}
      if(action==='restore'){busy=true;try{p.edited=null;const image=await loadImage(p.original);p.width=image.naturalWidth;p.height=image.naturalHeight;p.thumb=(await raster(p.original,640)).blob;dirty=true;paintPhotos();}finally{busy=false;}}
      if(action==='crop'){selectedCrop=p;openCrop(p);}
      if(action==='applyCrop'){await applyCrop();}
      if(action==='cancelCrop'){modal.querySelector('#crop-inline')?.remove();selectedCrop=null;}
    }});
  const form=modal.querySelector('form');
  draftActive=!id&&!demonstration;draftState=recovered?'saved':'idle';
  const status=form.querySelector('.draft-status');if(recovered)status.textContent=t('draftSaved');
  const queue=draftQueue(async value=>{draftRevision=await saveDraft(value,draftRevision);},state=>{if(form.isConnected){draftState=state;}if(form.isConnected&&status)status.textContent=t(state==='saved'?'draftSaved':state==='error'?'draftError':'draftSaving');});
  function autosave(){if(id||demonstration||!form.isConnected)return;const f=new FormData(form);queue.save({id:draftId,updatedAt:new Date().toISOString(),work:{childId:f.get('child'),title:f.get('title'),artworkDate:f.get('date'),category:f.get('category'),notes:f.get('notes'),isFavorite:f.has('favorite')},photos:photos.map(p=>({...p})),cover});}
  form.oninput=()=>{dirty=true;autosave();};
  modalCleanup=()=>{queue.flush().catch(()=>{}).then(async()=>{await refreshDrafts();render();});};
  if(recovered)paintPhotos();
  function paintPhotos(){
    if(dirty)autosave();
    const root=modal.querySelector('#photo-list');if(!root)return;
    root.innerHTML=photos.map(p=>'<div class="photo-tile"><img src="'+temporaryURL(p.thumb)+'" alt="'+e(t('photos'))+'"><div class="photo-tools">'+button('cover',t(cover===p.id?'cover':'makeCover'),'cover-button '+(cover===p.id?'active':''),'','data-id="'+p.id+'"')+button('rotate','','','rotate','data-id="'+p.id+'" aria-label="'+e(t('rotate'))+'" title="'+e(t('rotate'))+'"')+button('crop','','','crop','data-id="'+p.id+'" aria-label="'+e(t('crop'))+'" title="'+e(t('crop'))+'"')+(p.edited?button('restore','','','arrow','data-id="'+p.id+'" aria-label="'+e(t('original'))+'" title="'+e(t('original'))+'"'):'')+button('removePhoto','','','close','data-id="'+p.id+'" aria-label="'+e(t('removePhoto'))+'"')+'</div></div>').join('');
  }
  async function acceptFiles(files){
    if(busy||!photosReady)return;if(photos.length+files.length>5){inlineError(t('maxPhotos'));return;}
    busy=true;
    try{const pending=[];for(const file of files){const data=await preparePhoto(file);pending.push({id:crypto.randomUUID(),original:data.blob,edited:null,width:data.width,height:data.height,thumb:data.thumb});}
      photos.push(...pending);cover||=photos[0]?.id;dirty=true;paintPhotos();
    }catch{inlineError(t('imageError'));}finally{busy=false;modal.querySelector('#files').value='';modal.querySelector('#camera').value='';}
  }
  modal.querySelector('#files').onchange=event=>acceptFiles([...event.target.files]);
  modal.querySelector('#camera').onchange=event=>acceptFiles([...event.target.files]);
  const zone=modal.querySelector('#dropzone');zone.ondragover=event=>{event.preventDefault();zone.classList.add('dragover');};zone.ondragleave=()=>zone.classList.remove('dragover');zone.ondrop=event=>{event.preventDefault();zone.classList.remove('dragover');acceptFiles([...event.dataTransfer.files]);};
  function openCrop(p){
    modal.querySelector('#crop-inline')?.remove();
    const div=document.createElement('section');div.id='crop-inline';div.innerHTML='<p class="help">'+e(t('cropHint'))+'</p><div class="crop-wrapper"><div class="crop-stage"><img src="'+temporaryURL(p.edited||p.original)+'" alt=""><div class="crop-box" hidden></div></div></div><div class="buttons">'+button('cancelCrop',t('cancel'))+button('applyCrop',t('apply'),'primary')+'</div>';
    zone.after(div);const stage=div.querySelector('.crop-stage'),box=div.querySelector('.crop-box');let start;
    p.crop=null;
    stage.onpointerdown=event=>{const r=stage.getBoundingClientRect();start={x:(event.clientX-r.left)/r.width,y:(event.clientY-r.top)/r.height};stage.setPointerCapture(event.pointerId);};
    stage.onpointermove=event=>{if(!start)return;const r=stage.getBoundingClientRect(),x=Math.max(0,Math.min(1,(event.clientX-r.left)/r.width)),y=Math.max(0,Math.min(1,(event.clientY-r.top)/r.height));p.crop={x:Math.min(start.x,x),y:Math.min(start.y,y),w:Math.abs(x-start.x),h:Math.abs(y-start.y)};box.hidden=false;Object.assign(box.style,{left:p.crop.x*100+'%',top:p.crop.y*100+'%',width:p.crop.w*100+'%',height:p.crop.h*100+'%'});};
    stage.onpointerup=()=>start=null;stage.onpointercancel=()=>start=null;
  }
  async function applyCrop(){const p=selectedCrop;if(!p?.crop||p.crop.w<.02||p.crop.h<.02)return;busy=true;try{const r=await raster(p.edited||p.original,6000,0,p.crop);p.edited=r.blob;p.width=r.width;p.height=r.height;p.thumb=(await raster(r.blob,640)).blob;dirty=true;paintPhotos();modal.querySelector('#crop-inline').remove();selectedCrop=null;}finally{busy=false;}}
  if(originalWork){
    busy=true;
    try{
      const loaded=[];
      for(const meta of state.images.filter(i=>i.artworkId===id).sort((a,b)=>a.sortOrder-b.sortOrder)){
        const original=await getFile(meta.originalPath),edited=meta.editedPath?await getFile(meta.editedPath):null;
        const thumb=await getFile(meta.originalPath+'.thumb').catch(async()=>(await raster(edited||original,640)).blob);
        loaded.push({id:meta.id,original,edited,width:meta.width,height:meta.height,thumb,meta});
      }
      photos=loaded;photosReady=true;paintPhotos();
    }catch{form.querySelector('[data-action=submit]').disabled=true;inlineError(t('editPhotosUnavailable'));}finally{busy=false;}
  }
  form.onsubmit=async event=>{
    event.preventDefault();if(busy||!photosReady)return;if(!photos.length){inlineError(t('required'));return;}
    busy=true;form.querySelector('[data-action=submit]').disabled=true;
    try{
      await queue.flush().catch(()=>{});
      const fields=new FormData(form),artworkId=id||draftId,next=structuredClone(state),puts=[],deletes=[];
      const record={id:artworkId,childId:fields.get('child'),title:fields.get('title').trim(),artworkDate:fields.get('date'),addedAt:originalWork?.addedAt||new Date().toISOString(),category:fields.get('category'),notes:fields.get('notes').trim(),isFavorite:fields.has('favorite'),coverImageId:cover};
      if(id)next.artworks[next.artworks.findIndex(w=>w.id===id)]=record;else next.artworks.push(record);
      for(const old of next.images.filter(i=>i.artworkId===artworkId)){if(!photos.some(p=>p.id===old.id))deletes.push(old.originalPath,old.originalPath+'.thumb',...(old.editedPath?[old.editedPath]:[]));}
      next.images=next.images.filter(i=>i.artworkId!==artworkId);
      for(let order=0;order<photos.length;order++){
        const p=photos[order],ext=({'image/png':'png','image/webp':'webp','image/heic':'heic','image/heif':'heif'})[p.original.type]||'jpg',originalPath=p.meta?.originalPath||'images/'+p.id+'/original.'+ext,editedPath=p.edited?'images/'+p.id+'/edited.jpg':null;
        if(!p.meta)puts.push([originalPath,p.original]);if(p.edited)puts.push([editedPath,p.edited]);else if(p.meta?.editedPath)deletes.push(p.meta.editedPath);
        puts.push([originalPath+'.thumb',p.thumb]);next.images.push({id:p.id,artworkId,originalPath,editedPath,width:p.width,height:p.height,sortOrder:order});
      }
      for(const album of next.albums)if(album.childId!==record.childId)album.orderedArtworkIds=album.orderedArtworkIds.filter(x=>x!==artworkId);
      await persist(next,puts,deletes,!id&&!demonstration?{id:draftId,revision:draftRevision}:null);busy=false;closeModal(true);render();toast(t(demonstration?'demoChanges':'saved'));
    }catch(err){inlineError(t(storageErrorKey(err))+(err?.name?' ['+err.name+']':''));}finally{busy=false;if(form.isConnected)form.querySelector('[data-action=submit]').disabled=false;}
  };
}

async function artworkDetail(id,index=0){
  const work=state.artworks.find(w=>w.id===id);if(!work)return;
  const photos=state.images.filter(i=>i.artworkId===id).sort((a,b)=>a.sortOrder-b.sortOrder),photo=photos[index];
  showModal('<div class="detail">'+button('close','','icon-button detail-close','close','aria-label="'+e(t('close'))+'"')+
    '<div class="detail-photo"><img id="detail-image" alt="'+e(work.title||t('untitled'))+'" tabindex="0" role="button" aria-label="'+e(t('zoom'))+'">'+(photos.length>1?'<div class="gallery-nav">'+button('previous','','icon-button','arrow','aria-label="'+e(t('previous'))+'"')+'<span>'+(index+1)+' / '+photos.length+'</span>'+button('next','','icon-button','chevron','aria-label="'+e(t('next'))+'"')+'</div>':'')+'</div><div class="detail-info"><span class="eyebrow">'+e(t(work.category))+'</span><h2>'+e(work.title||t('untitled'))+'</h2><div class="card-meta">'+childLabel(work.childId,work.artworkDate)+'</div><div class="detail-date">'+e(dateText(work.artworkDate))+'</div>'+(work.notes?'<div class="notes"><span class="note-label">'+e(t('parentNote'))+'</span><p>'+e(work.notes)+'</p></div>':'')+
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
  if(!state.children.length){toast(t('noWorks'));return;}
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
        busy=false;closeModal(true);page='archive';filters.child='';render();toast(t('imported'));
      }catch{inlineError(t('invalidBackup'));}finally{busy=false;}
    }});
  }catch{busy=false;showModal(modalHeader(t('error'))+'<div class="modal-body"><p class="help">'+e(t('invalidBackup'))+'</p></div>',{narrow:true});}
}
const backupInput=document.createElement('input');backupInput.type='file';backupInput.accept='.zip,application/zip';backupInput.hidden=true;document.body.append(backupInput);backupInput.onchange=()=>{if(backupInput.files[0])importBackup(backupInput.files[0]);backupInput.value='';};
app.onclick=async event=>{
  const el=event.target.closest('[data-action]');if(!el)return;
  try{
    const action=el.dataset.action;
    if(action==='nav'){page=el.dataset.page;render();window.scrollTo(0,0);}
    if(action==='language'){setLanguage(el.dataset.language);render();}
    if(action==='filterChild'){filters.child=el.dataset.id;filters.year='';filters.search='';page='archive';render();}
    if(action==='all'||action==='favorites'){filters.favorite=action==='favorites';render();}
    if(action==='category'){filters.category=el.dataset.category;render();}
    if(action==='clear'){filters={child:filters.child,favorite:false,year:'',category:'',sort:'newest',search:''};render();}
    if(action==='own')await enterOwn();
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
app.onchange=event=>{const map={'child-filter':'child','year-filter':'year','sort':'sort'};if(map[event.target.id]){filters[map[event.target.id]]=event.target.value;render();}};
let searchTimer;app.oninput=event=>{if(event.target.id==='search'){const value=event.target.value;clearTimeout(searchTimer);searchTimer=setTimeout(()=>{filters.search=value;render();const input=document.querySelector('#search');input?.focus();input?.setSelectionRange(value.length,value.length);},250);}};
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
try{realState=await readArchive();if(!realState.children.length){demonstration=true;state=normalizeCategories(await makeDemo());}else state=realState;render();if(await refreshDrafts()&&drafts.length)render();}
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
