import {ageAt,agePeriod,validDate} from './domain.js';

export function familyStory({children,artworks}){
  const artists=children.map(child=>({child,count:0,periods:new Map(),first:null,last:null}));
  const byId=new Map(artists.map(artist=>[artist.child.id,artist]));
  const dated=artworks.filter(work=>validDate(work.artworkDate)).sort((a,b)=>
    a.artworkDate.localeCompare(b.artworkDate)||a.addedAt.localeCompare(b.addedAt)||a.id.localeCompare(b.id));
  for(const work of artworks){
    const artist=byId.get(work.childId);
    if(artist)artist.count++;
  }
  const byAge=[];
  for(const work of dated){
    const artist=byId.get(work.childId);
    if(!artist)continue;
    const age=ageAt(artist.child.birthDate,work.artworkDate),entry={work,child:artist.child,age};
    artist.first??=entry;
    artist.last=entry;
    if(!age)continue;
    artist.periods.set(age.years,(artist.periods.get(age.years)||0)+1);
    byAge.push(entry);
  }
  byAge.sort((a,b)=>a.age.total-b.age.total);
  // A closest pair across different children is adjacent in age order.
  const maxAgeGapMonths=3;
  let sameAge=null,closest=maxAgeGapMonths+1;
  for(let i=1;i<byAge.length;i++){
    const a=byAge[i-1],b=byAge[i],distance=b.age.total-a.age.total;
    if(a.child.id!==b.child.id&&distance<closest){
      closest=distance;
      sameAge=[a,b];
    }
  }
  const timelines=artists.filter(artist=>artist.first&&artist.first!==artist.last);
  const span=entry=>Date.parse(entry.last.work.artworkDate)-Date.parse(entry.first.work.artworkDate);
  const longest=timelines.reduce((best,artist)=>!best||span(artist)>span(best)?artist:best,null);
  return {
    count:artworks.length,
    artists:artists.map(({child,count,periods})=>({
      child,count,periods:[...periods].sort(([a],[b])=>a-b)
    })),
    sameAge,timeline:longest?[longest.first,longest.last]:null
  };
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
