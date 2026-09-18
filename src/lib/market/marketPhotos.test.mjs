import assert from 'node:assert/strict';
import test from 'node:test';
import { appendMarketPhotos, MarketPhotoSaveProgress, photoKey } from './marketPhotos.ts';
const file=(name='photo.png',size=64,type='image/png')=>({name,size,type,lastModified:1});
test('selection accumulates, rejects duplicates explicitly, and allows reselect after removal',()=>{
 const a=file(),b=file('second.png');const one=appendMarketPhotos([], [a],0);const two=appendMarketPhotos(one.files,[b],0);assert.deepEqual(two.files,[a,b]);
 assert.equal(appendMarketPhotos(two.files,[a],0).errors.length,1);assert.deepEqual(appendMarketPhotos([b],[a],0).files,[b,a]);
});
test('existing and pending photos share five slots, excess is reported rather than silently truncated',()=>{
 const result=appendMarketPhotos([file()], [file('2.png'),file('3.png')],3);assert.equal(result.files.length,2);assert.match(result.errors.join(),/최대 5장/);
 assert.equal(appendMarketPhotos([], [file()],5).files.length,0);
});
test('JPEG PNG WebP, 8 MiB inclusive, zero/over-limit/unsupported type checks',()=>{
 assert.equal(appendMarketPhotos([], [file('a.png',8*1024*1024)],0).files.length,1);
 for(const f of [file('a.png',8*1024*1024+1),file('a.png',0),file('x.gif',64,'image/gif'),file('x.jpg',64,'text/plain')])assert.equal(appendMarketPhotos([],[f],0).errors.length,1);
});
test('partial failure retains saved entity and skips already finalized photos on retry',async()=>{
 const progress=new MarketPhotoSaveProgress(),a=file('a.png'),b=file('b.png'),c=file('c.png');let creates=0;const uploads=[];let fail=true;
 const save=async()=>{creates++;return{id:'saved-post',version:1};};
 const upload=async(id,f)=>{assert.equal(id,'saved-post');uploads.push(f.name);if(f.name==='b.png'&&fail){fail=false;throw Error('temporary');}};
 await assert.rejects(progress.run([a,b,c],save,upload));assert.equal(progress.saved.id,'saved-post');assert.equal(progress.completed.has(photoKey(a)),true);
 await progress.run([a,b,c],save,upload);assert.equal(creates,1);assert.deepEqual(uploads,['a.png','b.png','b.png','c.png']);
});
test('failed create does not claim that the post or its photos are saved',async()=>{
 const progress=new MarketPhotoSaveProgress();let upload=false;
 await assert.rejects(progress.run([file()],async()=>{throw Error('failed');},async()=>{upload=true;}));assert.equal(progress.saved,null);assert.equal(upload,false);
});
