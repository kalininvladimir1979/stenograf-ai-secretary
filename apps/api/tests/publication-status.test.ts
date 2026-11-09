import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publicationStatus} from '../src/publication-status.js';
test('deployed demo status never reads missing local build files',async()=>{
 let reads=0;
 const result=await publicationStatus('profile',{serverReadOnly:true,readRelease:async()=>null,readLocal:async()=>{reads++;throw Object.assign(new Error('missing .dockerignore'),{code:'ENOENT'});}});
 assert.equal(reads,0);assert.equal(result.mode,'server-read-only');assert.equal(result.local,null);assert.equal(result.comparison,'unknown');
});
test('read-only status retains recorded release without claiming a local comparison',async()=>{
 const release={status:'succeeded',server:{hash:'released',files:4,bytes:100}};
 const result=await publicationStatus('profile',{serverReadOnly:true,readRelease:async()=>release,readLocal:async()=>{throw Error('must not read');}});
 assert.deepEqual(result.server,release.server);assert.equal(result.release.status,'succeeded');assert.equal(result.comparison,'unknown');
});
test('local publication still compares source snapshot with deployed release',async()=>{
 const local={hash:'current',files:5,bytes:200};
 for(const [hash,expected]of [['current','synchronized'],['previous','changed']]){
  const result=await publicationStatus('profile',{serverReadOnly:false,readRelease:async()=>({server:{...local,hash}}),readLocal:async()=>local});assert.deepEqual(result.local,local);assert.equal(result.comparison,expected);
 }
});
test('workspace errors reject for the HTTP handler to return a controlled JSON error',async()=>{
 await assert.rejects(publicationStatus('profile',{serverReadOnly:false,readRelease:async()=>null,readLocal:async()=>{throw Error('fixture missing');}}),/fixture missing/);
});
