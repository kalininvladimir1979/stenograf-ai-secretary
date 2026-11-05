import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import {PrismaClient} from '@prisma/client';
import {nextRuns,publicAddress,providerOf,kindOf} from '../src/cloud-core.js';
import {installMultimodal} from '../src/multimodal.js';

test('provider and file checks reject arbitrary hosts and HTML',()=>{
 assert.equal(providerOf('https://disk.yandex.ru/i/test'),'yandex');
 assert.throws(()=>providerOf('https://disk.yandex.ru.attacker.test/i/test'));
 assert.equal(kindOf('meeting.WEBM'),'video');assert.equal(kindOf('viewer.html'),null);
 for(const ip of ['127.0.0.1','10.0.0.5','172.16.0.1','192.168.0.1','169.254.169.254','::1','::ffff:127.0.0.1','fc00::1'])assert.equal(publicAddress(ip),false,ip);
 assert.equal(publicAddress('8.8.8.8'),true);
});
test('monthly schedule skips absent dates and includes last day; weekly timezone is applied',()=>{
 const monthly=nextRuns({mode:'monthly',timezone:'Europe/Moscow',days:[31],lastDay:true,times:['09:00']},new Date('2026-02-01T00:00:00Z'),2);
 assert.deepEqual(monthly.map(x=>x.toISOString()),['2026-02-28T06:00:00.000Z','2026-03-31T06:00:00.000Z']);
 const weekly=nextRuns({mode:'weekly',timezone:'Europe/Moscow',days:[1],times:['09:30']},new Date('2026-11-05T00:00:00Z'),1);
 assert.equal(weekly[0].toISOString(),'2026-11-09T06:30:00.000Z');
 assert.throws(()=>nextRuns({mode:'interval',minutes:1}));
});
test('atomic browser quota, repeated operation, and both folder grouping modes',async()=>{
 const db=new PrismaClient();const tag=randomUUID();let org:any;const temp=await fs.mkdtemp(path.join(os.tmpdir(),'stenograf-unit-'));
 try{
  org=await db.organization.create({data:{slug:'test-'+tag,name:'Integration fixture'}});
  const user=await db.user.create({data:{email:'test-'+tag+'@example.invalid',name:'Test',passwordHash:'fixture'}});
  const dept=await db.department.create({data:{organizationId:org.id,name:'Test'}});
  await db.membership.create({data:{organizationId:org.id,userId:user.id,departmentId:dept.id,role:'OWNER'}});
  await db.meetingTemplate.create({data:{organizationId:org.id,name:'Test',description:'',instructions:'',fields:[]}});
  await db.demoSpace.create({data:{organizationId:org.id,browserHash:tag}});
  let providerCalls=0,failNext=false,validIllustration=false;
  const service=installMultimodal({app:express(),db,startWorker:false,auth:()=>{},protectedDev:()=>{},member:async()=>({departmentId:dept.id}),meetingAccess:async()=>({allowed:true,editor:true}),setting:async(k:string)=>k==='demo_ai_limit'?'3':'',meetingOpenAiKey:async()=>({key:'test-key'}),uploadRoot:path.join(temp,'audio'),rawProviderGenerate:async(args:any)=>{providerCalls++;if(failNext){failNext=false;throw Error('Simulated provider outage');}if(args.operation==='image_generate')return {data:{data:[{b64_json:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9WQAAAAASUVORK5CYII='}]}};if(args.payload?.text?.format?.type==='json_object')return {data:{output_text:JSON.stringify({valid:validIllustration,unsupported:validIllustration?[]:['Неподтверждённый дополнительный этап']})}};return {data:{output_text:'Confirmed test answer'}};},responseText:(x:any)=>x.output_text});
  await service.reserve(org.id,tag+'same');await service.reserve(org.id,tag+'same');
  assert.equal((await db.demoSpace.findUniqueOrThrow({where:{organizationId:org.id}})).used,1);
  const attempts=await Promise.allSettled(Array.from({length:8},(_,i)=>service.reserve(org.id,tag+i)));
  assert.equal(attempts.filter(x=>x.status==='fulfilled').length,2);
  assert.equal((await db.demoSpace.findUniqueOrThrow({where:{organizationId:org.id}})).used,3);
  const folder=await db.cloudFolder.create({data:{organizationId:org.id,ownerId:user.id,provider:'yandex',name:'Project',url:'https://disk.yandex.ru/d/test',providerFolderId:'/',settings:{grouping:'folder'},schedule:{mode:'interval',minutes:60}}});
  const input={organizationId:org.id,ownerId:user.id,folderId:folder.id,provider:'yandex',origin:'folder',grouping:'folder',rule:'meeting',version:'1'};
  const [a,b]=await Promise.all([service.queue({...input,id:'file-a',name:'a.mp4'}),service.queue({...input,id:'file-b',name:'b.png'})]);
  assert.equal(a.meetingId,b.meetingId);assert.ok(a.meetingId);
  const repeated=await service.queue({...input,id:'file-a',name:'renamed.mp4'});assert.equal(repeated.duplicate,true);assert.equal(repeated.meetingId,a.meetingId);
  const single=await db.cloudFolder.create({data:{organizationId:org.id,ownerId:user.id,provider:'yandex',name:'Separate',url:'https://disk.yandex.ru/d/test2',providerFolderId:'/',settings:{grouping:'file'},schedule:{mode:'interval',minutes:60}}});
  const one=await service.queue({...input,folderId:single.id,grouping:'file',id:'one',name:'one.mp4'});
  const two=await service.queue({...input,folderId:single.id,grouping:'file',id:'two',name:'two.png'});assert.notEqual(one.meetingId,two.meetingId);
  const changed=await service.queue({...input,folderId:single.id,grouping:'file',id:'one',name:'renamed.mp4',version:'2'});assert.equal(changed.meetingId,one.meetingId);assert.equal(changed.duplicate,false);
  const version=await db.analysisVersion.create({data:{meetingId:one.meetingId,number:1,state:'applied',result:{},snapshot:{}}});
  await db.meeting.update({where:{id:one.meetingId},data:{activeVersionId:version.id,summary:'Test summary'}});
  const ask=async()=>{let status=200,result:any;const res:any={status:(n:number)=>{status=n;return res;},json:(v:any)=>{result=v;return res;}};await service.chat({params:{id:one.meetingId},user:{id:user.id},body:{message:'Question'}},res);return {status,result};};
  const answers=await Promise.all(Array.from({length:4},ask));
  assert.equal(answers.filter(x=>x.status===200).length,3);assert.equal(providerCalls,3);
  assert.equal((await db.analysisVersion.findUniqueOrThrow({where:{id:version.id}})).questions,3);
  const nextVersion=await db.analysisVersion.create({data:{meetingId:one.meetingId,number:2,state:'applied',result:{},snapshot:{}}});
  await db.meeting.update({where:{id:one.meetingId},data:{activeVersionId:nextVersion.id}});failNext=true;assert.equal((await ask()).status,409);
  assert.equal((await db.analysisVersion.findUniqueOrThrow({where:{id:nextVersion.id}})).questions,0);
  await db.demoSpace.update({where:{organizationId:org.id},data:{used:0}}); // isolated fixture only
  await fs.mkdir(service.root,{recursive:true});
  const image=await service.createIllustration(await db.meeting.findUniqueOrThrow({where:{id:one.meetingId}}),nextVersion,tag+'image','Пояснить подтверждённые факты');
  assert.equal(image.included,false);assert.equal(image.needsReview,true);
  assert.match((await db.analysisVersion.findUniqueOrThrow({where:{id:nextVersion.id}})).illustrationError||'',/исключена из экспорта/);
  assert.equal((await db.demoSpace.findUniqueOrThrow({where:{organizationId:org.id}})).used,1);
  await assert.rejects(()=>service.createIllustration({id:one.meetingId,organizationId:org.id},nextVersion,tag+'image2','Повтор'),/предел иллюстраций/);
  const meeting=await db.meeting.findUniqueOrThrow({where:{id:one.meetingId}});
  await assert.rejects(()=>service.createIllustration(meeting,nextVersion,tag+'invalid-replace','Новый вариант','foreign-image'),/не найдена/);
  assert.equal((await db.demoSpace.findUniqueOrThrow({where:{organizationId:org.id}})).used,1);
  await assert.rejects(()=>service.createIllustration(meeting,nextVersion,tag+'unsafe-replace','Новый вариант',image.id),/Предыдущее изображение сохранено/);
  assert.equal((await db.reportImage.findUniqueOrThrow({where:{id:image.id}})).localPath,image.localPath);
  await fs.access(image.localPath);
  validIllustration=true;
  const replaced=await service.createIllustration(meeting,nextVersion,tag+'safe-replace','Показать подтверждённые этапы слева направо',image.id);
  assert.equal(replaced.id,image.id);assert.notEqual(replaced.localPath,image.localPath);assert.equal(replaced.needsReview,false);assert.equal(replaced.caption,image.caption);
  assert.equal(await db.reportImage.count({where:{versionId:nextVersion.id}}),1);
  await assert.rejects(()=>fs.access(image.localPath));await fs.access(replaced.localPath);
 }finally{
  if(org){await db.processingJob.deleteMany({where:{organizationId:org.id}});await db.material.deleteMany({where:{organizationId:org.id}});await db.cloudFolder.deleteMany({where:{organizationId:org.id}});await db.aiOperation.deleteMany({where:{organizationId:org.id}});await db.demoSpace.deleteMany({where:{organizationId:org.id}});await db.organization.delete({where:{id:org.id}});await db.user.deleteMany({where:{email:'test-'+tag+'@example.invalid'}});}
  await db.$disconnect();
  await fs.rm(temp,{recursive:true,force:true});
 }
});
