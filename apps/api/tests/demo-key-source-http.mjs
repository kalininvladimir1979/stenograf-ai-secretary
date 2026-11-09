import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';

const origin=process.env.TEST_API_URL||'http://localhost:3002';
assert.ok(['localhost','127.0.0.1'].includes(new URL(origin).hostname),'Run only against local development');
const db=new PrismaClient(),browser=randomUUID();
const saved=await db.devSetting.findUnique({where:{key:'demo_use_developer_key'}});
let organizationId;
async function request(path,body,token,developer=false){
 const response=await fetch(origin+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','x-demo-browser':browser,...(token?{Authorization:'Bearer '+token}:{}),...(developer?{'x-dev-password':'1234'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data;
}
async function platform(enabled){
 const response=await fetch(origin+'/developer/multimodal',{method:'PUT',headers:{'Content-Type':'application/json','x-dev-password':'1234'},body:JSON.stringify({demo_use_developer_key:String(enabled)})});
 assert.equal(response.status,200);
}
try{
 const session=await request('/auth/demo-session',{role:'client1'});
 const me=await request('/auth/me',null,session.token);organizationId=me.organizations[0].organization.id;
 const usage=()=>request('/ai/usage?organizationId='+organizationId,null,session.token);
 await platform(false);
 let state=await usage();assert.equal(state.demo,true);assert.equal(state.platformKeyEnabled,false);assert.equal(state.hasKey,false);assert.equal(state.keySource,'none');
 await db.devSetting.create({data:{key:`organization:${organizationId}:openai_api_key`,organizationId,value:'synthetic-unusable-key-no-provider-calls'}});
 state=await usage();assert.equal(state.hasKey,true);assert.equal(state.keySource,'organization');
 await platform(true);
 state=await usage();assert.equal(state.platformKeyEnabled,true);assert.equal(state.keySource,state.platformKeyConfigured?'developer-demo':'none');
 assert.equal(state.hasKey,state.platformKeyConfigured);assert.ok(!JSON.stringify(state).includes('synthetic-unusable'));
 await platform(false);assert.equal((await usage()).keySource,'organization');
 console.log('PASS: own key required when platform toggle is off; console key selected when on; no fallback to own key when console key is missing; no key values exposed. No provider calls.');
}finally{
 if(saved)await db.devSetting.upsert({where:{key:saved.key},create:{key:saved.key,value:saved.value},update:{value:saved.value}});
 else await db.devSetting.deleteMany({where:{key:'demo_use_developer_key'}});
 if(organizationId){
  const users=await db.membership.findMany({where:{organizationId},select:{userId:true}});
  await db.demoSpace.deleteMany({where:{organizationId}});
  await db.devSetting.deleteMany({where:{organizationId}});
  await db.organization.delete({where:{id:organizationId}});
  await db.user.deleteMany({where:{id:{in:users.map(x=>x.userId)}}});
 }
 await db.$disconnect();
}
