// @ts-nocheck
import fs from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash,randomBytes,randomUUID,createCipheriv,createDecipheriv,scrypt} from 'node:crypto';
import {promisify} from 'node:util';
import {pipeline} from 'node:stream/promises';
import {execFile} from 'node:child_process';
import {Prisma} from '@prisma/client';
import multer from 'multer';

const run=promisify(execFile),derive=promisify(scrypt);
const MAGIC=Buffer.from('STENOGRAF2\n'),HEADER=MAGIC.length+28;
const MAX_BYTES=4*1024**3,MAX_JSON=200*1024**2,MAX_ROWS=200000;
export const archiveModels=['User','Organization','Department','Membership','MeetingTemplate','Meeting','MediaSource','Transcript','Decision','TaskStatus','Task','TaskComment','MeetingInvite','MeetingChatMessage','AiOperation','AnalysisVersion','Material','ReportImage','CloudAccount','CloudFolder','SyncRun','Notification','AudioRetentionPolicy','AuditLog','DevSetting'];
const metadata=Prisma.dmmf.datamodel.models.filter(m=>archiveModels.includes(m.name));
const fields=m=>m.fields.filter(f=>f.kind!=='object');
const delegate=n=>n[0].toLowerCase()+n.slice(1);
const contract=createHash('sha256').update(JSON.stringify({models:metadata.map(m=>({name:m.name,fields:fields(m).map(f=>[f.name,f.type,f.isRequired,f.isUnique]),unique:m.uniqueFields,relations:m.fields.filter(f=>f.relationFromFields?.length).map(f=>[f.type,f.relationFromFields,f.relationToFields])})),enums:Prisma.dmmf.datamodel.enums.map(e=>[e.name,e.values.map(v=>v.name)])})).digest('hex');
const globalKeys=new Set(['system_prompt','analysis_model','whisper_model','developer_openai_api_key','demo_ai_limit','developer_contact','demo_image_limit','report_image_model','vision_model','cloud_max_bytes',...['yandex','google','onedrive','dropbox','box'].flatMap(p=>[`oauth_${p}_client_id`,`oauth_${p}_client_secret`])]);
const globalAllowed=k=>globalKeys.has(k);
const walk=(value,fn)=>{
 if(typeof value==='string')return fn(value);
 if(Array.isArray(value))return value.map(v=>walk(v,fn));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>{if(['__proto__','prototype','constructor'].includes(k))throw Error('Недопустимое поле архива.');return[k,walk(v,fn)];}));
 return value;
};
const hashFile=async file=>{const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');};
const safeRelative=p=>typeof p==='string'&&p.length>0&&!p.includes('\\')&&!/^[a-z]:/i.test(p)&&!path.posix.isAbsolute(p)&&!p.split('/').some(x=>!x||x==='.'||x==='..')&&!p.includes('\0');
const scalarJson=row=>JSON.parse(JSON.stringify(row));

export function selectArchiveRows(data,scope,organizationId){
 if(scope==='all')return data;
 if(scope!=='processed')throw Error('Неизвестный состав архива.');
 const meetings=new Set(data.Meeting.filter(r=>r.organizationId===organizationId&&r.state==='READY').map(r=>r.id));
 if(!meetings.size)throw Error('В выбранной организации нет обработанных встреч.');
 const out=Object.fromEntries(archiveModels.map(n=>[n,[]]));
 for(const name of archiveModels){
  if(['User','DevSetting','CloudAccount','CloudFolder','SyncRun','Notification','AuditLog'].includes(name))continue;
  out[name]=data[name].filter(row=>name==='Organization'?row.id===organizationId:name==='Meeting'?meetings.has(row.id):'meetingId'in row?meetings.has(row.meetingId):'organizationId'in row?row.organizationId===organizationId:false);
 }
 out.DevSetting=data.DevSetting.filter(r=>r.organizationId===organizationId&&r.key.startsWith('report_illustrations:')&&meetings.has(r.key.slice(21)));
 const tasks=new Set(out.Task.map(t=>t.id));out.TaskComment=data.TaskComment.filter(r=>tasks.has(r.taskId));
 out.Material=out.Material.map(r=>({...r,folderId:null}));
 const userIds=new Set();
 for(const m of metadata)for(const relation of m.fields.filter(f=>f.kind==='object'&&f.type==='User'&&f.relationFromFields?.length))for(const row of out[m.name])for(const f of relation.relationFromFields)if(row[f])userIds.add(row[f]);
 out.User=data.User.filter(u=>userIds.has(u.id));
 return out;
}

export async function captureArchive(db,{scope,organizationId,storageRoot,decryptSecret}){
 storageRoot=path.resolve(storageRoot);
 const snapshot=await db.$transaction(async tx=>{
  const rows={};let count=0;
  for(const name of archiveModels){count+=await tx[delegate(name)].count();if(count>MAX_ROWS)throw Error('Архив превышает поддерживаемые 200 000 записей.');rows[name]=(await tx[delegate(name)].findMany()).map(scalarJson);}
  rows.DevSetting=rows.DevSetting.filter(r=>(r.organizationId||globalAllowed(r.key))&&(!r.key.startsWith('report_illustrations:')||rows.Meeting.some(m=>m.id===r.key.slice(21)&&m.organizationId===r.organizationId)));
  return selectArchiveRows(rows,scope,organizationId);
 },{isolationLevel:'RepeatableRead',timeout:120000});
 const references=new Set();
 const normalize=value=>walk(value,text=>{
  if(text===storageRoot||text.startsWith(storageRoot+path.sep)){
   const relative=path.relative(storageRoot,text).split(path.sep).join('/');
   if(!relative||!safeRelative(relative))return text;
   references.add(relative);return 'archive-file:'+relative;
  }
  return text;
 });
 for(const name of archiveModels)snapshot[name]=snapshot[name].map(row=>{
  if(name==='DevSetting'){
   if(row.value?.startsWith('v1:'))row.value={archiveSecret:decryptSecret(row.value)};
   else if(row.value){try{const parsed=JSON.parse(row.value);if(parsed&&typeof parsed==='object')row.value={archiveJson:normalize(parsed)};}catch{}}
  }
  if(name==='CloudAccount'&&row.tokens?.startsWith('v1:'))row.tokens={archiveSecret:decryptSecret(row.tokens)};
  return normalize(row);
 });
 const document={format:'stenograf-data-archive',version:2,scope,contract,exportedAt:new Date().toISOString(),rows:snapshot};
 if(Buffer.byteLength(JSON.stringify(document))>MAX_JSON)throw Error('Метаданные архива превышают 200 МБ.');
 return {document,references};
}

export async function buildEncryptedArchive(db,options,password){
 if(typeof password!=='string'||password.length<12||password.length>256)throw Error('Пароль архива: от 12 до 256 символов.');
 const work=await fs.mkdtemp(path.join(os.tmpdir(),'stenograf-export-'));await fs.chmod(work,0o700);
 try{
  const {document,references}=await captureArchive(db,options);
  const bundle=path.join(work,'bundle');await fs.mkdir(path.join(bundle,'files'),{recursive:true});
  const manifest={format:document.format,version:2,scope:options.scope,contract,exportedAt:document.exportedAt,files:[],missing:[]};
  const root=await fs.realpath(options.storageRoot),seen=new Set();let total=0;
  const copy=async relative=>{
   if(seen.has(relative))return;seen.add(relative);
   if(!safeRelative(relative))throw Error('Некорректный путь материала.');
   const source=path.join(root,relative);let before;
   try{before=await fs.lstat(source);}catch(e){if(e.code==='ENOENT'){manifest.missing.push(relative);return;}throw e;}
   if(before.isSymbolicLink())throw Error('Символические ссылки в материалах не поддерживаются.');
   const real=await fs.realpath(source);if(!real.startsWith(root+path.sep))throw Error('Материал находится вне хранилища агента.');
   if(before.isDirectory()){for(const item of await fs.readdir(source))await copy(relative+'/'+item);return;}
   if(!before.isFile())throw Error('Недопустимый тип материала.');
   total+=before.size;if(total>MAX_BYTES||manifest.files.length>=20000)throw Error('Состав архива превышает 4 ГБ или 20 000 файлов.');
   const target=path.join(bundle,'files',relative);await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(source,target);
   const after=await fs.stat(source);if(before.size!==after.size||before.mtimeMs!==after.mtimeMs)throw Error('Материал изменился во время копирования. Повторите выгрузку.');
   manifest.files.push({path:relative,bytes:before.size,sha256:await hashFile(target)});
  };
  for(const relative of references)await copy(relative);
  const data=JSON.stringify(document);await fs.writeFile(path.join(bundle,'data.json'),data,{mode:0o600});manifest.dataSha256=createHash('sha256').update(data).digest('hex');
  validateArchive(document,manifest);
  await fs.writeFile(path.join(bundle,'manifest.json'),JSON.stringify(manifest),{mode:0o600});
  const compressed=path.join(work,'data.tgz');await run('tar',['-czf',compressed,'-C',bundle,'manifest.json','data.json','files'],{timeout:900000});
  const salt=randomBytes(16),iv=randomBytes(12),key=await derive(password,salt,32,{N:16384,r:8,p:1,maxmem:64*1024**2}),cipher=createCipheriv('aes-256-gcm',key,iv),output=path.join(work,'archive.stenograf');
  await fs.writeFile(output,Buffer.concat([MAGIC,salt,iv]),{mode:0o600});
  await pipeline(createReadStream(compressed),cipher,createWriteStream(output,{flags:'a'}));await fs.appendFile(output,cipher.getAuthTag());
  return {file:output,manifest,cleanup:()=>fs.rm(work,{recursive:true,force:true})};
 }catch(e){await fs.rm(work,{recursive:true,force:true});throw e;}
}

export async function openEncryptedArchive(file,password,extractScript){
 if(typeof password!=='string'||password.length<12||password.length>256)throw Error('Введите пароль архива (от 12 символов).');
 const work=await fs.mkdtemp(path.join(os.tmpdir(),'stenograf-import-'));await fs.chmod(work,0o700);
 try{
  const stat=await fs.stat(file);if(stat.size<HEADER+16||stat.size>MAX_BYTES+256*1024**2)throw Error('Недопустимый размер архива.');
  const handle=await fs.open(file,'r'),head=Buffer.alloc(HEADER),tag=Buffer.alloc(16);
  try{await handle.read(head,0,HEADER,0);await handle.read(tag,0,16,stat.size-16);}finally{await handle.close();}
  if(!head.subarray(0,MAGIC.length).equals(MAGIC))throw Error('Это не зашифрованный архив СтеноГРАФа версии 2.');
  const key=await derive(password,head.subarray(MAGIC.length,MAGIC.length+16),32,{N:16384,r:8,p:1,maxmem:64*1024**2}),decipher=createDecipheriv('aes-256-gcm',key,head.subarray(MAGIC.length+16));decipher.setAuthTag(tag);
  const compressed=path.join(work,'data.tgz');
  try{await pipeline(createReadStream(file,{start:HEADER,end:stat.size-17}),decipher,createWriteStream(compressed,{mode:0o600}));}catch{throw Error('Неверный пароль архива или файл повреждён.');}
  const bundle=path.join(work,'bundle');await fs.mkdir(bundle);
  try{await run('python3',[extractScript,compressed,bundle],{timeout:900000,maxBuffer:1024*1024});}catch{throw Error('Архив содержит небезопасные файлы, превышает размер или на диске недостаточно места.');}
  const manifest=JSON.parse(await fs.readFile(path.join(bundle,'manifest.json'),'utf8'));
  const data=await fs.readFile(path.join(bundle,'data.json'));if(data.length>MAX_JSON)throw Error('Метаданные архива слишком велики.');
  if(createHash('sha256').update(data).digest('hex')!==manifest.dataSha256)throw Error('Метаданные повреждены.');
  const document=JSON.parse(data.toString('utf8'));validateArchive(document,manifest);
  for(const item of manifest.files){const target=path.join(bundle,'files',item.path),s=await fs.stat(target);if(s.size!==item.bytes||await hashFile(target)!==item.sha256)throw Error('Контрольная сумма материала не совпала.');}
  return {work,bundle,document,manifest,cleanup:()=>fs.rm(work,{recursive:true,force:true})};
 }catch(e){await fs.rm(work,{recursive:true,force:true});throw e;}
}
export function validateArchive(document,manifest){
 if(document.format!=='stenograf-data-archive'||document.version!==2||!['processed','all'].includes(document.scope)||document.contract!==contract||manifest.contract!==contract||manifest.scope!==document.scope)throw Error('Архив несовместим с текущей версией структуры данных.');
 if(!document.rows||Object.keys(document.rows).some(n=>!archiveModels.includes(n)))throw Error('Недопустимый раздел данных.');
 let count=0;
 for(const m of metadata){const rows=document.rows[m.name];if(!Array.isArray(rows))throw Error('Не хватает раздела '+m.name);const allowed=new Set(fields(m).map(f=>f.name)),ids=new Set();
  for(const row of rows){if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).some(k=>!allowed.has(k)))throw Error('Недопустимые поля '+m.name);if(typeof row.id!=='string'||ids.has(row.id))throw Error('Некорректные идентификаторы '+m.name);ids.add(row.id);walk(row,s=>s);
   for(const field of fields(m)){
    const value=row[field.name];
    if(value==null){if(field.isRequired&&!field.hasDefaultValue)throw Error('Не заполнено поле '+m.name+'.'+field.name);continue;}
    if(field.kind==='enum'){const values=Prisma.dmmf.datamodel.enums.find(e=>e.name===field.type)?.values.map(v=>v.name);if(!values?.includes(value))throw Error('Некорректное значение '+m.name+'.'+field.name);}
    else if(field.type==='String'){
     const wrapped=(m.name==='DevSetting'&&field.name==='value'||m.name==='CloudAccount'&&field.name==='tokens')&&typeof value==='object';
     if(!wrapped&&(typeof value!=='string'||value.includes('\0')))throw Error('Некорректный текст '+m.name+'.'+field.name);
    }else if(field.type==='Int'&&(!Number.isInteger(value)||value< -2147483648||value>2147483647))throw Error('Некорректное число '+m.name+'.'+field.name);
    else if(field.type==='Boolean'&&typeof value!=='boolean')throw Error('Некорректный переключатель '+m.name+'.'+field.name);
    else if(field.type==='DateTime'&&(typeof value!=='string'||!Number.isFinite(Date.parse(value))))throw Error('Некорректная дата '+m.name+'.'+field.name);
   }
}
  for(const keys of [...m.uniqueFields,...fields(m).filter(f=>f.isUnique).map(f=>[f.name])]){const seen=new Set();for(const row of rows){if(keys.some(k=>row[k]==null))continue;const value=JSON.stringify(keys.map(k=>row[k]));if(seen.has(value))throw Error('Повтор уникальных полей '+m.name);seen.add(value);}}
  count+=rows.length;
 }
 if(count>MAX_ROWS||!Array.isArray(manifest.files)||manifest.files.length>20000||!Array.isArray(manifest.missing))throw Error('Превышен размер данных архива.');
 let bytes=0;const paths=new Set();for(const item of manifest.files){if(!safeRelative(item.path)||paths.has(item.path)||!Number.isSafeInteger(item.bytes)||item.bytes<0||!/^[a-f0-9]{64}$/.test(item.sha256))throw Error('Некорректный список материалов.');paths.add(item.path);bytes+=item.bytes;}
 if(bytes>MAX_BYTES||manifest.missing.some(p=>!safeRelative(p)))throw Error('Некорректный размер или путь материалов.');
 for(const row of document.rows.DevSetting){
  if(!row.organizationId&&!globalAllowed(row.key))throw Error('Архив содержит запрещённые настройки платформы.');
  if(row.organizationId&&!row.key.startsWith('organization:'+row.organizationId+':')&&!row.key.startsWith('instruction:')&&row.key!=='cloud_main_connections:'+row.organizationId&&!(row.key.startsWith('report_illustrations:')&&document.rows.Meeting.some(m=>m.id===row.key.slice(21)&&m.organizationId===row.organizationId)))throw Error('Некорректный ключ настройки организации.');
  if(row.value&&typeof row.value==='object'){
   const keys=Object.keys(row.value);if(keys.length!==1||!['archiveSecret','archiveJson'].includes(keys[0])||('archiveSecret'in row.value&&typeof row.value.archiveSecret!=='string'))throw Error('Некорректный формат зашифрованной настройки.');
  }
 }
 const references=new Map();
 for(const m of metadata)for(const relation of m.fields.filter(f=>f.kind==='object'&&f.relationFromFields?.length))for(let i=0;i<relation.relationFromFields.length;i++){
  const key=relation.type+'.'+relation.relationToFields[i];if(!references.has(key))references.set(key,new Set((document.rows[relation.type]||[]).map(parent=>parent[relation.relationToFields[i]])));
  for(const row of document.rows[m.name]){const value=row[relation.relationFromFields[i]];if(value!=null&&!references.get(key).has(value))throw Error('Отсутствует связанная запись '+relation.type);}
 }
 for(const row of document.rows.CloudAccount)if(row.tokens&&typeof row.tokens==='object'&&(Object.keys(row.tokens).length!==1||typeof row.tokens.archiveSecret!=='string'))throw Error('Некорректные данные облачного подключения.');
}

