import test from 'node:test';
import assert from 'node:assert/strict';
import {chapters,arrange,familyStory} from '../dist/scrapbook.js';

test('family story uses creation dates, compares siblings of similar ages and finds a timeline',()=>{
  const children=[{id:'one',birthDate:'2020-01-01'},{id:'two',birthDate:'2022-04-01'},{id:'three',birthDate:'2022-04-01'}];
  const work=(id,childId,artworkDate)=>({id,childId,artworkDate,addedAt:'2026-01-01'});
  const artworks=[
    work('latest','one','2025-05-03'),work('similar','two','2025-01-02'),
    work('first','one','2022-12-31'),work('missing-date','two','')
  ];
  const story=familyStory({children,artworks});
  assert.equal(story.count,4);
  assert.deepEqual(story.artists.map(({count,periods})=>[count,periods]),[[2,[[2,1],[5,1]]],[2,[[2,1]]],[0,[]]]);
  assert.deepEqual(story.sameAge.map(({work})=>work.id),['similar','first']);
  assert.deepEqual(story.timeline.map(({work})=>work.id),['first','latest']);
  assert.equal(artworks[0].id,'latest');
});
test('family story omits comparisons for distant ages, a single artist or no works',()=>{
  const children=[{id:'one',birthDate:'2020-01-01'},{id:'two',birthDate:'2024-01-01'}];
  const artworks=children.map(({id})=>({id,childId:id,artworkDate:'2025-05-01',addedAt:'2025-05-01'}));
  assert.equal(familyStory({children,artworks}).sameAge,null);
  assert.equal(familyStory({children,artworks}).timeline,null);
  assert.equal(familyStory({children:children.slice(0,1),artworks:artworks.slice(0,1)}).sameAge,null);
  assert.deepEqual(familyStory({children:[],artworks:[]}),{count:0,artists:[],sameAge:null,timeline:null});
});

test('chapters reuse birthdays independently of siblings and ignore missing dates',()=>{
  const works=['2023-01-01','2024-01-01','2022-12-31'].map(artworkDate=>({artworkDate,childId:'one'}));
  works.push({childId:'two',artworkDate:'2025-01-01'});
  assert.deepEqual(chapters(works,{id:'one',birthDate:'2023-01-01'}),[[0,1],[1,1]]);
  assert.deepEqual(chapters(works,{id:'one',birthDate:null}),[]);
});
test('masonry preserves sorted visual order and aspect ratios for 500 mixed covers',()=>{
  const ratios=Array.from({length:500},(_,i)=>[1,2,.5][i%3]);
  for(const columns of [2,3,4]){
    const {positions,columnWidth}=arrange(ratios,390,columns,8);
    positions.forEach(({x,y,height},i)=>{
      assert.equal(height,columnWidth*ratios[i]);
      if(i){const prev=positions[i-1];assert.ok(y>prev.y||y===prev.y&&x>prev.x);}
    });
  }
});
