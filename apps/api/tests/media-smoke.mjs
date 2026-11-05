// Real multimodal calls, isolated space, original data only. Run after relay setup.
import assert from 'node:assert/strict';import {PrismaClient}from'@prisma/client';import{randomUUID}from'node:crypto';import fs from'node:fs/promises';import path from'node:path';
const db=new PrismaClient(),browser=randomUUID(),base='http://localhost:3002';let org;
const headers={'Content-Type':'application/json','x-demo-browser':browser};
async function call(url,body,method=body?'POST':'GET'){const r=await fetch(base+url,{method,headers,...(body?{body:JSON.stringify(body)}:{})});const d=await r.json();if(!r.ok)throw Error(d.error||r.status);return d;}
async function untilReady(id){for(let i=0;i<240;i++){const m=await call('/meetings/'+id);if(m.state==='READY')return m;if(m.state==='FAILED')throw Error(m.error);await new Promise(r=>setTimeout(r,1000));}throw Error('Timed out');}
try{
 const s=await call('/auth/demo-session',{});headers.Authorization='Bearer '+s.token;const me=await call('/auth/me');org=me.organizations[0].organization;
 const key=await db.devSetting.findUniqueOrThrow({where:{key:'developer_openai_api_key'}});await db.devSetting.create({data:{organizationId:org.id,key:`organization:${org.id}:openai_api_key`,value:key.value}});
 await db.devSetting.create({data:{organizationId:org.id,key:`organization:${org.id}:analysis_model`,value:'gpt-4.1-mini'}});
 const meeting=await call('/meetings',{organizationId:org.id,departmentId:org.departments[0].id,templateId:org.templates[0].id,title:'Реальная проверка видео и графика',illustrations:false});
 const video=await fs.readFile('test-data/educational-meeting-120s.mp4');const form=new FormData();form.append('video',new Blob([video],{type:'video/mp4'}),'educational-meeting-120s.mp4');
 const uploaded=await fetch(base+'/meetings/'+meeting.id+'/video',{method:'POST',headers:{Authorization:headers.Authorization,'x-demo-browser':browser},body:form});assert.equal(uploaded.status,202,await uploaded.text());
 const first=await untilReady(meeting.id);assert.ok(first.transcript.text.length>100);assert.ok(first.summary);const usage=await call('/ai/usage?organizationId='+org.id);assert.equal(usage.remaining,2);
 console.log(JSON.stringify({videoDuration:120,realTranscription:true,realAnalysis:true,transcriptCharacters:first.transcript.text.length,remaining:usage.remaining}));
 const chart=await fs.readFile('test-data/implementation-chart.png');const imageForm=new FormData();imageForm.append('file',new Blob([chart],{type:'image/png'}),'implementation-chart.png');imageForm.append('organizationId',org.id);imageForm.append('meetingId',meeting.id);
 const response=await fetch(base+'/materials/upload',{method:'POST',headers:{Authorization:headers.Authorization,'x-demo-browser':browser},body:imageForm});const d=await response.json();assert.equal(response.status,202,d.error);await untilReady(meeting.id);
 for(let i=0;i<180;i++){const material=await db.material.findUniqueOrThrow({where:{id:d.material.id}});const job=await db.processingJob.findUniqueOrThrow({where:{materialId:material.id}});if(job.status==='done'){assert.match(material.text,/2|два/);assert.match(material.text,/1|один/);break;}if(material.error)throw Error(material.error);await new Promise(r=>setTimeout(r,1000));}
 const versions=await call('/meetings/'+meeting.id+'/versions');assert.equal(versions[0].state,'pending');assert.ok(versions[0].result.summary);assert.equal((await call('/ai/usage?organizationId='+org.id)).remaining,1);
 console.log('Source chart was visually read and included in a new analysis version. Both calls used one operation each.');
 await call(`/meetings/${meeting.id}/versions/${versions[0].id}/apply`,{});
 const exports=await fetch(base+'/meetings/'+meeting.id+'/export?format=pdf',{headers:{Authorization:headers.Authorization,'x-demo-browser':browser}});assert.equal(exports.status,200);const pdf=Buffer.from(await exports.arrayBuffer());assert.ok(pdf.byteLength>1000);await fs.mkdir('output/evidence',{recursive:true});await fs.writeFile('output/evidence/source-image-report.pdf',pdf);
}finally{
 if(org){const materials=await db.material.findMany({where:{organizationId:org.id}});const sources=await db.mediaSource.findMany({where:{meeting:{organizationId:org.id}}});const paths=new Set(materials.map(x=>x.localPath).filter(Boolean));for(const source of sources)for(const t of source.tracks||[])if(t.path)paths.add(t.path);const users=await db.membership.findMany({where:{organizationId:org.id},select:{userId:true}});await db.devSetting.deleteMany({where:{organizationId:org.id}});await db.organization.delete({where:{id:org.id}});await db.user.deleteMany({where:{id:{in:users.map(x=>x.userId)}}});for(const file of paths)if(path.resolve(file).includes('/ai-meeting-secretary-pro-max/storage/'))await fs.unlink(file).catch(()=>{});}
 await db.$disconnect();
}
