// @ts-nocheck
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import {z} from 'zod';
import {downloadFile} from './cloud-core.js';
import {yandexPublicFile,retryCloudRead} from './cloud-http.js';
const run=promisify(execFile);
const prefix='instruction:';
export const sortItems=items=>items.sort((a,b)=>(a.position??Date.parse(a.createdAt))-(b.position??Date.parse(b.createdAt))||a.id.localeCompare(b.id));
const MAX=512*1024*1024;
export function instructionEmbed(raw:string){
 const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password)throw Error('Укажите публичную HTTPS-ссылку без логина и пароля.');
 const host=u.hostname.toLowerCase();
 if(host==='youtu.be'||['youtube.com','www.youtube.com','m.youtube.com'].includes(host)){
  const id=host==='youtu.be'?u.pathname.slice(1).split('/')[0]:u.searchParams.get('v')||u.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1];
  if(!id||! /^[\w-]{11}$/.test(id))throw Error('Не удалось определить видео YouTube. Укажите ссылку на конкретное видео.');
  return `https://www.youtube-nocookie.com/embed/${id}`;
 }
 if(['drive.google.com','docs.google.com'].includes(host)){
  const id=u.pathname.match(/\/d\/([\w-]+)/)?.[1]||u.searchParams.get('id');
  if(id&&/^[\w-]+$/.test(id))return `https://drive.google.com/file/d/${id}/preview`;
 }
 return null;
}
export async function installInstructions({app,db,auth,member,jwtSecret,transcribe,readableName,protectedDev,ownerGuard}){
 const root=path.resolve(process.cwd(),'../../storage/instructions');await fs.mkdir(root,{recursive:true});
 const upload=multer({dest:root,limits:{fileSize:MAX,files:1}});
 const audioUpload=multer({dest:root,limits:{fileSize:24*1024*1024,files:1}});
 const receive=(field,voice=false)=>(req,res,next)=>(voice?audioUpload:upload).single(field)(req,res,e=>{if(e)return res.status(e.code==='LIMIT_FILE_SIZE'?413:400).json({error:e.code==='LIMIT_FILE_SIZE'?(voice?'Запись превышает 24 МБ.':'Файл превышает 512 МБ.'):'Не удалось принять файл. Выберите один файл и повторите загрузку.'});next();});
 const wrap=fn=>async(req,res,next)=>{try{await fn(req,res,next);}catch(e){if(!res.headersSent)res.status(e.status===429?429:400).json({error:e instanceof z.ZodError?e.issues[0]?.message:e.message||'Не удалось обработать инструкцию.'});}};
 const access=(admin=false)=>wrap(async(req,res,next)=>{const m=await member(req.user.id,req.params.orgId);if(!m||admin&&!['OWNER','ADMIN'].includes(m.role))return res.status(403).json({error:'Нет доступа к инструкциям этой организации.'});next();});
 const get=async(org,id)=>{const row=await db.devSetting.findFirst({where:{key:prefix+id,OR:[{organizationId:org==='all'?null:org},{organizationId:null}]}});if(!row)throw Error('Инструкция не найдена.');return {...JSON.parse(row.value),shared:row.organizationId===null};};
 const publicItem=item=>{const {filePath,previewPaths,previewDir,...safe}=item;return {...safe,hasFile:!!filePath,pageCount:previewPaths?.length||0};};
 const developerOrg=wrap(async(req,res,next)=>{if(req.params.orgId!=='all'&&!await db.organization.findUnique({where:{id:req.params.orgId},select:{id:true}}))return res.status(404).json({error:'Организация не найдена.'});next();});
 const developerAccess=[protectedDev,ownerGuard,developerOrg];
 const body=z.object({title:z.string().trim().min(1,'Укажите название.').max(200),text:z.string().max(1000000).default(''),url:z.string().max(4000).optional(),published:z.boolean().default(true)});
 const persist=async(org,item)=>db.devSetting.create({data:{key:prefix+item.id,organizationId:org==='all'?null:org,value:JSON.stringify(item)}});
 const metadata=async(file,name)=>{
  const ext=path.extname(name).toLowerCase();let kind='document',mime='application/octet-stream',text='';
  const types={'.mp4':['video','video/mp4'],'.webm':['video','video/webm'],'.mov':['video','video/quicktime'],'.m4v':['video','video/mp4'],'.mkv':['video','video/x-matroska'],'.avi':['video','video/x-msvideo'],'.mp3':['audio','audio/mpeg'],'.wav':['audio','audio/wav'],'.ogg':['audio','audio/ogg'],'.m4a':['audio','audio/mp4'],'.aac':['audio','audio/aac'],'.flac':['audio','audio/flac'],'.pdf':['pdf','application/pdf'],'.png':['image','image/png'],'.jpg':['image','image/jpeg'],'.jpeg':['image','image/jpeg'],'.webp':['image','image/webp']};
  if(types[ext])[kind,mime]=types[ext];
  if(['.md','.txt','.csv'].includes(ext)){const stat=await fs.stat(file);if(stat.size<=2*1024*1024){const bytes=await fs.readFile(file);text=new TextDecoder('utf-8',{fatal:false}).decode(bytes);}}
  let previewPaths,previewDir,previewNotice;
  if(['.docx','.xlsx','.pptx','.rtf','.pdf'].includes(ext)){
   const target=path.join(root,randomUUID());try{const script=await fs.access(path.resolve('scripts/extract-material.py')).then(()=>path.resolve('scripts/extract-material.py')).catch(()=>path.resolve('apps/api/scripts/extract-material.py'));const r=await run('python3',[script,file,name,target],{timeout:240000,maxBuffer:5*1024*1024});const result=JSON.parse(r.stdout);if(ext==='.pdf'){previewPaths=(result.images||[]).map(i=>i.path);previewDir=target;}else text=result.text?.slice(0,1000000)||'';}catch{if(ext==='.pdf')previewNotice='Не удалось подготовить страницы PDF. Скачайте оригинал для просмотра.';}finally{if(!previewDir)await fs.rm(target,{recursive:true,force:true});}
  }

  return {kind,mime,text,previewPaths,previewDir,previewNotice};
 };
 app.get('/instructions/:orgId',auth,access(),wrap(async(req,res)=>{
  const rows=await db.devSetting.findMany({where:{OR:[{organizationId:req.params.orgId==='all'?null:req.params.orgId},{organizationId:null}],key:{startsWith:prefix}},orderBy:{updatedAt:'desc'}});res.json(sortItems(rows.map(r=>({...JSON.parse(r.value),shared:r.organizationId===null})).filter(i=>i.published)).map(publicItem));
 }));
 app.get('/developer/instructions/:orgId',...developerAccess,wrap(async(req,res)=>{
  const rows=await db.devSetting.findMany({where:{OR:[{organizationId:req.params.orgId==='all'?null:req.params.orgId},{organizationId:null}],key:{startsWith:prefix}},orderBy:{updatedAt:'desc'}});res.json(sortItems(rows.map(r=>({...JSON.parse(r.value),shared:r.organizationId===null}))).map(publicItem));
 }));
 app.post('/developer/instructions/:orgId',...developerAccess,wrap(async(req,res)=>{
  const p=body.parse(req.body);if(!p.url&&!p.text.trim())throw Error('Добавьте текст или ссылку.');
  const item={id:randomUUID(),title:p.title,text:p.text,published:p.published,kind:p.url?'link':'text',createdAt:new Date().toISOString(),sourceUrl:p.url||null};
  if(p.url){
   const embed=instructionEmbed(p.url);if(embed)item.embedUrl=embed;
   else{
    let url=p.url,name=decodeURIComponent(new URL(url).pathname.split('/').pop()||'Материал');
    if(['disk.yandex.ru','disk.yandex.com','yadi.sk'].includes(new URL(url).hostname)){
     const meta=await yandexPublicFile(url);name=meta.name;url=meta.url;
    }else if(new URL(url).hostname.endsWith('dropbox.com')){const u=new URL(url);u.searchParams.set('dl','1');url=u.href;}
    const dest=path.join(root,item.id);try{const r=await retryCloudRead(()=>downloadFile(url,dest,MAX,{},true));if(r.mime?.includes('text/html')){await fs.unlink(dest);item.kind='link';item.previewNotice='Этот источник не отдаёт файл напрямую. Откройте его по ссылке или загрузите файл с компьютера.';}else{Object.assign(item,await metadata(dest,name),{filePath:dest,fileName:name,size:r.bytes});if(p.text)item.text=p.text+'\n\n'+item.text;}}catch(e){await fs.unlink(dest).catch(()=>{});if(/страница просмотра/.test(e.message)){item.kind='link';item.previewNotice='Источник отдаёт страницу просмотра. Откройте ссылку или загрузите файл с компьютера для просмотра здесь.';}else throw e;}
   }
  }
  try{await persist(req.params.orgId,item);}catch(e){if(item.filePath)await fs.unlink(item.filePath).catch(()=>{});throw e;}res.json(publicItem(item));
 }));
 app.post('/developer/instructions/:orgId/files',...developerAccess,receive('file'),wrap(async(req,res)=>{
  const f=req.file;if(!f)throw Error('Выберите файл.');try{const name=readableName(f.originalname);const item={id:randomUUID(),title:String(req.body.title||name).trim().slice(0,200),published:req.body.published!=='false',filePath:f.path,fileName:name,size:f.size,createdAt:new Date().toISOString(),...await metadata(f.path,name)};await persist(req.params.orgId,item);res.json(publicItem(item));}catch(e){await fs.unlink(f.path).catch(()=>{});throw e;}
 }));
 app.put('/developer/instructions/:orgId/order',...developerAccess,wrap(async(req,res)=>{
  const ids=z.array(z.string()).max(1000).parse(req.body.ids);const rows=await db.devSetting.findMany({where:{OR:[{organizationId:req.params.orgId==='all'?null:req.params.orgId},{organizationId:null}],key:{startsWith:prefix}}});
  if(new Set(ids).size!==ids.length||ids.length!==rows.length||rows.some(r=>!ids.includes(r.key.slice(prefix.length))))throw Error('Список материалов изменился. Обновите страницу и повторите перестановку.');
  await db.$transaction(ids.map((id,position)=>{const row=rows.find(r=>r.key===prefix+id);return db.devSetting.update({where:{key:row.key},data:{value:JSON.stringify({...JSON.parse(row.value),position})}});}));res.json({ok:true});
 }));
 app.put('/developer/instructions/:orgId/:id',...developerAccess,wrap(async(req,res)=>{
  const item=await get(req.params.orgId,req.params.id);const p=z.object({title:z.string().trim().min(1).max(200).optional(),text:z.string().max(1000000).optional(),published:z.boolean().optional(),shared:z.boolean().optional()}).parse(req.body);Object.assign(item,p);await db.devSetting.update({where:{key:prefix+item.id},data:{value:JSON.stringify(item),...(p.shared!==undefined?{organizationId:p.shared?null:req.params.orgId==='all'?null:req.params.orgId}:{})}});res.json(publicItem(item));
 }));
 app.delete('/developer/instructions/:orgId/:id',...developerAccess,wrap(async(req,res)=>{const item=await get(req.params.orgId,req.params.id);await db.devSetting.delete({where:{key:prefix+item.id}});if(item.filePath)await fs.unlink(item.filePath).catch(()=>{});if(item.previewDir&&path.resolve(item.previewDir).startsWith(root+path.sep))await fs.rm(item.previewDir,{recursive:true,force:true});res.json({ok:true});}));
 app.post('/developer/instructions/:orgId/dictation',...developerAccess,receive('audio',true),wrap(async(req,res)=>{const f=req.file;if(!f)throw Error('Запись не получена.');try{res.json({text:await transcribe(f.path,req.params.orgId)});}finally{await fs.unlink(f.path).catch(()=>{});}}));
 app.get('/developer/instructions/:orgId/:id/playback',...developerAccess,wrap(async(req,res)=>{const item=await get(req.params.orgId,req.params.id);if(!item.filePath)throw Error('У инструкции нет файла.');const ticket=jwt.sign({purpose:'instruction-file',org:req.params.orgId,item:item.id,uid:req.developerAccess.ownerId,developer:true},jwtSecret,{expiresIn:'30m'});res.json({path:`/instruction-files/${item.id}?ticket=${encodeURIComponent(ticket)}`});}));
 app.get('/instructions/:orgId/:id/playback',auth,access(),wrap(async(req,res)=>{
  const item=await get(req.params.orgId,req.params.id);const m=await member(req.user.id,req.params.orgId);if(!item.published)return res.status(404).json({error:'Инструкция не опубликована.'});if(!item.filePath)throw Error('У инструкции нет файла.');
  const ticket=jwt.sign({purpose:'instruction-file',org:req.params.orgId,item:item.id,uid:req.user.id},jwtSecret,{expiresIn:'30m'});res.json({path:`/instruction-files/${item.id}?ticket=${encodeURIComponent(ticket)}`});
 }));
 app.get('/instruction-files/:id',wrap(async(req,res)=>{
  let t;try{t=jwt.verify(String(req.query.ticket||''),jwtSecret);}catch{return res.status(401).send('Срок ссылки истёк. Откройте инструкцию заново.');}
  if(t.purpose!=='instruction-file'||t.item!==req.params.id)return res.status(403).end();const binding=t.developer?await db.devSetting.findUnique({where:{key:'developer_owner_user_id'}}):null;const isDeveloper=t.developer===true&&binding?.value===t.uid&&!!(await db.user.findUnique({where:{id:t.uid},select:{id:true}}));const m=isDeveloper?null:await member(t.uid,t.org);if(!m&&!isDeveloper)return res.status(403).end();const item=await get(t.org,t.item);if(!item.published&&!isDeveloper)return res.status(404).end();if(!item.filePath||!path.resolve(item.filePath).startsWith(root+path.sep))return res.status(404).end();
  if(req.query.page!==undefined){const page=Number(req.query.page);const image=Number.isInteger(page)&&page>=0?item.previewPaths?.[page]:null;if(!image||!path.resolve(image).startsWith(root+path.sep))return res.status(404).end();res.set({'Content-Type':'image/png','X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'});return res.sendFile(image);}
  res.set({'Content-Type':item.mime||'application/octet-stream','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'",'Referrer-Policy':'no-referrer','Cache-Control':'private, no-store'});if(req.query.download==='1'||item.kind==='document')res.attachment(item.fileName);res.sendFile(item.filePath);
 }));
}
