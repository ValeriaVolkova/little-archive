import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeImage,decodeImage,encodeDraft,decodeDraft} from '../dist/storage-codec.js';
import {storageErrorKey} from '../dist/storage-error.js';
test('image storage preserves exact bytes and MIME without Blob references',async()=>{
 const source=new Blob([new Uint8Array([0,255,19,0])],{type:'image/png'}),stored=structuredClone(await encodeImage(source));
 assert.ok(stored.bytes instanceof ArrayBuffer);assert.equal(decodeImage(stored).type,source.type);assert.deepEqual(new Uint8Array(await decodeImage(stored).arrayBuffer()),new Uint8Array(await source.arrayBuffer()));assert.equal(decodeImage(source),source);
});
test('draft survives serialization with original, edited and thumbnail images',async()=>{
 const b=new Blob(['original'],{type:'image/jpeg'}),draft={id:'draft',photos:[{original:b,edited:new Blob(['edit']),thumb:new Blob(['thumb'])}]};
 const decoded=decodeDraft(structuredClone(await encodeDraft(draft)));assert.equal(await decoded.photos[0].original.text(),'original');assert.equal(await decoded.photos[0].edited.text(),'edit');assert.equal(await decoded.photos[0].thumb.text(),'thumb');assert.equal(draft.photos[0].original,b);
});
test('save diagnostics distinguish quota, conflicting drafts and unsupported storage',()=>{
 assert.equal(storageErrorKey({name:'QuotaExceededError'}),'saveQuota');assert.equal(storageErrorKey(Error('Draft changed in another tab')),'saveDraftConflict');assert.equal(storageErrorKey({name:'DataCloneError'}),'saveImageStorage');
});
