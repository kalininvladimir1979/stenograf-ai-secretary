import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import jwt from 'jsonwebtoken';import {PrismaClient} from '@prisma/client';
const db=new PrismaClient(),browser=randomUUID(),base='http://localhost:3002';let originalConfig,originalLimit,org,ownerToken;
const call=async(path,body,token,extra={})=>{const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','x-demo-browser':browser,...(token?{Authorization:'Bearer '+token}:{}),...extra.headers},...(body===undefined?{}:{body:JSON.stringify(body)}),...extra});return {status:r.status,data:await r.json()};};
try{
 const owner=await db.devSetting.findUniqueOrThrow({where:{key:'developer_owner_user_id'}}),u=await db.user.findUniqueOrThrow({where:{id:owner.value}});ownerToken=jwt.sign({id:u.id,email:u.email,demo:false},process.env.JWT_SECRET||'secretary-local-dev',{expiresIn:'3m'});
 originalConfig=(await call('/developer/demo-mode',undefined,ownerToken)).data;assert.equal(originalConfig.enabled,true);originalLimit=await db.devSetting.findUnique({where:{key:'demo_meeting_limit'}});
 assert.equal((await call('/developer/multimodal',{demo_meeting_limit:'1'},ownerToken,{method:'PUT'})).status,200);
 assert.equal((await call('/developer/multimodal',{demo_meeting_limit:'2'},undefined,{method:'PUT',headers:{'x-dev-password':'1234','Content-Type':'application/json'}})).status,403);
 const session=(await call('/auth/demo-session',{})).data;const me=(await call('/auth/me',undefined,session.token)).data;const membership=me.organizations[0];org=membership.organization.id;const organization=membership.organization;
 const usage=(await call('/ai/usage?organizationId='+org,undefined,session.token)).data;assert.equal(usage.meetingCount,0);assert.equal(usage.remaining,1);
 const input={organizationId:org,departmentId:membership.departmentId,templateId:organization.templates[0].id,title:'Quota HTTP fixture',notes:''};
 const first=await call('/meetings',input,session.token);assert.equal(first.status,200,JSON.stringify(first.data));const second=await call('/meetings',input,session.token);assert.equal(second.status,429,JSON.stringify(second.data));assert.match(second.data.error,/демо-встреч/);
 const after=(await call('/ai/usage?organizationId='+org,undefined,session.token)).data;assert.equal(after.meetingCount,1);assert.equal(after.remaining,0);
 assert.equal((await call('/developer/demo-mode',{...originalConfig,calendarView:'week'},ownerToken,{method:'PUT'})).status,200);assert.equal((await call('/demo-mode')).data.calendarView,'week');
 console.log('PASS: HTTP demo meeting cap counts meetings, ignores examples, denies tutorial writes, and persists calendar view');
}finally{
 if(originalConfig&&ownerToken)await call('/developer/demo-mode',originalConfig,ownerToken,{method:'PUT'});
 if(originalLimit)await db.devSetting.upsert({where:{key:'demo_meeting_limit'},create:originalLimit,update:{value:originalLimit.value}});else await db.devSetting.deleteMany({where:{key:'demo_meeting_limit'}});
 if(org){await db.aiOperation.deleteMany({where:{organizationId:org}});await db.organization.delete({where:{id:org}});}
 // Demo user email is keyed by browser hash, not the raw browser UUID.
 const {createHash}=await import('node:crypto');const hash=createHash('sha256').update(browser).digest('hex').slice(0,24);await db.user.deleteMany({where:{email:{endsWith:hash+'@demo.stenograf.local'}}});await db.$disconnect();
}
