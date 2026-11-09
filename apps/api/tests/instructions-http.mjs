import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import PDFDocument from 'pdfkit';
const db=new PrismaClient(),base='http://localhost:3002',browsers=[randomUUID(),randomUUID()],orgs=[];
async function call(route,body,browser,token,method=body?'POST':'GET'){const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json','x-demo-browser':browser,...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};}
try{
 const client=(await call('/auth/demo-session',{role:'client1'},browsers[0])).data;
 const other=(await call('/auth/demo-session',{role:'client1'},browsers[1])).data;
 const admin=(await call('/auth/demo-admin-session',{password:'1234'},browsers[0])).data;
 for(const [idx,u] of [client,other].entries()){const me=(await call('/auth/me',null,browsers[idx],u.token)).data;orgs.push(me.organizations[0].organization.id);}
 const route='/admin/instructions/'+orgs[0],read='/instructions/'+orgs[0];
 assert.equal((await call(route,{title:'Denied',text:'x'},browsers[0],client.token)).status,403);
 const created=await call(route,{title:'Synthetic instruction',text:'Тестовый текст\n\nВторой абзац.',published:true},browsers[0],admin.token);assert.equal(created.status,200);const item=created.data;
 assert.equal((await call(read,null,browsers[0],client.token)).data[0].text,'Тестовый текст\n\nВторой абзац.');
 assert.equal((await call(read,null,browsers[1],other.token)).status,403);
 await call(route+'/'+item.id,{published:false},browsers[0],admin.token,'PUT');assert.equal((await call(read,null,browsers[0],client.token)).data.length,0);
 const form=new FormData();form.append('file',new Blob(['# Учебная инструкция\n\nТолько синтетические сведения.'],{type:'text/plain'}),'instruction.txt');form.append('title','Synthetic file');
 const r=await fetch(base+route+'/files',{method:'POST',headers:{Authorization:'Bearer '+admin.token,'x-demo-browser':browsers[0]},body:form});assert.equal(r.status,200);const f=await r.json();assert.equal(f.kind,'document');assert.ok(f.text.includes('Учебная инструкция'));assert.equal(f.filePath,undefined);
 const playback=await call(read+'/'+f.id+'/playback',null,browsers[0],client.token);assert.equal(playback.status,200);const content=await fetch(base+playback.data.path);assert.equal(content.status,200);assert.ok((await content.text()).includes('синтетические'));
 const mediaFs=await import('node:fs/promises');
 for(const [name,mime,kind] of [['educational-meeting-120s.mp4','video/mp4','video'],['meeting-audio-en.wav','audio/wav','audio'],['implementation-chart.png','image/png','image']]){
  const fd=new FormData();fd.append('file',new Blob([await mediaFs.readFile('test-data/'+name)],{type:mime}),name);
  const up=await fetch(base+route+'/files',{method:'POST',headers:{Authorization:'Bearer '+admin.token,'x-demo-browser':browsers[0]},body:fd});assert.equal(up.status,200);const media=await up.json();assert.equal(media.kind,kind);
  const ticket=(await call(read+'/'+media.id+'/playback',null,browsers[0],client.token)).data.path;
  const range=await fetch(base+ticket,{headers:{Range:'bytes=0-31'}});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,32);assert.equal(range.headers.get('content-type'),mime);
 }
 const pdf=await new Promise(resolve=>{const d=new PDFDocument();const parts=[];d.on('data',b=>parts.push(b));d.on('end',()=>resolve(Buffer.concat(parts)));d.text('Synthetic instruction PDF');d.end();});
 const pdfForm=new FormData();pdfForm.append('file',new Blob([pdf],{type:'application/pdf'}),'fixture.pdf');
 const pdfResponse=await fetch(base+route+'/files',{method:'POST',headers:{Authorization:'Bearer '+admin.token,'x-demo-browser':browsers[0]},body:pdfForm});assert.equal(pdfResponse.status,200);const pdfItem=await pdfResponse.json();assert.equal(pdfItem.pageCount,1);assert.equal(pdfItem.previewPaths,undefined);const pdfTicket=(await call(read+'/'+pdfItem.id+'/playback',null,browsers[0],client.token)).data.path;const page=await fetch(base+pdfTicket+'&page=0');assert.equal(page.status,200);assert.equal(page.headers.get('content-type'),'image/png');assert.equal((await fetch(base+pdfTicket+'&page=99')).status,404);
 const altered=await fetch(base+playback.data.path.replace(f.id,item.id));assert.equal(altered.status,403);
 assert.equal((await call('/instructions/'+orgs[1]+'/'+f.id+'/playback',null,browsers[1],other.token)).status,400);
 assert.equal((await call(route,{title:'SSRF',url:'https://127.0.0.1/secret'},browsers[0],admin.token)).status,400);
 const youtube=await call(route,{title:'YouTube',url:'https://youtu.be/abcdefghijk'},browsers[0],admin.token);assert.equal(youtube.status,200);assert.equal(youtube.data.embedUrl,'https://www.youtube-nocookie.com/embed/abcdefghijk');
 assert.equal((await call(route,{title:'Unsafe',url:'javascript:alert(1)'},browsers[0],admin.token)).status,400);
 await call(route+'/'+f.id,null,browsers[0],admin.token,'DELETE');assert.equal((await fetch(base+playback.data.path)).status,400);
 console.log('PASS: admin-only mutations, organization isolation, drafts, file upload/text preview, scoped playback tickets, deletion, SSRF and embed validation.');
}finally{
 const fs=await import('node:fs/promises');for(const organizationId of orgs){const rows=await db.devSetting.findMany({where:{organizationId,key:{startsWith:'instruction:'}}});for(const row of rows){const i=JSON.parse(row.value);if(i.filePath)await fs.unlink(i.filePath).catch(()=>{});if(i.previewDir)await fs.rm(i.previewDir,{recursive:true,force:true});}const users=await db.membership.findMany({where:{organizationId},select:{userId:true}});await db.processingJob.deleteMany({where:{organizationId}});await db.material.deleteMany({where:{organizationId}});await db.aiOperation.deleteMany({where:{organizationId}});await db.demoSpace.deleteMany({where:{organizationId}});await db.devSetting.deleteMany({where:{organizationId}});await db.organization.delete({where:{id:organizationId}});await db.user.deleteMany({where:{id:{in:users.map(x=>x.userId)}}});}await db.$disconnect();
}
