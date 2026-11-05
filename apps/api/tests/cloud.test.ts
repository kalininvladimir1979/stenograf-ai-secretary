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
test('manual schedule never schedules an automatic check',()=>{
 assert.deepEqual(nextRuns({mode:'manual'}),[]);
 assert.deepEqual(nextRuns({mode:'manual',minutes:1,days:[],times:[]},new Date('2026-11-05'),10),[]);
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
  let providerCalls=0,failNext=false,validIllustration=false;const chatRequests:any[]=[];
  const service=installMultimodal({app:express(),db,startWorker:false,auth:()=>{},protectedDev:()=>{},member:async()=>({departmentId:dept.id}),meetingAccess:async()=>({allowed:true,editor:true}),setting:async(k:string)=>k==='demo_ai_limit'?'3':'',meetingOpenAiKey:async()=>({key:'test-key'}),uploadRoot:path.join(temp,'audio'),rawProviderGenerate:async(args:any)=>{providerCalls++;if(args.payload?.input?.some((x:any)=>x.role==='system'))chatRequests.push(args.payload);if(failNext){failNext=false;throw Error('Simulated provider outage');}if(args.operation==='image_generate')return {data:{data:[{b64_json:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9WQAAAAASUVORK5CYII='}]}};if(args.payload?.text?.format?.type==='json_object')return {data:{output_text:JSON.stringify({valid:validIllustration,unsupported:validIllustration?[]:['Неподтверждённый дополнительный этап']})}};return {data:{output_text:'Confirmed test answer'}};},responseText:(x:any)=>x.output_text});
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
  const linkInput={organizationId:org.id,ownerId:user.id,provider:'yandex',origin:'link',rule:'meeting',id:'public-video',version:'1',name:'source.mp4',title:'Название из формы',notes:'Контекст встречи из формы',illustrations:false};
  const linked=await service.queue(linkInput);const linkedMeeting=await db.meeting.findUniqueOrThrow({where:{id:linked.meetingId},include:{transcript:true}});
  assert.equal(linkedMeeting.title,linkInput.title);assert.equal(linkedMeeting.notes,linkInput.notes);assert.equal(linkedMeeting.transcript?.text,linkInput.notes);
  assert.equal((await db.devSetting.findUniqueOrThrow({where:{key:'report_illustrations:'+linkedMeeting.id}})).value,'false');
  const duplicateLink=await service.queue({...linkInput,title:'Другое название'});assert.equal(duplicateLink.duplicate,true);assert.equal(duplicateLink.meetingId,linkedMeeting.id);
  const version=await db.analysisVersion.create({data:{meetingId:one.meetingId,number:1,state:'applied',result:{},snapshot:{}}});
  await db.meeting.update({where:{id:one.meetingId},data:{activeVersionId:version.id,summary:'Test summary'}});
  const ask=async(message='Обсуждались ли техники контактов и кем?')=>{let status=200,result:any;const res:any={status:(n:number)=>{status=n;return res;},json:(v:any)=>{result=v;return res;}};await service.chat({params:{id:one.meetingId},user:{id:user.id},body:{message}},res);return {status,result};};
  const questions=['Обсуждались ли техники контактов и кем?','Подготовь подробный отчёт по итогам встречи','Какой срок?','Лишний вопрос'];const answers=await Promise.all(questions.map(message=>ask(message)));
  assert.equal(answers.filter(x=>x.status===200).length,3);assert.equal(providerCalls,3);
  assert.equal(chatRequests.length,3);for(const request of chatRequests){assert.match(request.input[0].content,/По умолчанию отвечай кратко: 1–3/);assert.match(request.input[0].content,/когда пользователь явно просит такую детализацию/);assert.match(request.input[0].content,/Не выдумывай сведения/);assert.equal(request.input.at(-1).role,'user');assert.ok(questions.includes(request.input.at(-1).content));}
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
  const scanFolders=await db.cloudFolder.findMany({where:{organizationId:org.id},orderBy:{createdAt:'asc'}});
  const checkedIds:string[]=[];
  const scanned=await service.checkFolders(org.id,async(f:any)=>{checkedIds.push(f.id);if(f.id===scanFolders[0].id)throw Error('Fixture provider unavailable');return {stats:{total:8,new:2,changed:1,skipped:4,errors:0},events:[{status:'Загрузка в облако ещё не завершена'}]};});
  assert.equal(scanned.summary.total,(scanFolders.length-1)*8);assert.equal(scanned.summary.errors,1);assert.equal(scanned.summary.queued,(scanFolders.length-1)*3);assert.equal(checkedIds.length,scanFolders.length);assert.equal(scanned.summary.pending,scanFolders.length-1);
  await db.cloudFolder.update({where:{id:scanFolders[0].id},data:{status:'paused'}});
  await db.cloudFolder.update({where:{id:scanFolders[1].id},data:{status:'reconnect'}});
  const skippedScan=await service.checkFolders(org.id,async()=>{throw Error('Should not scan inactive folder');});
  assert.equal(skippedScan.summary.paused,1);assert.equal(skippedScan.summary.reconnect,1);assert.equal(skippedScan.summary.checked,0);assert.equal(skippedScan.summary.errors,0);
 }finally{
  if(org){await db.processingJob.deleteMany({where:{organizationId:org.id}});await db.material.deleteMany({where:{organizationId:org.id}});await db.cloudFolder.deleteMany({where:{organizationId:org.id}});await db.aiOperation.deleteMany({where:{organizationId:org.id}});await db.demoSpace.deleteMany({where:{organizationId:org.id}});await db.devSetting.deleteMany({where:{organizationId:org.id}});await db.organization.delete({where:{id:org.id}});await db.user.deleteMany({where:{email:'test-'+tag+'@example.invalid'}});}
  await db.$disconnect();
  await fs.rm(temp,{recursive:true,force:true});
 }
});
