import test from 'node:test';
import assert from 'node:assert/strict';
import {agePeriod, dashboardData, filterWorks, displayCategory, emptyArchive} from '../dist/domain.js';
import {chooseArtworkDate, photoDate} from '../dist/media.js';

const children=[{id:'a',birthDate:'2020-02-29'},{id:'b',birthDate:'2021-01-15'}];
const artwork=(id,childId,artworkDate,addedAt,category='painting',isFavorite=true)=>
  ({id,childId,artworkDate,addedAt,category,isFavorite,title:'Солнце '+id,notes:'акварель'});

test('birthday periods use calendar anniversaries, including February 29',()=>{
  for(const [birth,date,expected] of [
    ['2021-01-15','2022-01-14',0],['2021-01-15','2022-01-15',1],['2021-01-15','2023-01-15',2],
    ['2020-02-29','2021-02-27',0],['2020-02-29','2021-02-28',1],['2020-02-29','2024-02-28',3],
    ['2020-02-29','2024-02-29',4],['2020-02-29','2019-01-01',null],[null,'2021-02-28',null],
    ['2020-02-29','2021-02-29',null],['bad','2021-01-01',null]
  ])assert.equal(agePeriod(birth,date),expected);
});
test('Dashboard counts the whole family and shows the six most recently added works',()=>{
  const state={...emptyArchive(),children,albums:[{id:'album'}],artworks:Array.from({length:8},(_,i)=>
    artwork(String(i),i%2?'a':'b',`2023-01-0${8-i}`,`2024-01-0${i+1}T12:00:00Z`))};
  const data=dashboardData(state);
  assert.deepEqual([data.children,data.works,data.albums],[2,8,1]);
  assert.deepEqual(data.recent.map(w=>w.id),['7','6','5','4','3','2']);
  assert.deepEqual(data.periods.map(([n,works])=>[n,works.length]),[[1,4],[2,4]]);
  const updated={...state,children:children.map(c=>c.id==='a'?{...c,birthDate:'2019-01-01'}:c)};
  assert.deepEqual(dashboardData(updated).periods.map(([n])=>n),[1,4]);
  assert.equal(state.artworks[0].artworkDate,'2023-01-08');
});
test('family, child, age, favorite, category, year and note filters combine',()=>{
  const state={...emptyArchive(),children,artworks:[
    artwork('leap','a','2022-02-28','2024-01-01'),
    artwork('winter','b','2023-01-15','2024-01-02'),
    artwork('not-fav','b','2023-02-01','2024-01-03','painting',false),
    artwork('drawing','b','2023-01-20','2024-01-04','drawing'),
    artwork('legacy','b','2023-01-16','2024-01-05','collage'),
    artwork('invalid','b','not a date','2024-01-06')
  ]};
  const matches=filters=>filterWorks(state,filters).map(w=>w.id);
  assert.equal(matches({}).length,6);
  assert.deepEqual(matches({child:'a'}),['leap']);
  assert.deepEqual(matches({period:'2',category:'painting',favorite:true}),['winter','leap']);
  assert.deepEqual(matches({child:'b',period:'2',category:'painting',favorite:true,year:'2023',search:'акварель'}),['winter']);
  assert.deepEqual(matches({category:'craft'}),['legacy']);
  assert.equal(displayCategory('painting'),'painting');
  assert.equal(state.artworks[4].category,'collage');
});

function jpegExif(value,{wrongTag=false,bigEndian=false}={}){
  const bytes=new Uint8Array(2+2+2+6+64);
  const view=new DataView(bytes.buffer),at=12,little=!bigEndian;
  view.setUint16(0,0xffd8);view.setUint16(2,0xffe1);view.setUint16(4,72);
  bytes.set([69,120,105,102,0,0],6);
  view.setUint16(at,bigEndian?0x4d4d:0x4949);
  view.setUint16(at+2,42,little);view.setUint32(at+4,8,little);
  view.setUint16(at+8,1,little);view.setUint16(at+10,0x8769,little);
  view.setUint16(at+12,4,little);view.setUint32(at+14,1,little);view.setUint32(at+18,26,little);
  view.setUint16(at+26,1,little);view.setUint16(at+28,wrongTag?0x9004:0x9003,little);
  view.setUint16(at+30,2,little);view.setUint32(at+32,20,little);view.setUint32(at+36,44,little);
  bytes.set(new TextEncoder().encode(value),at+44);
  return new Blob([bytes],{type:'image/jpeg'});
}
test('JPEG date accepts only a valid DateTimeOriginal and protects a manual date',async()=>{
  assert.equal(await photoDate(jpegExif('2024:02:29 21:01:02')),'2024-02-29');
  assert.equal(await photoDate(jpegExif('2023:02:28 23:59:59',{bigEndian:true})),'2023-02-28');
  assert.equal(await photoDate(jpegExif('2023:02:29 21:01:02')),null);
  assert.equal(await photoDate(jpegExif('2024:02:29 21:01:02',{wrongTag:true})),null);
  assert.equal(await photoDate(jpegExif('2024:02:29 21:01:02').slice(0,40,'image/jpeg')),null);
  assert.equal(chooseArtworkDate(true,'2020-01-01','2024-02-29','2026-03-01'),'2020-01-01');
  assert.equal(chooseArtworkDate(false,'2020-01-01',null,'2026-03-01'),'2026-03-01');
});
