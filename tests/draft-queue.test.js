import test from 'node:test';
import assert from 'node:assert/strict';
import {draftQueue} from '../dist/draft-queue.js';
test('draft writes serialize and retain the latest snapshot while storage is slow',async()=>{
  let release;const gate=new Promise(r=>release=r),written=[],states=[];
  const q=draftQueue(async value=>{if(value===1)await gate;written.push(value);},s=>states.push(s));
  q.save(1);q.save(2);q.save(3);release();await q.flush();
  assert.deepEqual(written,[1,3]);assert.equal(states.at(-1),'saved');
});
test('failed draft writes report failure and a later retry can recover',async()=>{
  let full=true;const states=[];const q=draftQueue(async()=>{if(full)throw Error('quota');},s=>states.push(s));
  q.save({title:'kept in form'});await assert.rejects(q.flush(),/quota/);assert.equal(states.at(-1),'error');
  full=false;q.save({title:'retry'});await q.flush();assert.equal(states.at(-1),'saved');
});