export async function importArchive(db,opened,{storageRoot,ownerId,encryptSecret}){
 validateArchive(opened.document,opened.manifest);
 const importId=randomUUID(),targetRoot=path.join(storageRoot,'imports',importId),maps=new Map(),operationIds=new Map();
 const rows=structuredClone(opened.document.rows);
 for(const name of archiveModels)for(const row of rows[name])maps.set(row.id,randomUUID());
 const users=[];for(let i=0;i<rows.User.length;i+=1000)users.push(...await db.user.findMany({where:{email:{in:rows.User.slice(i,i+1000).map(u=>u.email)}},select:{id:true,email:true,passwordHash:true}}));
 const existingEmails=new Map(users.map(u=>[u.email.toLowerCase(),u.id])),existingUsers=new Map(users.map(u=>[u.id,u]));
 for(const op of rows.AiOperation)operationIds.set(op.id,maps.get(op.id));
 for(const user of rows.User)if(existingEmails.has(user.email.toLowerCase()))maps.set(user.id,existingEmails.get(user.email.toLowerCase()));
 for(const row of rows.DevSetting)if(row.key.startsWith('instruction:')){const id=row.key.slice(12);if(!maps.has(id))maps.set(id,randomUUID());}
 const blockedExistingUsers=new Set(rows.User.filter(u=>existingEmails.has(u.email.toLowerCase())&&existingEmails.get(u.email.toLowerCase())!==ownerId&&existingUsers.get(existingEmails.get(u.email.toLowerCase())).passwordHash!==u.passwordHash).map(u=>u.id));
 const translate=text=>{
  if(text.startsWith('archive-file:')){const rel=text.slice(13);if(!safeRelative(rel))throw Error('Небезопасный путь материала.');return path.join(targetRoot,rel);}
  if(maps.has(text))return maps.get(text);
  return text;
 };
 try{
  await fs.mkdir(targetRoot,{recursive:true});
  for(const item of opened.manifest.files){const target=path.join(targetRoot,item.path);await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(path.join(opened.bundle,'files',item.path),target);}
  const result=await db.$transaction(async tx=>{
   const pending=new Map(),global=[];
   for(const m of metadata){const records=[];
    for(const source of rows[m.name]){
     if(m.name==='User'&&existingEmails.has(source.email.toLowerCase()))continue;
     if(['Membership','Notification'].includes(m.name)&&blockedExistingUsers.has(source.userId))continue;
     let row=walk(source,translate);
     if(m.name==='Organization'){row.slug=row.slug+'-import-'+importId.slice(0,8);row.name=row.name+' (импорт)';}
     if(m.name==='DevSetting'){
      if(source.organizationId&&source.key.startsWith('organization:'+source.organizationId+':'))row.key='organization:'+maps.get(source.organizationId)+source.key.slice(('organization:'+source.organizationId).length);
      if(source.key==='cloud_main_connections:'+source.organizationId)row.key='cloud_main_connections:'+maps.get(source.organizationId);
      if(source.key.startsWith('report_illustrations:'))row.key='report_illustrations:'+maps.get(source.key.slice(21));
      if(source.key.startsWith('instruction:'))row.key='instruction:'+maps.get(source.key.slice(12));
      if(row.value&&typeof row.value==='object')row.value='archiveSecret'in row.value?encryptSecret(row.value.archiveSecret):JSON.stringify(row.value.archiveJson);
      if(!row.organizationId){global.push(row);continue;}
     }
     if(m.name==='CloudAccount'&&row.tokens&&typeof row.tokens==='object')row.tokens=encryptSecret(row.tokens.archiveSecret);
     if(m.name==='Material'){row.fingerprint=createHash('sha256').update(importId+':'+row.fingerprint).digest('hex');if(['queued','processing'].includes(row.status)){row.status='waiting_key';row.error='Восстановлено из архива. Запустите обработку вручную.';}}
     if(m.name==='Meeting'&&row.state==='PROCESSING'){row.state='DRAFT';row.processingStartedAt=null;row.processingStage=null;row.error='Восстановлено из архива. Запустите анализ вручную.';}
     if(m.name==='CloudFolder'){row.status='paused';row.nextRunAt=null;row.leaseUntil=null;row.registry={};}
     if(m.name==='MeetingInvite'){row.token=randomUUID();row.revokedAt=new Date().toISOString();}
     if(m.name==='Notification'&&row.link)row.link=row.link.replace(/[A-Za-z0-9_-]+/g,part=>maps.get(part)||part);
     if(row.operationId){if(!operationIds.has(source.operationId))operationIds.set(source.operationId,randomUUID());row.operationId=operationIds.get(source.operationId);}
     const nullableRelations=m.fields.filter(f=>f.kind==='object'&&f.relationFromFields?.length).flatMap(f=>f.relationFromFields).filter(f=>!m.fields.find(x=>x.name===f).isRequired);
     const later={};for(const f of nullableRelations)if(row[f]!=null){later[f]=row[f];row[f]=null;}
     for(const f of fields(m))if(f.type==='Json'&&row[f.name]===null)row[f.name]=Prisma.DbNull;
     records.push({row,later});
    }
    pending.set(m.name,records);
   }
   const done=new Set();
   while(done.size<metadata.length){let advanced=false;
    for(const m of metadata){if(done.has(m.name))continue;
     const required=m.fields.filter(f=>f.kind==='object'&&f.relationFromFields?.length&&f.relationFromFields.some(k=>m.fields.find(x=>x.name===k).isRequired)).map(f=>f.type);
     if(required.some(n=>pending.has(n)&&!done.has(n)))continue;
     const list=pending.get(m.name);for(let i=0;i<list.length;i+=200)await tx[delegate(m.name)].createMany({data:list.slice(i,i+200).map(x=>x.row)});
     done.add(m.name);advanced=true;
    }
    if(!advanced)throw Error('Не удалось согласовать связи архива.');
   }
   for(const m of metadata)for(const item of pending.get(m.name))if(Object.keys(item.later).length)await tx[delegate(m.name)].update({where:{id:item.row.id},data:item.later});
   for(const row of global)await tx.devSetting.upsert({where:{key:row.key},create:row,update:{value:row.value}});
   for(const org of rows.Organization){const organizationId=maps.get(org.id);if(!await tx.membership.findFirst({where:{organizationId,userId:ownerId,role:'OWNER'}}))await tx.membership.create({data:{organizationId,userId:ownerId,role:'OWNER'}});}
   await tx.auditLog.create({data:{actorId:ownerId,action:'archive.imported',entity:'DataArchive',details:{scope:opened.document.scope,organizations:rows.Organization.length,meetings:rows.Meeting.length,files:opened.manifest.files.length}}});
   return {organizations:rows.Organization.length,meetings:rows.Meeting.length,files:opened.manifest.files.length};
  },{timeout:120000});
  return result;
 }catch(e){await fs.rm(targetRoot,{recursive:true,force:true});throw e;}
}

