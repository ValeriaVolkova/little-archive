import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyArchive} from '../dist/domain.js';
import {createBackup,inspectBackup} from '../dist/backup-restore.js';
import {BackupLimitError,zipLimits,readZip,writeZip} from '../dist/zip.js';

const limitError=limit=>error=>error instanceof BackupLimitError&&error.limit===limit;
const noFile=()=>assert.fail('Export read an unexpected image');

test('an unnamed profile with a corrupt avatar is identified by ID before any file read',async()=>{
  const path='profiles/child/avatar.jpg';
  const files=new Map([[path,new Blob([Uint8Array.of(1,2,3)],{type:'image/jpeg'})]]);
  for(const name of [undefined,'','  ']){
    const archive=emptyArchive();
    archive.children.push({id:'child',name,birthDate:null,color:'#123456',profileImagePath:path});
    let reads=0;
    await assert.rejects(createBackup(archive,key=>{reads++;return files.get(key);}),
      error=>error.messageKey==='backupProfileMissingName'&&error.label==='child');
    assert.equal(reads,0);
    assert.equal(archive.children[0].name,name);
  }
});

// Use valid album descriptions including multibyte characters. exportedAt is
// fixed-width ISO UTC, so the manifest can be sized to the byte without a clock mock.
function sizedManifest(target){
  const archive=emptyArchive();
  const makeAlbum=id=>({id:String(id),title:'Áльбом',description:'',childId:null,coverStyle:'warm',orderedArtworkIds:[]});
  const manifest={format:'little-archive',formatVersion:1,exportedAt:new Date().toISOString(),archive};
  for(let i=0;i<530;i++)archive.albums.push(makeAlbum(i));
  let remaining=target-Buffer.byteLength(JSON.stringify(manifest));
  for(const album of archive.albums){
    const length=Math.min(20000,remaining);
    album.description='a'.repeat(length);
    remaining-=length;
  }
  assert.equal(remaining,0);
  return manifest;
}
for(const delta of [-1,0,1]){
  test('UTF-8 manifest limit '+(delta>=0?'+':'')+delta+' bytes',async()=>{
    const size=zipLimits.manifest+delta;
    const manifest=sizedManifest(size);
    if(delta>0){
      await assert.rejects(createBackup(manifest.archive,noFile),limitError('manifest'));
      const oldZip=await writeZip([['manifest.json',new Blob([JSON.stringify(manifest)])]]);
      await assert.rejects(inspectBackup(oldZip),limitError('manifest'));
    }else{
      const blob=await createBackup(manifest.archive,noFile);
      const zip=await readZip(blob);
      assert.equal((await zip.get('manifest.json')).size,size);
      assert.deepEqual((await inspectBackup(blob)).incoming,manifest.archive);
    }
  });
}

test('530 artworks with valid 20,000-character notes stop before opening any original',async()=>{
  const state=emptyArchive();
  state.children.push({id:'child',name:'Child',birthDate:null,color:'#abcdef'});
  for(let i=0;i<530;i++){
    const id='i'+i,work='w'+i;
    state.artworks.push({id:work,childId:'child',title:'',notes:'n'.repeat(20000),category:'drawing',isFavorite:false,
      artworkDate:'2026-01-01',addedAt:'2026-01-02',coverImageId:id});
    state.images.push({id,artworkId:work,originalPath:'images/'+id+'/original.png',width:1,height:1,sortOrder:0});
  }
  await assert.rejects(createBackup(state,noFile),limitError('manifest'));
});

test('export validates archive relationships before accessing files',async()=>{
  const state=emptyArchive();
  state.albums.push({id:'album',title:'Album',childId:null,coverStyle:'warm',orderedArtworkIds:['absent']});
  await assert.rejects(createBackup(state,noFile),/Invalid album/);
});

test('ZIP preflight budgets both UTF-8 headers, count, individual files and directory',async()=>{
  // Size-only blobs keep the 1 GiB boundary test small. Passing preflight
  // reaches the CRC stage; rejection must happen before any payload stream.
  const reachedCRC=Error('Reached CRC');
  class SizedBlob extends Blob {
    constructor(size){super();this.reportedSize=size;}
    get size(){return this.reportedSize;}
    stream(){throw reachedCRC;}
  }
  const entry=(name,size)=>[name,new SizedBlob(size)];
  const checked=error=>error===reachedCRC;
  await assert.rejects(writeZip([entry('x',zipLimits.entry)]),checked);
  await assert.rejects(writeZip([entry('x',zipLimits.entry+1)]),limitError('entry'));
  const names=Array.from({length:8},(_,i)=>'ñ'+i);
  const overhead=22+names.reduce((sum,name)=>sum+76+2*Buffer.byteLength(name),0);
  const full=names.map((name,i)=>entry(name,zipLimits.entry-(i===0?overhead:0)));
  await assert.rejects(writeZip(full),checked);
  full[0]=entry(names[0],zipLimits.entry-overhead+1);
  await assert.rejects(writeZip(full),limitError('archive'));
  const many=Array.from({length:zipLimits.entries},(_,i)=>entry(String(i),0));
  await assert.rejects(writeZip(many),checked);
  await assert.rejects(writeZip([...many,entry('extra',0)]),limitError('entries'));
  // 46-byte header + 4 ASCII digits + 175 two-byte characters = 400 bytes.
  const largeDir=many.map(([id,blob])=>[id.padStart(4,'0')+'ñ'.repeat(175),blob]);
  await assert.rejects(writeZip(largeDir),checked);
  largeDir[0][0]+='x';
  await assert.rejects(writeZip(largeDir),limitError('directory'));
});
