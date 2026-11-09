import {test} from 'node:test';import assert from 'node:assert/strict';
import {cloudJsonFetch,yandexPublicFile,retryCloudRead,cloudHttpError} from '../src/cloud-http.js';

test('Yandex metadata download URL avoids the independently throttled download endpoint',async()=>{
 const calls:string[]=[];const result=await yandexPublicFile('https://disk.yandex.ru/d/fixture',async url=>{calls.push(url);assert.ok(!url.includes('/download'));return {type:'file',name:'meeting.mp3',resource_id:'file-1',md5:'revision-1',file:'https://downloader.disk.yandex.ru/fixture'};});
 assert.equal(calls.length,1);assert.equal(result.url,'https://downloader.disk.yandex.ru/fixture');assert.equal(result.version,'revision-1');
});
test('Yandex falls back only when metadata has no file URL and rejects folders',async()=>{
 const calls:string[]=[];const read=async(url:string)=>{calls.push(url);return url.includes('/download')?{href:'https://downloader.disk.yandex.ru/fallback'}:{type:'file',name:'meeting.mp3',md5:'v1'};};
 assert.equal((await yandexPublicFile('https://disk.yandex.ru/d/fixture',read)).url,'https://downloader.disk.yandex.ru/fallback');assert.equal(calls.length,2);
 await assert.rejects(yandexPublicFile('https://disk.yandex.ru/d/folder',async()=>({type:'dir'})),/папку/);
});
test('GET retries 429 with Retry-After and transient server failures',async()=>{
 const pauses:number[]=[];const replies=[new Response('limited',{status:429,headers:{'Retry-After':'2'}}),new Response('unavailable',{status:503}),Response.json({ok:true})];
 const result=await cloudJsonFetch('https://cloud-api.yandex.net/test',{}, {fetch:async()=>replies.shift()!,wait:async ms=>{pauses.push(ms);}});assert.deepEqual(result,{ok:true});assert.deepEqual(pauses,[2000,2000]);
});
test('persistent throttling preserves status and never suggests reconnecting; long Retry-After is respected',async()=>{
 let calls=0;await assert.rejects(cloudJsonFetch('https://cloud-api.yandex.net/test',{}, {fetch:async()=>{calls++;return new Response('not json',{status:429,headers:{'Retry-After':'120'}});},wait:async()=>assert.fail('must not retry before Retry-After')}),(e:any)=>e.status===429&&e.retryAfterSeconds===120&&!/Требуется переподключение/.test(e.message));assert.equal(calls,1);
 calls=0;await assert.rejects(cloudJsonFetch('https://cloud-api.yandex.net/test',{}, {fetch:async()=>{calls++;return new Response('',{status:429});},wait:async()=>{}}),(e:any)=>e.status===429);assert.equal(calls,3);
});
test('POST and authorization errors are not replayed',async()=>{
 for(const [method,status] of [['POST',429],['GET',401],['GET',403]] as const){let calls=0;await assert.rejects(cloudJsonFetch('https://cloud-api.yandex.net/test',{method},{fetch:async()=>{calls++;return new Response('html error',{status});},wait:async()=>assert.fail('unexpected retry')}),(e:any)=>e.status===status);assert.equal(calls,1);}
});

test('instruction file reads retry temporary throttling without bypassing long cooldowns',async()=>{
 let calls=0;const delays:number[]=[];assert.equal(await retryCloudRead(async()=>{if(++calls<3)throw cloudHttpError(429,'1');return 'file';},async ms=>{delays.push(ms);}),'file');assert.equal(calls,3);assert.deepEqual(delays,[1000,2000]);
 await assert.rejects(retryCloudRead(async()=>{throw cloudHttpError(429,'120');},async()=>assert.fail('must respect cooldown')),(e:any)=>e.status===429);
});
