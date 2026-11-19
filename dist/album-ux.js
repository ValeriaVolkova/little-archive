import {arrange} from './scrapbook.js';

export const coverTemplates=['cream','peach','sage','sky','lavender','butter','terracotta','paper'];

export function moveWork(ids,id,index){
  const order=ids.filter(value=>value!==id);
  if(order.length===ids.length)return ids;
  order.splice(index,0,id);
  return order;
}

export function albumDrag(grid,save,canStart){
  const cards=[...grid.children],ids=cards.map(card=>card.querySelector('.work-open').dataset.id);
  let gesture,frame,suppressUntil=0;
  const listeners=new AbortController(),signal=listeners.signal;
  function stop(commit=false){
    if(!gesture)return;
    if(commit&&gesture.ghost){cancelAnimationFrame(frame);draw();}
    const current=gesture;gesture=null;
    clearTimeout(current.timer);cancelAnimationFrame(frame);
    if(!current.ghost)return;
    current.ghost.remove();grid.classList.remove('reordering');
    cards.forEach((card,i)=>{card.style.transform=current.transforms[i];});
    current.card.classList.remove('drag-source');
    suppressUntil=performance.now()+400;
    if(commit&&current.index!==current.from)save(moveWork(ids,ids[current.from],current.index));
  }
  function start(target,x,y,touch){
    const card=target.closest('.work-open')?.closest('.work-card');
    if(!card||!canStart()||gesture||cards.length<2)return;
    gesture={card,x,y,startX:x,startY:y,touch};
    gesture.timer=setTimeout(()=>{
      if(!canStart()||!grid.isConnected){stop();return;}
      const current=gesture,rect=card.getBoundingClientRect(),style=getComputedStyle(grid),base=grid.getBoundingClientRect();
      current.from=current.index=cards.indexOf(card);
      current.transforms=cards.map(item=>item.style.transform);
      current.points=cards.map(item=>{
        const box=item.getBoundingClientRect();
        return {x:box.left+box.width/2-base.left,y:box.top+box.height/2-base.top};
      });
      current.columns=Number(style.getPropertyValue('--columns'));
      current.gap=parseFloat(style.columnGap);
      current.ghost=document.createElement('img');current.ghost.className='album-drag-ghost';
      current.ghost.src=card.querySelector('img').src;current.ghost.alt='';
      Object.assign(current.ghost.style,{width:rect.width+'px',height:rect.height+'px'});
      current.dx=x-rect.left;current.dy=y-rect.top;
      document.body.append(current.ghost);grid.classList.add('reordering');card.classList.add('drag-source');
      draw();
    },340);
  }
  function draw(){
    const current=gesture;if(!current?.ghost)return;
    const {x,y,dx,dy}=current,vp=window.visualViewport;
    current.ghost.style.transform='translate3d('+(x-dx)+'px,'+(y-dy)+'px,0)';
    const top=(vp?.offsetTop??0)+44,bottom=(vp?.offsetTop??0)+(vp?.height??innerHeight)-86;
    if(y<top)window.scrollBy(0,-Math.min(20,(top-y)/3));
    else if(y>bottom)window.scrollBy(0,Math.min(20,(y-bottom)/3));
    const rect=grid.getBoundingClientRect();
    let index=0,closest=Infinity;
    current.points.forEach((point,i)=>{
      const distance=(point.x+rect.left-x)**2+(point.y+rect.top-y)**2;
      if(distance<closest){index=i;closest=distance;}
    });
    if(current.index!==index){
      current.index=index;
      const order=moveWork(cards,current.card,index);
      const layout=arrange(order.map(card=>Number(card.dataset.ratio)),grid.clientWidth,current.columns,current.gap);
      order.forEach((card,i)=>{
        const {x,y}=layout.positions[i];card.style.transform='translate('+x+'px,'+y+'px)';
      });
    }
    frame=requestAnimationFrame(draw);
  }
  function move(x,y,event){
    if(!gesture)return;
    if(!gesture.ghost&&Math.hypot(x-gesture.startX,y-gesture.startY)>9){stop();return;}
    if(gesture.ghost&&event.cancelable)event.preventDefault();
    gesture.x=x;gesture.y=y;
  }
  grid.addEventListener('touchstart',event=>{
    if(event.touches.length!==1){stop();return;}
    const t=event.touches[0];start(event.target,t.clientX,t.clientY,true);
  },{passive:true,signal});
  grid.addEventListener('touchmove',event=>{
    if(!gesture?.touch)return;
    const t=event.changedTouches[0];move(t.clientX,t.clientY,event);
  },{passive:false,signal});
  grid.addEventListener('touchend',event=>{
    if(!gesture?.touch)return;
    if(gesture.ghost&&event.cancelable)event.preventDefault();
    stop(true);
  },{passive:false,signal});
  grid.addEventListener('touchcancel',()=>stop(),{signal});
  grid.addEventListener('mousedown',event=>{if(event.button===0)start(event.target,event.clientX,event.clientY,false);},{signal});
  window.addEventListener('mousemove',event=>{if(gesture&&!gesture.touch)move(event.clientX,event.clientY,event);},{signal});
  window.addEventListener('mouseup',()=>{if(gesture&&!gesture.touch)stop(true);},{signal});
  window.addEventListener('scroll',()=>{if(gesture&&!gesture.ghost)stop();},{signal});
  window.addEventListener('resize',()=>stop(),{signal});
  window.addEventListener('blur',()=>stop(),{signal});
  window.addEventListener('keydown',event=>{if(event.key==='Escape')stop();},{signal});
  grid.addEventListener('contextmenu',event=>{if(event.target.closest('.work-open'))event.preventDefault();},{signal});
  grid.addEventListener('dragstart',event=>event.preventDefault(),{signal});
  grid.addEventListener('click',event=>{
    if(performance.now()<suppressUntil&&event.target.closest('.work-open')){event.preventDefault();event.stopImmediatePropagation();}
  },{capture:true,signal});
  return ()=>{stop();listeners.abort();};
}

export function fitAlbumDialog(dialog,form){
  const viewport=window.visualViewport;
  const controller=new AbortController(),signal=controller.signal;
  let frame;
  function fit(){
    cancelAnimationFrame(frame);
    frame=requestAnimationFrame(()=>{
      if(!form.isConnected)return;
      dialog.style.setProperty('--album-available',Math.floor(viewport?.height??innerHeight)+'px');
      dialog.style.setProperty('--album-offset',Math.round(viewport?.offsetTop??0)+'px');
      const focused=document.activeElement,body=form.querySelector('.modal-body');
      if(!body.contains(focused)||!focused.matches('input,textarea,select'))return;
      const field=focused.getBoundingClientRect(),area=body.getBoundingClientRect();
      if(field.bottom>area.bottom-10)body.scrollTop+=field.bottom-area.bottom+10;
      if(field.top<area.top+10)body.scrollTop+=field.top-area.top-10;
    });
  }
  viewport?.addEventListener('resize',fit,{signal});
  viewport?.addEventListener('scroll',fit,{signal});
  window.addEventListener('resize',fit,{signal});
  form.addEventListener('focusin',fit,{signal});
  fit();
  return ()=>{controller.abort();cancelAnimationFrame(frame);};
}
