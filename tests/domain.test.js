import test from 'node:test';
import assert from 'node:assert/strict';
import {ageAt,validDate,emptyArchive,validateArchive,filterWorks,deleteWork,mergeArchives} from '../dist/domain.js';
export function fixture(n=1){
  const s=emptyArchive();s.children.push({id:'child',name:'Тест',birthDate:'2020-02-29',color:'#879989'});
  for(let k=0;k<n;k++){
    s.artworks.push({id:'work-'+k,childId:'child',title:'Работа '+k,artworkDate:k%2?'2025-10-20':'2024-01-01',addedAt:'2026-10-22T12:00:00Z',category:k%2?'drawing':'painting',notes:'',isFavorite:k%3===0,coverImageId:'image-'+k});
    s.images.push({id:'image-'+k,artworkId:'work-'+k,originalPath:'images/image-'+k+'/original.jpg',editedPath:null,width:1600,height:1200,sortOrder:0});
  }
  s.albums.push({id:'album',childId:'child',title:'Альбом',createdAt:'2026-10-22T12:00:00Z',coverStyle:'warm',orderedArtworkIds:s.artworks.map(w=>w.id)});return s;
}
test('dates reject invalid calendar dates and age before birth',()=>{assert.equal(validDate('2025-02-29'),false);assert.equal(validDate('2024-02-29'),true);assert.equal(ageAt(null,'2025-01-01'),null);assert.equal(ageAt('2020-02-29','2020-02-28'),null);});
test('age uses completed calendar months across year and leap boundaries',()=>{assert.deepEqual(ageAt('2020-02-29','2023-03-01'),{years:3,months:0,total:36});assert.deepEqual(ageAt('2023-02-18','2025-05-17'),{years:2,months:2,total:26});assert.equal(ageAt('2023-02-18','2025-05-18').total,27);});
test('500 works can be filtered and sorted without mutating archive order',()=>{const s=fixture(500),original=s.artworks.map(w=>w.id);assert.equal(filterWorks(s,{year:'2025',category:'drawing'}).length,250);assert.equal(filterWorks(s,{favorite:true}).length,167);assert.equal(filterWorks(s,{search:'работа 499'})[0].id,'work-499');assert.equal(filterWorks(s,{sort:'oldest'})[0].artworkDate,'2024-01-01');assert.equal(filterWorks(s)[0].artworkDate,'2025-10-20');assert.deepEqual(s.artworks.map(w=>w.id),original);});
test('deleting work removes images and album references, not unrelated records',()=>{const s=deleteWork(fixture(3),'work-1');validateArchive(s);assert.equal(s.artworks.length,2);assert.equal(s.images.length,2);assert.deepEqual(s.albums[0].orderedArtworkIds,['work-0','work-2']);});
test('backup merges are idempotent and preserve existing edits',()=>{const current=fixture(1);current.artworks[0].title='Сохранённое название';const incoming=fixture(3);const merged=mergeArchives(current,incoming);assert.equal(merged.artworks.length,3);assert.equal(merged.images.length,3);assert.equal(merged.artworks[0].title,'Сохранённое название');assert.deepEqual(mergeArchives(merged,incoming),merged);});
test('invalid relationships, duplicate identifiers and unsafe paths are rejected',()=>{for(const change of [s=>s.images[0].originalPath='../private',s=>s.images[0].originalPath=undefined,s=>s.images[0].originalPath='images/other/original.jpg',s=>s.artworks[0].coverImageId='missing',s=>s.artworks.push(s.artworks[0]),s=>s.albums[0].orderedArtworkIds.push('missing'),s=>s.children[0].birthDate='2023-02-30']){const s=fixture();change(s);assert.throws(()=>validateArchive(s));}});
test('failed merge leaves both inputs unchanged',()=>{const a=fixture(),b=fixture(2);b.images[1].id='image-0';const before=structuredClone(a);assert.throws(()=>mergeArchives(a,b));assert.deepEqual(a,before);});
