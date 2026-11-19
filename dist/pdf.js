import {enhancedPreview,loadImage} from './media.js';
import {appName,t,dateText} from './i18n.js';
function textLines(ctx,text,x,y,width,lineHeight,maxLines=4){
  const words=text.split(/\s+/);let line='',lines=[];
  for(const word of words){const next=(line?line+' ':'')+word;if(ctx.measureText(next).width>width&&line){lines.push(line);line=word;}else line=next;}
  if(line)lines.push(line);
  lines.slice(0,maxLines).forEach((line,i)=>ctx.fillText(line,x,y+i*lineHeight,width));
}
export async function createPDF(archive,album,getFile,showCaptions,onProgress){
  const {PDFDocument}=window.PDFLib,doc=await PDFDocument.create();
  doc.setTitle(album.title);doc.setCreator(appName);doc.setAuthor(appName);
  const works=album.orderedArtworkIds.map(id=>archive.artworks.find(w=>w.id===id)).filter(Boolean);
  const previews=[];let lowResolution=0;
  for(let pageIndex=0;pageIndex<=works.length;pageIndex++){
    const canvas=document.createElement('canvas');canvas.width=1654;canvas.height=2339;
    const ctx=canvas.getContext('2d'),warm=album.coverStyle==='warm';ctx.fillStyle=warm?'#FAF8F3':'#fff';ctx.fillRect(0,0,1654,2339);
    ctx.fillStyle='#302F2B';
    if(pageIndex===0){
      ctx.strokeStyle='#D9B6A7';ctx.lineWidth=3;ctx.strokeRect(100,100,1454,2139);
      ctx.textAlign='center';ctx.font='26px sans-serif';ctx.fillStyle='#657767';ctx.fillText(appName,827,320);
      ctx.fillStyle='#302F2B';ctx.font='600 90px sans-serif';textLines(ctx,album.title,827,970,1280,120,6);
      ctx.font='36px sans-serif';ctx.fillStyle='#65645D';ctx.fillText(archive.children.find(c=>c.id===album.childId)?.name||'',827,1880);
      if(works.length){const years=works.map(w=>w.artworkDate.slice(0,4)).sort();ctx.font='28px sans-serif';ctx.fillText(years[0]===years.at(-1)?years[0]:years[0]+' — '+years.at(-1),827,1950);}
    }else{
      const work=works[pageIndex-1],meta=archive.images.find(i=>i.id===work.coverImageId),img=await loadImage(await getFile(meta.editedPath||meta.originalPath));
      const maxW=1454,maxH=showCaptions?1840:2099,scale=Math.min(maxW/img.naturalWidth,maxH/img.naturalHeight),w=img.naturalWidth*scale,h=img.naturalHeight*scale;
      const enhanced=meta.autoEnhance===true?enhancedPreview(img,Math.ceil(Math.max(w,h))):null;
      ctx.drawImage(enhanced||img,(1654-w)/2,120+(maxH-h)/2,w,h);
      if(enhanced)enhanced.width=enhanced.height=0;
      if(img.naturalWidth/(w/200)<150||img.naturalHeight/(h/200)<150)lowResolution++;
      if(showCaptions){ctx.font='500 36px sans-serif';textLines(ctx,work.title||t('untitled'),100,2050,1454,48,2);ctx.font='26px sans-serif';ctx.fillStyle='#65645D';ctx.fillText(dateText(work.artworkDate),100,2180);}
      ctx.textAlign='right';ctx.font='20px sans-serif';ctx.fillStyle='#89877F';ctx.fillText(String(pageIndex),1554,2270);
    }
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.92));
    const image=await doc.embedJpg(await blob.arrayBuffer()),page=doc.addPage([595.276,841.89]);page.drawImage(image,{x:0,y:0,width:595.276,height:841.89});
    if(pageIndex<3){const small=document.createElement('canvas');small.width=330;small.height=467;small.getContext('2d').drawImage(canvas,0,0,330,467);previews.push(await new Promise(r=>small.toBlob(r,'image/jpeg',0.8)));}
    canvas.width=canvas.height=0;onProgress(pageIndex+1,works.length+1);await new Promise(r=>setTimeout(r,0));
  }
  return {blob:new Blob([await doc.save()],{type:'application/pdf'}),previews,lowResolution};
}
