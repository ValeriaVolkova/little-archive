import {enhancedPreview,legacyIntensity} from './media.js';

const full = () => ({x:0, y:0, w:1, h:1});
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// Coordinates refer to the EXIF-oriented original, before the user's quarter turns.
export function turn(r) {
  return {x:clamp(1-r.y-r.h,0,1), y:r.x, w:r.h, h:r.w};
}
export function rotatedRect(rect, turns) {
  let result={...rect};
  for(let i=0;i<turns;i++) result=turn(result);
  return result;
}
export function validRecipe(r) {
  return !!r && [0,90,180,270].includes(r.rotation) &&
    ['x','y','w','h'].every(k=>Number.isFinite(r[k])) && r.x>=0 && r.y>=0 &&
    r.w>0 && r.h>0 && r.x+r.w<=1.0000001 && r.y+r.h<=1.0000001;
}

export function editCrop(original, previous, legacyImage, t, apply, onCancel, initialLevel) {
  let level=initialLevel??65;
  const dialog=document.createElement('dialog');
  dialog.className='crop-dialog';
  dialog.setAttribute('aria-label',t('crop'));
  dialog.innerHTML=`<h2>${t('crop')}</h2><p>${t(legacyImage?'cropLegacy':'cropInstructions')}</p>
    <canvas></canvas><div class="crop-controls"><button data-op="out" aria-label="${t('zoomOut')}">−</button>
    <button data-op="in" aria-label="${t('zoomIn')}">+</button><button data-op="rotate">${t('rotate')} 90°</button>
    <button data-op="reset">${t('cropReset')}</button>
    </div><label class="enhance-control"><span>${t('enhance')} <output>${level}%</output></span>
    <input data-op="enhance" type="range" min="0" max="100" step="1" value="${level}" aria-label="${t('enhance')}" aria-valuetext="${level}%"></label><p role="alert" hidden></p>
    <div class="crop-footer"><button data-op="cancel">${t('cancel')}</button><button data-op="skip">${t('cropSkip')}</button>
    <button class="primary" data-op="done">${t('cropDone')}</button></div>`;
  document.body.append(dialog);
  dialog.showModal();
  const canvas=dialog.querySelector('canvas'),ctx=canvas.getContext('2d');
  const seed=validRecipe(previous)?previous:{...full(),rotation:0};
  let turns=seed.rotation/90, rect=rotatedRect(seed,turns), zoom=1, cx=.5, cy=.5;
  let view,drag=null,pinch=null,saving=false,modified=false;
  let cache=null,frame=0;
  const slider=dialog.querySelector('input[type=range]'),output=dialog.querySelector('output');
  slider.oninput=()=>{
    level=slider.valueAsNumber;
    output.value=level+'%';slider.setAttribute('aria-valuetext',output.value);
    if(!frame)frame=requestAnimationFrame(()=>{frame=0;draw();});
  };
  function releasePreview(){
    if(!cache)return;
    for(const endpoint of [cache.legacy,cache.maximum])if(endpoint)endpoint.width=endpoint.height=0;
    cache=null;
  }
  const pointers=new Map();

  function draw(){
    const width=canvas.clientWidth,height=canvas.clientHeight;
    if(!width||!height)return;
    const ratio=Math.min(2,devicePixelRatio||1);
    const pixelW=Math.round(width*ratio),pixelH=Math.round(height*ratio);
    if(canvas.width!==pixelW||canvas.height!==pixelH){canvas.width=pixelW;canvas.height=pixelH;}
    ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,pixelW,pixelH);
    ctx.setTransform(ratio,0,0,ratio,0,0);
    const image=legacyImage&&!modified?legacyImage:original;
    const iw=image.naturalWidth,ih=image.naturalHeight;
    const scale=zoom*Math.min((width-32)/(turns%2?ih:iw),(height-32)/(turns%2?iw:ih));
    const w=scale*(turns%2?ih:iw),h=scale*(turns%2?iw:ih);
    view={x:width/2-w*cx,y:height/2-h*cy,w,h};
    ctx.save();ctx.translate(view.x+w/2,view.y+h/2);ctx.rotate(turns*Math.PI/2);
    ctx.translate(-iw*scale/2,-ih*scale/2);ctx.scale(scale,scale);
    ctx.fillStyle='white';ctx.fillRect(0,0,iw,ih);ctx.drawImage(image,0,0);
    if(level){
      const crop=rotatedRect(rect,(4-turns)%4);
      const changed=!cache||cache.image!==image||['x','y','w','h'].some(key=>Math.abs(cache.crop[key]-crop[key])>1e-8);
      // Keep the last processed region anchored to the photo during a crop gesture.
      // Refresh it once the gesture ends. Slider motion only blends cached endpoints.
      if(changed&&(!cache||cache.image!==image||!pointers.size)){
        releasePreview();
        cache={image,crop,legacy:enhancedPreview(image,960,legacyIntensity,crop)};
      }
      const region=cache.crop,box=[region.x*iw,region.y*ih,region.w*iw,region.h*ih];
      ctx.globalAlpha=Math.min(1,level/legacyIntensity);ctx.drawImage(cache.legacy,...box);
      if(level>legacyIntensity){
        cache.maximum??=enhancedPreview(image,960,100,region);
        ctx.globalAlpha=(level-legacyIntensity)/(100-legacyIntensity);ctx.drawImage(cache.maximum,...box);
      }
    }
    ctx.restore();
    const x=view.x+w*rect.x,y=view.y+h*rect.y,rw=w*rect.w,rh=h*rect.h;
    ctx.fillStyle='rgba(23,23,24,.55)';ctx.beginPath();ctx.rect(0,0,width,height);ctx.rect(x,y,rw,rh);ctx.fill('evenodd');
    ctx.strokeStyle='white';ctx.lineWidth=2;ctx.strokeRect(x,y,rw,rh);
    for(const a of [0,1])for(const b of [0,1]){
      ctx.beginPath();ctx.arc(x+a*rw,y+b*rh,6,0,Math.PI*2);
      ctx.fillStyle='white';ctx.fill();ctx.strokeStyle='#352e29';ctx.stroke();
    }
  }
  function setZoom(value,base=rect,start=zoom){
    const target=clamp(value,1,5),factor=start/target;
    if(target!==start)modified=true;
    const w=Math.min(1,base.w*factor),h=Math.min(1,base.h*factor);
    cx=base.x+base.w/2;cy=base.y+base.h/2;
    rect={x:clamp(cx-w/2,0,1-w),y:clamp(cy-h/2,0,1-h),w,h};
    zoom=target;draw();
  }
  function point(e){
    const bounds=canvas.getBoundingClientRect();
    return {x:e.clientX-bounds.left,y:e.clientY-bounds.top};
  }
  function distance(){const [a,b]=pointers.values();return Math.hypot(a.x-b.x,a.y-b.y);}
  canvas.onpointerdown=e=>{
    if(saving||pointers.size>=2)return;
    const p=point(e);canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,p);
    if(pointers.size===2){pinch={distance:Math.max(1,distance()),zoom,rect:{...rect}};drag=null;return;}
    const u=(p.x-view.x)/view.w,v=(p.y-view.y)/view.h;
    const a=u<rect.x+rect.w/2?0:1,b=v<rect.y+rect.h/2?0:1;
    const corner=Math.abs(u-rect.x-a*rect.w)*view.w<=22 && Math.abs(v-rect.y-b*rect.h)*view.h<=22;
    if(corner||(u>=rect.x&&u<=rect.x+rect.w&&v>=rect.y&&v<=rect.y+rect.h))
      drag={p,rect:{...rect},corner,a,b};
  };
  canvas.onpointermove=e=>{
    if(!pointers.has(e.pointerId))return;
    const p=point(e);pointers.set(e.pointerId,p);
    if(pinch){setZoom(pinch.zoom*distance()/pinch.distance,pinch.rect,pinch.zoom);return;}
    if(!drag)return;
    modified=true;
    const r=drag.rect,dx=(p.x-drag.p.x)/view.w,dy=(p.y-drag.p.y)/view.h;
    if(!drag.corner){rect={...r,x:clamp(r.x+dx,0,1-r.w),y:clamp(r.y+dy,0,1-r.h)};}
    else {
      const minW=Math.min(r.w,26/view.w),minH=Math.min(r.h,26/view.h);
      const left=drag.a?r.x:clamp(r.x+dx,0,r.x+r.w-minW);
      const right=drag.a?clamp(r.x+r.w+dx,r.x+minW,1):r.x+r.w;
      const top=drag.b?r.y:clamp(r.y+dy,0,r.y+r.h-minH);
      const bottom=drag.b?clamp(r.y+r.h+dy,r.y+minH,1):r.y+r.h;
      rect={x:left,y:top,w:right-left,h:bottom-top};
    }
    draw();
  };
  canvas.onpointerup=canvas.onpointercancel=e=>{pointers.delete(e.pointerId);pinch=null;drag=null;draw();};
  const observer=new ResizeObserver(draw);observer.observe(canvas);draw();
  const close=()=>{observer.disconnect();cancelAnimationFrame(frame);releasePreview();canvas.width=canvas.height=0;dialog.close();dialog.remove();};
  dialog.oncancel=e=>{e.preventDefault();if(!saving){onCancel?.();close();}};
  dialog.onclick=async e=>{
    const op=e.target.closest('button')?.dataset.op;
    if(!op||saving)return;
    if(op==='cancel'||op==='skip'){if(op==='cancel')onCancel?.();close();return;}
    if(op==='in'||op==='out'){setZoom(zoom*(op==='in'?1.25:.8));return;}
    if(op==='reset'){modified=true;turns=0;rect=full();cx=cy=.5;zoom=1;}
    if(op==='rotate'){modified=true;turns=(turns+1)%4;rect=turn(rect);zoom=1;cx=cy=.5;}
    if(op==='done'){
      if(!modified&&level===initialLevel){close();return;}
      saving=true;
      dialog.querySelectorAll('button,input').forEach(el=>el.disabled=true);
      try{await apply({...rotatedRect(rect,(4-turns)%4),rotation:turns*90},modified,level);close();}
      catch{const error=dialog.querySelector('[role=alert]');error.hidden=false;error.textContent=t('imageError');}
      finally{saving=false;dialog.querySelectorAll('button,input').forEach(el=>el.disabled=false);}
      return;
    }
    draw();
  };
}
