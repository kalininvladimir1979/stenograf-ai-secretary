import {test} from 'node:test';
import assert from 'node:assert/strict';
import {config} from 'dotenv';
import {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {createWorkspace} from '../src/create-workspace.js';

test('new workspace is ready to use and failed initialization leaves no partial organization',async()=>{
 config({path:'.env',quiet:true});const url=new URL(process.env.DATABASE_URL||'');assert.ok(['localhost','127.0.0.1'].includes(url.hostname)&&url.port==='5441');
 const db=new PrismaClient(),suffix=randomUUID();let userId='',orgId='';
 try{
  const user=await db.user.create({data:{email:'workspace-init-'+suffix+'@example.invalid',name:'Synthetic workspace initialization',passwordHash:'unused synthetic fixture'}});userId=user.id;
  const org=await createWorkspace(db,userId,'Synthetic workspace','workspace-init-'+suffix);orgId=org.id;
  const result=await db.organization.findUniqueOrThrow({where:{id:orgId},include:{memberships:true,departments:true,templates:true,taskStatuses:true,retention:true}});
  assert.equal(result.memberships.length,1);assert.equal(result.memberships[0].role,'OWNER');assert.equal(result.memberships[0].userId,userId);assert.equal(result.departments.length,1);assert.equal(result.taskStatuses.length,5);assert.equal(result.templates.length,1);assert.equal(result.templates[0].isDefault,true);assert.ok(result.retention);
  await assert.rejects(createWorkspace(db,'missing-'+suffix,'Failed fixture','failed-init-'+suffix));
  assert.equal(await db.organization.count({where:{slug:'failed-init-'+suffix}}),0);
 }finally{
  if(orgId){await db.membership.deleteMany({where:{organizationId:orgId}});await db.meetingTemplate.deleteMany({where:{organizationId:orgId}});await db.taskStatus.deleteMany({where:{organizationId:orgId}});await db.audioRetentionPolicy.deleteMany({where:{organizationId:orgId}});await db.department.deleteMany({where:{organizationId:orgId}});await db.organization.delete({where:{id:orgId}});}
  if(userId)await db.user.delete({where:{id:userId}});await db.$disconnect();
 }
});
