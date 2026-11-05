import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createVoiceDictation,appendDictation} from '../src/voice-dictation.ts';
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));
function fixture(getMedia?:()=>Promise<any>){
 const stopped={count:0},stream={getTracks:()=>[{stop:()=>stopped.count++}]};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:getMedia||(()=>Promise.resolve(stream))}}});
 (globalThis as any).window={isSecureContext:true};
 class Recorder{static instances:Recorder[]=[];state='inactive';mimeType='audio/webm';onstop:any;onerror:any;ondataavailable:any;constructor(_:any){Recorder.instances.push(this);}start(){this.state='recording';}stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['synthetic audio'])});this.onstop?.();}}
 (globalThis as any).MediaRecorder=Recorder;
 const states:string[]=[],texts:string[]=[],errors:string[]=[],levels:number[]=[];
 return {stopped,stream,Recorder,states,texts,errors,levels,callbacks:{onState:(s:string)=>states.push(s),onText:(s:string)=>texts.push(s),onError:(s:string)=>errors.push(s),onLevel:(n:number)=>levels.push(n)}};
}
test('append speech preserves typed draft and whitespace',()=>{assert.equal(appendDictation('Черновик',' фраза '),'Черновик фраза');assert.equal(appendDictation('Черновик\n','фраза'),'Черновик\nфраза');assert.equal(appendDictation('Текст',' '),'Текст');});
test('one recorder, visible initial meter, stop releases microphone before transcription',async()=>{
 const f=fixture();let releaseText:any;const client=createVoiceDictation({...f.callbacks,transcribe:()=>new Promise(r=>releaseText=r)});await Promise.all([client.start(),client.start()]);assert.equal(f.Recorder.instances.length,1);assert.ok(f.levels.includes(.1));client.stop();assert.ok(f.stopped.count>0);assert.equal(f.states.at(-1),'transcribing');releaseText({text:'Синтетическая фраза'});await flush();assert.deepEqual(f.texts,['Синтетическая фраза']);assert.equal(f.states.at(-1),'idle');client.cancel();
});
test('cancel during permission request stops late stream without starting recorder',async()=>{
 let permit:any;const f=fixture(()=>new Promise(r=>permit=r));const client=createVoiceDictation({...f.callbacks,transcribe:async()=>{throw Error('Must not transcribe');}});const starting=client.start();client.cancel();permit(f.stream);await starting;assert.equal(f.Recorder.instances.length,0);assert.ok(f.stopped.count>0);assert.deepEqual(f.texts,[]);
});
test('cancel aborts request and ignores late recognition response from old conversation',async()=>{
 const f=fixture();let releaseText:any,signal:AbortSignal;const client=createVoiceDictation({...f.callbacks,transcribe:async(_,s)=>{signal=s;return new Promise(r=>releaseText=r);}});await client.start();client.stop();client.cancel();assert.equal(signal!.aborted,true);releaseText({text:'Old conversation'});await flush();assert.deepEqual(f.texts,[]);assert.equal(f.states.at(-1),'idle');
});
test('empty recognition and microphone denial show errors, no text, and release resources',async()=>{
 const f=fixture();const client=createVoiceDictation({...f.callbacks,transcribe:async()=>({text:' '})});await client.start();client.stop();await flush();assert.deepEqual(f.texts,[]);assert.match(f.errors[0],/не распознана/);assert.ok(f.stopped.count>0);
 const denied=fixture(async()=>{throw Error('NotAllowed');});const second=createVoiceDictation({...denied.callbacks,transcribe:async()=>({text:'Never'})});await second.start();assert.match(denied.errors[0],/Разрешите доступ/);assert.equal(denied.states.at(-1),'idle');
});
test('recognition network error preserves draft through no onText and releases resources',async()=>{const f=fixture();const client=createVoiceDictation({...f.callbacks,transcribe:async()=>{throw Error('Сеть недоступна');}});await client.start();client.stop();await flush();assert.deepEqual(f.texts,[]);assert.match(f.errors[0],/Сеть/);assert.ok(f.stopped.count>0);assert.equal(f.states.at(-1),'idle');});
test('real meter graph uses samples and is closed with animation frame on cancellation',async()=>{
 const f=fixture();let closed=0,cancelled=0;
 class Context{state='running';destination={};createMediaStreamSource(){return {connect(){}};}createAnalyser(){return {fftSize:256,smoothingTimeConstant:0,connect(){},getFloatTimeDomainData(a:Float32Array){a.fill(.025);}};}createGain(){return {gain:{value:1},connect(){}};}close(){closed++;return Promise.resolve();}}
 (globalThis as any).AudioContext=Context;(globalThis as any).requestAnimationFrame=()=>42;(globalThis as any).cancelAnimationFrame=(id:number)=>{if(id===42)cancelled++;};
 try{const client=createVoiceDictation({...f.callbacks,transcribe:async()=>({text:'never'})});await client.start();assert.ok(f.levels.some(level=>level>.1));client.cancel();assert.equal(closed,1);assert.equal(cancelled,1);assert.ok(f.stopped.count>0);}finally{delete (globalThis as any).AudioContext;delete (globalThis as any).requestAnimationFrame;delete (globalThis as any).cancelAnimationFrame;}
});
test('starting dictation in another task or chat cancels the previous microphone owner',async()=>{const f=fixture();let firstTranscribed=false;const first=createVoiceDictation({...f.callbacks,transcribe:async()=>{firstTranscribed=true;return {text:'Old task'};}});await first.start();const second=createVoiceDictation({...f.callbacks,transcribe:async()=>({text:'New task'})});await second.start();assert.equal(f.Recorder.instances.length,2);assert.equal(f.Recorder.instances[0].state,'inactive');assert.ok(f.stopped.count>0);assert.equal(firstTranscribed,false);second.cancel();});
