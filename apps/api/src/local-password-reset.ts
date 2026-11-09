import type {Express,Request} from 'express';
import type {PrismaClient} from '@prisma/client';
import {createHash} from 'node:crypto';
import bcrypt from 'bcryptjs';
import {z} from 'zod';

export const resetKey=(token:string)=>'local_password_reset:'+createHash('sha256').update(token).digest('hex');
export function localResetAllowed(req:Pick<Request,'hostname'|'headers'|'socket'>,deployed=process.env.SECRETARY_DEPLOYED==='true'||process.env.NODE_ENV==='production'){
 if(deployed||!['localhost','127.0.0.1','[::1]','::1'].includes(req.hostname))return false;
 if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress||''))return false;
 return !req.headers.origin||req.headers.origin==='http://localhost:5175';
}
export function installLocalPasswordReset(app:Express,db:PrismaClient){
 for(const action of ['inspect','complete'] as const)app.post('/auth/local-password-reset/'+action,async(req,res)=>{
  res.set('Cache-Control','no-store');
  if(!localResetAllowed(req))return res.status(404).json({error:'Не найдено'});
  const input=z.object({token:z.string().regex(/^[a-f0-9]{64}$/),password:z.string().min(8).max(128).optional(),confirmation:z.string().max(128).optional()}).safeParse(req.body);
  if(!input.success)return res.status(400).json({error:'Проверьте ссылку. Новый пароль должен содержать от 8 до 128 символов.'});
  try{
   const key=resetKey(input.data.token),record=await db.devSetting.findUnique({where:{key}});
   if(!record?.value)return res.status(410).json({error:'Ссылка недействительна или уже использована. Запросите новый сброс.'});
   const ticket=JSON.parse(record.value),user=await db.user.findUnique({where:{id:ticket.userId}});
   if(!user||Date.now()>ticket.expiresAt||createHash('sha256').update(user.passwordHash).digest('hex')!==ticket.passwordDigest)return res.status(410).json({error:'Срок ссылки истёк или пароль уже изменён. Запросите новый сброс.'});
   if(action==='inspect')return res.json({email:user.email,expiresAt:ticket.expiresAt});
   if(!input.data.password||input.data.password!==input.data.confirmation)return res.status(400).json({error:'Введите одинаковый новый пароль в оба поля.'});
   const hash=await bcrypt.hash(input.data.password,12);
   await db.$transaction(async tx=>{
    const consumed=await tx.devSetting.deleteMany({where:{key,value:record.value}});
    if(consumed.count!==1)throw new Error('USED');
    const updated=await tx.user.updateMany({where:{id:user.id,passwordHash:user.passwordHash},data:{passwordHash:hash}});
    if(updated.count!==1)throw new Error('USED');
    await tx.auditLog.create({data:{actorId:user.id,action:'account.password_reset_local',entity:'User',entityId:user.id,details:{method:'local_owner_one_time_ticket'}}});
   });
   return res.json({ok:true,email:user.email});
  }catch(error){return res.status(error instanceof Error&&error.message==='USED'?410:500).json({error:error instanceof Error&&error.message==='USED'?'Ссылка уже использована.':'Сброс не завершён. Повторите попытку.'});}
 });
}
