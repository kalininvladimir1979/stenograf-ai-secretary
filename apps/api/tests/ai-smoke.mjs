// Real provider smoke test in its own browser space. Never prints or decrypts keys.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
const db=new PrismaClient(),browser=randomUUID(),base=process.env.TEST_API_URL||'http://localhost:3002';
let org;
const headers={'Content-Type':'application/json','x-demo-browser':browser};
async function call(url,body,method=body?'POST':'GET'){const r=await fetch(base+url,{method,headers,...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();if(!r.ok)throw Error(data.error||r.status);return data;}
try{
 const session=await call('/auth/demo-session',{});headers.Authorization='Bearer '+session.token;
 const me=await call('/auth/me');org=me.organizations[0].organization;
 const key=await db.devSetting.findUnique({where:{key:'developer_openai_api_key'}});assert.ok(key?.value,'No developer key available');
 await db.devSetting.create({data:{organizationId:org.id,key:`organization:${org.id}:openai_api_key`,value:key.value}});
 await db.devSetting.create({data:{organizationId:org.id,key:`organization:${org.id}:analysis_model`,value:'gpt-4.1-mini'}});
 const meeting=await call('/meetings',{organizationId:org.id,departmentId:org.departments[0].id,templateId:org.templates[0].id,title:'Проверка реального анализа · '+browser.slice(0,6),illustrations:false,notes:'На учебной встрече решили проверить импорт документов в СтеноГРАФ. Анна должна подготовить инструкцию. Срок выполнения и email Анны не названы. Открытый вопрос: кто проверит итоговую инструкцию?'});
 const result=await call('/meetings/'+meeting.id);assert.equal(result.state,'READY',result.error);assert.ok(result.summary?.length>20);assert.ok(result.tasks.length);assert.ok(result.activeVersionId);
 assert.equal((await call('/ai/usage?organizationId='+org.id)).remaining,2);
 console.log(JSON.stringify({realAnalysis:true,summary:result.summary,tasks:result.tasks.length,activeVersion:true,remaining:2}));
 for(const question of ['Что решили проверить?','Какое поручение получила Анна?','Что осталось уточнить?'])assert.ok((await call('/meetings/'+meeting.id+'/chat',{message:question})).answer);
 await assert.rejects(()=>call('/meetings/'+meeting.id+'/chat',{message:'Четвёртый вопрос'}),/три вопроса/);
 assert.equal((await call('/meetings/'+meeting.id)).questionsRemaining,0);
 console.log('Three real answers saved; fourth question rejected before provider call.');
 const task=result.tasks[0],done=org.taskStatuses.find(x=>x.key==='DONE');
 await call('/tasks/'+task.id,{title:'Исправлено вручную: подготовить инструкцию',statusId:done.id},'PUT');
 await call('/meetings/'+meeting.id+'/retry',{});
 for(let i=0;i<45;i++){await new Promise(r=>setTimeout(r,1000));const current=await call('/meetings/'+meeting.id);if(current.state!=='PROCESSING'){assert.equal(current.state,'READY',current.error);break;}}
 const versions=await call('/meetings/'+meeting.id+'/versions');assert.equal(versions.length,2);assert.equal(versions[0].state,'pending');assert.equal(versions[1].questions,3);
 const oldTask=await db.task.findUniqueOrThrow({where:{id:task.id}});assert.equal(oldTask.statusId,done.id);assert.match(oldTask.title,/Исправлено вручную/);
 await call(`/meetings/${meeting.id}/versions/${versions[0].id}/apply`,{});
 assert.equal((await db.task.findUniqueOrThrow({where:{id:task.id}})).statusId,done.id);
 assert.equal((await call('/meetings/'+meeting.id)).questionsRemaining,3);
 assert.equal((await call('/ai/usage?organizationId='+org.id)).remaining,1);
 console.log('New analysis preserved manual task and status; old chat retained, new version has three questions.');
}finally{
 if(org){const ids=(await db.meeting.findMany({where:{organizationId:org.id},select:{id:true}})).map(x=>x.id);const users=await db.membership.findMany({where:{organizationId:org.id},select:{userId:true}});await db.analysisVersion.deleteMany({where:{meetingId:{in:ids}}});await db.aiOperation.deleteMany({where:{organizationId:org.id}});await db.demoSpace.deleteMany({where:{organizationId:org.id}});await db.devSetting.deleteMany({where:{organizationId:org.id}});await db.organization.delete({where:{id:org.id}});await db.user.deleteMany({where:{id:{in:users.map(x=>x.userId)}}});}
 await db.$disconnect();
}
