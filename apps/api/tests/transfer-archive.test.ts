// @ts-nocheck
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID,createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import express from 'express';
import {buildEncryptedArchive,openEncryptedArchive,importArchive,validateArchive,installArchiveTransfer} from '../src/transfer-archive.js';
import {createWorkspace} from '../src/create-workspace.js';
const run=promisify(execFile),script=path.resolve('apps/api/scripts/extract-archive.py');

test('encrypted processed and full archives restore relational data and files into isolated schemas without overwriting accounts',async()=>{
 const base=new URL(process.env.DATABASE_URL);assert.ok(['localhost','127.0.0.1'].includes(base.hostname),'Local database required');
 const suffix=randomUUID().replaceAll('-',''),schemas=['archive_source_'+suffix,'archive_target_'+suffix],clients=[];
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'stenograf-archive-test-')),sourceRoot=path.join(root,'source'),targetRoot=path.join(root,'target');await fs.mkdir(sourceRoot);await fs.mkdir(targetRoot);
 const admin=new PrismaClient(),key=randomBytes(32),targetKey=randomBytes(32);
 const encrypt=(text,cipherKey=key)=>{const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',cipherKey,iv),bytes=Buffer.concat([cipher.update(text),cipher.final()]);return 'v1:'+iv.toString('base64url')+':'+cipher.getAuthTag().toString('base64url')+':'+bytes.toString('base64url');};
 const decrypt=(text,cipherKey=key)=>{const[,iv,tag,bytes]=text.split(':'),cipher=createDecipheriv('aes-256-gcm',cipherKey,Buffer.from(iv,'base64url'));cipher.setAuthTag(Buffer.from(tag,'base64url'));return Buffer.concat([cipher.update(Buffer.from(bytes,'base64url')),cipher.final()]).toString();};
 const targetEncrypt=text=>encrypt(text,targetKey),targetDecrypt=text=>decrypt(text,targetKey);
 const archives=[],opened=[];
 try{
  for(const schema of schemas){const url=new URL(base);url.searchParams.set('schema',schema);await run('node_modules/.bin/prisma',['db','push','--schema','apps/api/prisma/schema.prisma','--skip-generate'],{env:{...process.env,DATABASE_URL:url.href},timeout:120000,maxBuffer:1024*1024});clients.push(new PrismaClient({datasources:{db:{url:url.href}}}));}
  const [source,target]=clients;
  const sourceUser=await source.user.create({data:{email:'archive-owner@example.invalid',name:'Synthetic owner',passwordHash:'source-password-hash'}});
  const targetOwner=await target.user.create({data:{email:sourceUser.email,name:'Existing target owner',passwordHash:'preserve-target-password'}});
  const original=await createWorkspace(source,sourceUser.id,'Archive fixture','archive-fixture');
  const teammate=await source.user.create({data:{email:'existing-teammate@example.invalid',name:'Source teammate',passwordHash:'source-team-password'}});
  const existingTeammate=await target.user.create({data:{email:teammate.email,name:'Different target account',passwordHash:'different-target-password'}});
  await source.membership.create({data:{organizationId:original.id,userId:teammate.id,role:'MEMBER'}});
  const newTeammate=await source.user.create({data:{email:'new-teammate@example.invalid',name:'New teammate',passwordHash:'fresh-source-password-hash'}});
  await source.membership.create({data:{organizationId:original.id,userId:newTeammate.id,role:'MEMBER'}});
  await source.notification.create({data:{userId:teammate.id,kind:'INVITE',title:'Synthetic confidential notification',body:'Must not be granted by email alone'}});
  const org=await source.organization.findUnique({where:{id:original.id},include:{departments:true,templates:true,taskStatuses:true}});
  const meeting=await source.meeting.create({data:{organizationId:org.id,departmentId:org.departments[0].id,creatorId:sourceUser.id,templateId:org.templates[0].id,title:'Processed fixture',state:'READY',summary:'Confirmed summary'}});
  await source.meeting.create({data:{organizationId:org.id,departmentId:org.departments[0].id,creatorId:sourceUser.id,title:'Draft fixture',state:'DRAFT'}});
  const file=path.join(sourceRoot,'source-recording.txt');await fs.writeFile(file,'Synthetic media bytes');
  await source.transcript.create({data:{meetingId:meeting.id,text:'Synthetic transcript',source:'upload',audioPath:file}});
  const material=await source.material.create({data:{organizationId:org.id,ownerId:sourceUser.id,meetingId:meeting.id,name:'recording.txt',kind:'document',localPath:file,fingerprint:'original-fingerprint',status:'ready'}});
  await source.material.create({data:{organizationId:org.id,ownerId:teammate.id,name:'private-unattached.txt',kind:'document',localPath:file,fingerprint:'unattached-fingerprint',status:'ready'}});
  const account=await source.cloudAccount.create({data:{organizationId:org.id,ownerId:sourceUser.id,provider:'yandex',label:'Synthetic cloud',tokens:encrypt('{"access_token":"fixture-token"}')}});
  const folder=await source.cloudFolder.create({data:{organizationId:org.id,ownerId:sourceUser.id,accountId:account.id,provider:'yandex',name:'Fixture folder',url:'https://example.invalid/folder',providerFolderId:'fixture-folder',settings:{},schedule:{mode:'manual'},registry:{'fixture-file':{stamp:'v1:12',name:'recording.txt',imported:true}},nextRunAt:new Date()}});
  await source.material.update({where:{id:material.id},data:{folderId:folder.id}});
  await source.syncRun.create({data:{folderId:folder.id,status:'completed'}});
  const version=await source.analysisVersion.create({data:{meetingId:meeting.id,number:1,result:{summary:'Confirmed'},snapshot:{},state:'applied',operationId:'op-fixture'}});
  await source.aiOperation.create({data:{id:'op-fixture',organizationId:org.id,meetingId:meeting.id,kind:'analysis'}});
  await source.meeting.update({where:{id:meeting.id},data:{activeVersionId:version.id}});
  await source.reportImage.create({data:{organizationId:org.id,meetingId:meeting.id,versionId:version.id,materialId:material.id,origin:'uploaded',localPath:file,caption:'Fixture diagram'}});
  const task=await source.task.create({data:{meetingId:meeting.id,title:'Fixture task',assigneeId:sourceUser.id,statusId:org.taskStatuses[0].id}});
  await source.taskComment.create({data:{taskId:task.id,authorId:sourceUser.id,body:'Fixture comment'}});
  await source.meetingChatMessage.create({data:{meetingId:meeting.id,role:'assistant',content:'Fixture answer',versionId:version.id}});
  await source.devSetting.createMany({data:[{key:'developer_owner_user_id',value:sourceUser.id},{key:'developer_openai_api_key',value:encrypt('synthetic-api-secret')},{key:'system_prompt',value:'Synthetic analysis instruction'},{key:'instruction:fixture',organizationId:org.id,value:JSON.stringify({id:'fixture',filePath:file,text:'Instruction'})},{key:'report_illustrations:'+meeting.id,organizationId:org.id,value:'true'},{key:'cloud_main_connections:'+org.id,organizationId:org.id,value:'true'}]});
  await source.publicationProfile.create({data:{name:'Infrastructure excluded',publicUrl:'https://example.invalid',environment:'test',host:'127.0.0.1',sshUser:'fixture',installPath:'/ignored',healthPath:'/health',secretCiphertext:'never-export-this'}});
  const password='Synthetic archive password 123';
  for(const scope of ['processed','all']){
   const exported=await buildEncryptedArchive(source,{scope,organizationId:org.id,storageRoot:sourceRoot,decryptSecret:decrypt},password);archives.push(exported);
   assert.equal((await fs.readFile(exported.file)).includes(Buffer.from('Synthetic transcript')),false);
   await assert.rejects(()=>openEncryptedArchive(exported.file,'Wrong archive password!',script),/Неверный пароль/);
   const archive=await openEncryptedArchive(exported.file,password,script);opened.push(archive);
   assert.equal(archive.document.rows.Meeting.length,scope==='processed'?1:2);assert.equal(archive.document.rows.DevSetting.some(r=>r.key==='developer_owner_user_id'),false);assert.ok(!JSON.stringify(archive.document).includes('never-export-this'));
   const poisoned=structuredClone(archive.document);poisoned.rows.Membership[0].userId='missing-user';assert.throws(()=>validateArchive(poisoned,archive.manifest),/Отсутствует связанная/);
   const imported=await importArchive(target,archive,{storageRoot:targetRoot,ownerId:targetOwner.id,encryptSecret:targetEncrypt});assert.equal(imported.meetings,scope==='processed'?1:2);
   assert.equal((await target.user.findUnique({where:{id:targetOwner.id}})).passwordHash,'preserve-target-password');
   assert.equal(await target.membership.count({where:{userId:existingTeammate.id}}),0);assert.equal(await target.notification.count({where:{userId:existingTeammate.id}}),0);
   assert.equal((await target.user.findUnique({where:{email:newTeammate.email}})).passwordHash,newTeammate.passwordHash);
   const copied=await target.meeting.findFirst({where:{title:'Processed fixture'},orderBy:{createdAt:'desc'},include:{transcript:true,tasks:{include:{comments:true}},versions:true,reportImages:true}});
   assert.equal(copied.summary,'Confirmed summary');assert.equal(copied.transcript.text,'Synthetic transcript');assert.equal(await fs.readFile(copied.transcript.audioPath,'utf8'),'Synthetic media bytes');assert.ok(copied.transcript.audioPath.startsWith(targetRoot));assert.notEqual(copied.id,meeting.id);assert.equal(copied.tasks[0].assigneeId,targetOwner.id);assert.equal(copied.tasks[0].comments[0].body,'Fixture comment');assert.equal(copied.activeVersionId,copied.versions[0].id);assert.equal(copied.reportImages[0].versionId,copied.versions[0].id);
   const op=await target.aiOperation.findFirst({where:{meetingId:copied.id}});assert.equal(copied.versions[0].operationId,op.id);
   assert.equal((await target.devSetting.findUnique({where:{key:'report_illustrations:'+copied.id}})).value,'true');
   if(scope==='all'){
    assert.equal((await target.material.findFirst({where:{name:'private-unattached.txt'}})).ownerId,targetOwner.id);
    assert.equal(targetDecrypt((await target.devSetting.findUnique({where:{key:'developer_openai_api_key'}})).value),'synthetic-api-secret');
    const importedFolder=await target.cloudFolder.findFirst({include:{account:true,runs:true}});assert.equal(importedFolder.status,'paused');assert.equal(importedFolder.nextRunAt,null);assert.deepEqual(importedFolder.registry,folder.registry);assert.equal(targetDecrypt(importedFolder.account.tokens),'{"access_token":"fixture-token"}');assert.equal(importedFolder.runs.length,1);
    const instruction=await target.devSetting.findFirst({where:{key:{startsWith:'instruction:'}}});const content=JSON.parse(instruction.value);assert.equal(instruction.key,'instruction:'+content.id);assert.equal(await fs.readFile(content.filePath,'utf8'),'Synthetic media bytes');
   }
  }
  assert.equal(await source.meeting.count(),2);assert.equal(await target.meeting.count(),3);assert.equal(await target.organization.count(),2);
  const beforeFiles=await fs.readdir(path.join(targetRoot,'imports'));
  const failing={user:target.user,$transaction:fn=>target.$transaction(async tx=>{await fn(tx);throw Error('Simulated failure after inserts');},{timeout:120000})};
  await assert.rejects(()=>importArchive(failing,opened[0],{storageRoot:targetRoot,ownerId:targetOwner.id,encryptSecret:targetEncrypt}),/Simulated failure/);
  assert.equal(await target.meeting.count(),3);assert.equal(await target.organization.count(),2);assert.deepEqual(await fs.readdir(path.join(targetRoot,'imports')),beforeFiles);
  const app=express();app.use(express.json());
  installArchiveTransfer({app,db:target,storageRoot:targetRoot,decryptSecret:targetDecrypt,encryptSecret:targetEncrypt,extractScript:script,protectedDev:(req,res,next)=>{req.developerAccess={ownerId:targetOwner.id};next();},ownerGuard:(req,res,next)=>req.headers['x-test-owner']==='yes'?next():res.status(403).json({error:'Owner required'})});
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const endpoint='http://127.0.0.1:'+server.address().port;
  try{
   assert.equal((await fetch(endpoint+'/developer/archive/export',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
   const form=new FormData();form.append('file',new Blob([await fs.readFile(archives[0].file)]),'processed.stenograf');form.append('password',password);form.append('expectedScope','processed');
   const previewResponse=await fetch(endpoint+'/developer/archive/preview',{method:'POST',headers:{'x-test-owner':'yes'},body:form});assert.equal(previewResponse.status,200);const preview=await previewResponse.json();assert.equal(preview.meetings,1);assert.equal(preview.files,1);
   const apply=confirm=>fetch(endpoint+'/developer/archive/apply',{method:'POST',headers:{'x-test-owner':'yes','Content-Type':'application/json'},body:JSON.stringify({id:preview.id,confirm})});
   assert.equal((await apply(false)).status,400);assert.equal(await target.meeting.count(),3);assert.equal((await apply(true)).status,200);assert.equal(await target.meeting.count(),4);assert.equal((await apply(true)).status,400);
  }finally{await new Promise(resolve=>server.close(resolve));}
 }finally{
  for(const item of opened)await item.cleanup();for(const item of archives)await item.cleanup();for(const client of clients)await client.$disconnect();
  for(const schema of schemas)await admin.$executeRawUnsafe('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE');await admin.$disconnect();await fs.rm(root,{recursive:true,force:true});
 }
});

test('extractor rejects traversal and symlinks before writing outside the bundle',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'stenograf-unsafe-'));
 try{
  for(const kind of ['path','symlink']){
   const archive=path.join(root,kind+'.tgz'),out=path.join(root,'out-'+kind);await fs.mkdir(out);
   await run('python3',['-c',"import tarfile,io,sys; t=tarfile.open(sys.argv[1],'w:gz'); m=tarfile.TarInfo('../escape' if sys.argv[2]=='path' else 'files/link'); m.type=tarfile.REGTYPE if sys.argv[2]=='path' else tarfile.SYMTYPE; m.linkname='/etc/passwd'; m.size=1 if sys.argv[2]=='path' else 0; t.addfile(m,io.BytesIO(b'x')); t.close()",archive,kind]);
   await assert.rejects(()=>run('python3',[script,archive,out]));assert.equal(await fs.access(path.join(root,'escape')).then(()=>true,()=>false),false);
  }
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
