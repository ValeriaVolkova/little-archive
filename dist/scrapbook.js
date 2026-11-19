import {agePeriod} from './domain.js';

export function dailyMemory(works,day,previous,random=Math.random){
  if(!works.length)return null;
  const last=works.find(w=>w.id===previous?.id);
  if(last&&previous.day===day)return last;
  const choices=last&&works.length>1?works.filter(w=>w!==last):works;
  return choices[Math.floor(random()*choices.length)];
}

export function chapters(works,child){
  const counts=new Map();
  for(const work of works){
    if(work.childId!==child.id)continue;
    const age=agePeriod(child.birthDate,work.artworkDate);
    if(age!==null)counts.set(age,(counts.get(age)||0)+1);
  }
  return [...counts].sort(([a],[b])=>a-b);
}

// Append to the shortest column. Top edges are nondecreasing in DOM/tab order.
export function arrange(ratios,width,columns,gap){
  const heights=Array(columns).fill(0),columnWidth=(width-gap*(columns-1))/columns;
  const positions=ratios.map(ratio=>{
    const y=Math.min(...heights),col=heights.indexOf(y);
    const height=columnWidth*ratio;
    heights[col]=y+height+gap;
    return {x:col*(columnWidth+gap),y,height};
  });
  return {positions,columnWidth,height:Math.max(0,...heights)-gap};
}

const observers=new WeakMap();
export function layoutGallery(grid,root=document){
  observers.get(root)?.disconnect();
  if(!grid)return;
  const cards=[...grid.children],ratios=cards.map(el=>Number(el.dataset.ratio));
  let lastWidth=0;
  function layout(){
    const width=grid.clientWidth;
    if(!width||width===lastWidth)return;
    lastWidth=width;
    const style=getComputedStyle(grid);
    const layout=arrange(ratios,width,Number(style.getPropertyValue('--columns')),parseFloat(style.columnGap));
    grid.style.height=layout.height+'px';
    cards.forEach((card,i)=>{
      const {x,y,height}=layout.positions[i];
      Object.assign(card.style,{width:layout.columnWidth+'px',height:height+'px',transform:'translate('+x+'px,'+y+'px)'});
    });
  }
  layout();
  const resize=new ResizeObserver(layout);resize.observe(grid);observers.set(root,resize);
}
