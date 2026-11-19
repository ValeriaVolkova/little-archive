import assert from 'node:assert/strict';
import test from 'node:test';
import {albumMembers,childAlbums,deleteWork,profilePhoto,emptyArchive} from '../dist/domain.js';
import {coverTemplates,moveWork} from '../dist/album-ux.js';

test('family albums and child albums use references, preserve order and repair removed covers',()=>{
  const archive=emptyArchive();
  archive.artworks=[{id:'a',childId:'one'},{id:'b',childId:'two'}];
  const family=albumMembers({id:'family',childId:null,coverArtworkId:'b'},['b','a','b']);
  archive.albums=[family,{id:'personal',childId:'two',orderedArtworkIds:['b']},{id:'empty',childId:'one',orderedArtworkIds:[]}];
  assert.deepEqual(family.orderedArtworkIds,['b','a']);
  assert.deepEqual(childAlbums(archive,'one').map(a=>a.id),['family','empty']);
  const next=deleteWork(archive,'b');
  assert.deepEqual(next.albums[0].orderedArtworkIds,['a']);assert.equal(next.albums[0].coverArtworkId,undefined);
  assert.deepEqual(family.orderedArtworkIds,['b','a']);
});
test('profile photo replacement can only target files owned by that child',()=>{
  const photo=p=>profilePhoto({id:'one',profileImagePath:p});
  assert.equal(photo('profiles/one/abc-123.jpg'),'profiles/one/abc-123.jpg');
  for(const path of ['profiles/two/abc.jpg','images/one/original.jpg','profiles/one/../two/a.jpg',null])assert.equal(photo(path),null);
});

test('album reorder can move to either boundary and leaves the original order untouched',()=>{
  const ids=['one','two','three','four'];
  assert.deepEqual(moveWork(ids,'three',0),['three','one','two','four']);
  assert.deepEqual(moveWork(ids,'one',3),['two','three','four','one']);
  assert.deepEqual(moveWork(ids,'unknown',0),ids);
  assert.deepEqual(ids,['one','two','three','four']);
  assert.equal(new Set(coverTemplates).size,8);
});