export function installArchiveTransfer({app,db,protectedDev,ownerGuard,storageRoot,decryptSecret,encryptSecret,extractScript}){
 const staged=new Map();let exporting=false;
 const wrap=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){if(!res.headersSent)res.status(400).json({error:e.message||'Не удалось обработать архив.'});}};
 const upload=multer({storage:multer.diskStorage({destination(req,file,cb){fs.mkdtemp(path.join(os.tmpdir(),'stenograf-upload-')).then(directory=>{req.archiveUploadWork=directory;cb(null,directory);},cb);},filename(req,file,cb){cb(null,'upload.stenograf');}}),limits:{files:1,fileSize:MAX_BYTES+256*1024**2}});
 const removeStale=async()=>{for(const entry of await fs.readdir(os.tmpdir(),{withFileTypes:true})){if(!entry.isDirectory()||!/^stenograf-(?:export|import|upload)-/.test(entry.name))continue;const p=path.join(os.tmpdir(),entry.name),stat=await fs.stat(p);if(Date.now()-stat.mtimeMs>2*60*60000)await fs.rm(p,{recursive:true,force:true});}};
 void removeStale().catch(()=>undefined);
 const cleanTimer=setInterval(()=>{for(const[id,item]of staged)if(item.expires<Date.now()&&!item.applying){staged.delete(id);void item.opened.cleanup();}},60000);cleanTimer.unref();
 app.post('/developer/archive/export',protectedDev,ownerGuard,wrap(async(req,res)=>{
  if(exporting)return res.status(409).json({error:'Предыдущий архив ещё подготавливается или скачивается.'});
  if(!['processed','all'].includes(req.body.scope))throw Error('Выберите состав архива.');
  exporting=true;let result;try{result=await buildEncryptedArchive(db,{scope:req.body.scope,organizationId:req.body.organizationId,storageRoot,decryptSecret},req.body.password);}catch(e){exporting=false;throw e;}
  res.setHeader('Cache-Control','no-store');res.download(result.file,`stenograf-${req.body.scope}-${new Date().toISOString().slice(0,10)}.stenograf`,()=>{exporting=false;void result.cleanup();});
 }));
 app.post('/developer/archive/preview',protectedDev,ownerGuard,(req,res,next)=>{if(staged.size>=2)return res.status(409).json({error:'Завершите или отмените предыдущий предпросмотр архива.'});upload.single('file')(req,res,e=>{if(e){if(req.archiveUploadWork)void fs.rm(req.archiveUploadWork,{recursive:true,force:true});return res.status(413).json({error:'Не удалось принять архив. Максимальный размер — 4 ГБ.'});}next();});},wrap(async(req,res)=>{
  if(!req.file)throw Error('Выберите архив.');let opened;
  try{opened=await openEncryptedArchive(req.file.path,req.body.password,extractScript);if(opened.document.scope!==req.body.expectedScope)throw Error('Архив не соответствует выбранной строке.');
   const id=randomUUID(),ownerId=req.developerAccess.ownerId;
   staged.set(id,{opened,ownerId,expires:Date.now()+15*60000,applying:false});
   res.json({id,scope:opened.document.scope,organizations:opened.document.rows.Organization.map(x=>x.name),meetings:opened.document.rows.Meeting.length,tasks:opened.document.rows.Task.length,files:opened.manifest.files.length,bytes:opened.manifest.files.reduce((n,f)=>n+f.bytes,0),missing:opened.manifest.missing.length,settings:opened.document.rows.DevSetting.filter(r=>!r.organizationId).map(r=>r.key),notice:'Будут созданы копии организаций и встреч. Существующие данные и пароли уже зарегистрированных аккаунтов сохранятся. Другим существующим аккаунтам доступ по одному совпадению email не выдаётся: при необходимости пригласите участников заново. Автопроверка облаков и незавершённые AI-задания останутся на паузе.'});
  }catch(e){await opened?.cleanup();throw e;}finally{await fs.rm(req.archiveUploadWork,{recursive:true,force:true}).catch(()=>{});}
 }));
 app.post('/developer/archive/apply',protectedDev,ownerGuard,wrap(async(req,res)=>{
  if(req.body.confirm!==true)throw Error('Подтвердите применение импорта после предпросмотра.');
  const item=staged.get(req.body.id);if(!item||item.expires<Date.now()||item.ownerId!==req.developerAccess.ownerId||item.applying)throw Error('Предпросмотр истёк или недоступен. Загрузите архив заново.');
  item.applying=true;staged.delete(req.body.id);
  try{res.json({ok:true,...await importArchive(db,item.opened,{storageRoot,ownerId:item.ownerId,encryptSecret})});}finally{await item.opened.cleanup();}
 }));
 app.delete('/developer/archive/preview/:id',protectedDev,ownerGuard,wrap(async(req,res)=>{
  const item=staged.get(req.params.id);if(item?.ownerId===req.developerAccess.ownerId&&!item.applying){staged.delete(req.params.id);await item.opened.cleanup();}res.json({ok:true});
 }));
}
