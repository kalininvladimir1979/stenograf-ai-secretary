import {test} from 'node:test';
import assert from 'node:assert/strict';
import {config} from 'dotenv';
import {PrismaClient} from '@prisma/client';
import express from 'express';
import bcrypt from 'bcryptjs';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {installLocalPasswordReset,localResetAllowed,resetKey} from '../src/local-password-reset.js';

test('recovery is blocked on deployed instances and for remote hosts/origins',()=>{
 const req={hostname:'localhost',headers:{origin:'http://localhost:5175'},socket:{remoteAddress:'127.0.0.1'}} as any;
 assert.equal(localResetAllowed(req,false),true);assert.equal(localResetAllowed(req,true),false);
 assert.equal(localResetAllowed({...req,hostname:'app.example.com'},false),false);
 assert.equal(localResetAllowed({...req,headers:{origin:'https://evil.example'}},false),false);
 assert.equal(localResetAllowed({...req,socket:{remoteAddress:'192.0.2.1'}},false),false);
});
test('one-time local recovery changes only the password and rejects replay',async()=>{
 config({path:'.env',quiet:true});const connection=new URL(process.env.DATABASE_URL||'');
 assert.ok(['localhost','127.0.0.1'].includes(connection.hostname)&&connection.port==='5441','Tests require the local database');
 const db=new PrismaClient(),app=express();app.use(express.json());installLocalPasswordReset(app,db);
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
 const address=server.address() as any,base=`http://127.0.0.1:${address.port}/auth/local-password-reset/`,ticket=randomBytes(32).toString('hex'),key=resetKey(ticket),password=randomUUID();
 let userId='';
 try{
  const user=await db.user.create({data:{name:'Synthetic recovery test',email:randomUUID()+'@example.invalid',passwordHash:await bcrypt.hash(randomUUID(),10)}});userId=user.id;
  await db.devSetting.create({data:{key,value:JSON.stringify({userId,expiresAt:Date.now()+60000,passwordDigest:createHash('sha256').update(user.passwordHash).digest('hex')})}});
  const request=(action:string,data:any,origin='http://localhost:5175')=>fetch(base+action,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({token:ticket,...data})});
  assert.equal((await request('inspect',{},'https://evil.example')).status,404);
  const inspected=await request('inspect',{});assert.equal(inspected.status,200);assert.equal((await inspected.json()).email,user.email);
  const issued=await db.devSetting.findUniqueOrThrow({where:{key}});
  await db.devSetting.update({where:{key},data:{value:JSON.stringify({...JSON.parse(issued.value!),expiresAt:0})}});
  assert.equal((await request('inspect',{})).status,410);
  await db.devSetting.update({where:{key},data:{value:issued.value}});
  assert.equal((await request('complete',{password,confirmation:'different'})).status,400);
  assert.equal((await request('complete',{password,confirmation:password})).status,200);
  const changed=await db.user.findUniqueOrThrow({where:{id:userId}});assert.equal(changed.id,user.id);assert.equal(changed.email,user.email);assert.equal(changed.name,user.name);assert.ok(await bcrypt.compare(password,changed.passwordHash));
  assert.equal((await request('complete',{password,confirmation:password})).status,410);
 }finally{
  server.close();await db.devSetting.deleteMany({where:{key}});
  if(userId){await db.auditLog.deleteMany({where:{actorId:userId}});await db.user.delete({where:{id:userId}});}
  await db.$disconnect();
 }
});
