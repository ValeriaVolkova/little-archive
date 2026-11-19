import test from 'node:test';
import assert from 'node:assert/strict';
import {chapters,arrange} from '../dist/scrapbook.js';

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
