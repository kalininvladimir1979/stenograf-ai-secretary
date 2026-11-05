import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
const origin=process.env.TEST_API_URL||'http://localhost:3002';
const browsers=[randomUUID(),randomUUID()];
async function request(path,body,browser,token,method=body?'POST':'GET'){
 const response=await fetch(origin+path,{method,headers:{'Content-Type':'application/json','x-demo-browser':browser||'',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
 return {status:response.status,data:await response.json()};
}
const db=new PrismaClient();const orgs=[];
try{
 const a=(await request('/auth/demo-session',{role:'client1'},browsers[0])).data;
 const b=(await request('/auth/demo-session',{role:'client2'},browsers[0])).data;
 const outsider=(await request('/auth/demo-session',{role:'client1'},browsers[1])).data;
 assert.ok(a.token&&b.token&&outsider.token);
 const me=(await request('/auth/me',null,browsers[0],a.token)).data;
 const foreign=(await request('/auth/me',null,browsers[1],outsider.token)).data;
 orgs.push(me.organizations[0].organization.id,foreign.organizations[0].organization.id);
 const org=orgs[0];
 const own=(await request('/meetings?organizationId='+org,null,browsers[0],a.token)).data;
 const second=(await request('/meetings?organizationId='+org,null,browsers[0],b.token)).data;
 assert.equal(own.length,1);assert.equal(second.length,1);assert.notEqual(own[0].id,second[0].id);
 assert.equal((await request('/meetings/'+own[0].id,null,browsers[0],b.token)).status,404);
 assert.equal((await request('/meetings/'+own[0].id,null,browsers[1],outsider.token)).status,404);
 assert.equal((await request('/auth/me',null,browsers[1],a.token)).status,401);
 assert.equal((await request('/cloud/accounts?organizationId='+org,null,browsers[0],a.token)).status,403);
 const before=(await request('/ai/usage?organizationId='+org,null,browsers[0],a.token)).data;
 assert.equal(before.remaining,3);
 const bad=await request('/materials/import',{organizationId:org,url:'https://127.0.0.1/private'},browsers[0],a.token);
 assert.equal(bad.status,400);
 assert.equal((await request('/ai/usage?organizationId='+org,null,browsers[0],b.token)).data.remaining,3);
 const admin=(await request('/auth/demo-admin-session',{password:'1234'},browsers[0])).data;
 assert.equal((await request('/admin/access?organizationId='+org,null,browsers[0],admin.token)).data.allowed,true);
 const mainSettings='/cloud/main-settings?organizationId='+org;
 assert.equal((await request(mainSettings,null,browsers[0],a.token)).status,403);
 assert.equal((await request(mainSettings,null,browsers[0],admin.token)).data.enabled,true);
 assert.equal((await request('/cloud/main-settings',{organizationId:org,enabled:false},browsers[0],a.token,'PUT')).status,403);
 assert.equal((await request('/cloud/main-settings',{organizationId:org,enabled:false},browsers[0],admin.token,'PUT')).data.enabled,false);
 assert.equal((await request(mainSettings,null,browsers[0],admin.token)).data.enabled,false);
 assert.equal((await request('/cloud/main-settings',{organizationId:org,enabled:'true'},browsers[0],admin.token,'PUT')).status,400);
 const foreignAdmin=(await request('/auth/demo-admin-session',{password:'1234'},browsers[1])).data;
 assert.equal((await request(mainSettings,null,browsers[1],foreignAdmin.token)).status,403);
 assert.equal((await request('/cloud/main-settings?organizationId='+orgs[1],null,browsers[1],foreignAdmin.token)).data.enabled,true);
 const providers=(await request('/cloud/providers',null,browsers[0],admin.token)).data;
 assert.equal(providers.length,5);
 const dev=await fetch(origin+'/developer/multimodal',{headers:{'x-dev-password':'1234'}});
 assert.equal(dev.status,200); // Explicit owner override: keep 1234 for Dev for now.
 console.log(JSON.stringify({browserIsolation:true,departmentIsolation:true,adminSeparation:true,cloudMainSettingIsolation:true,invalidLinkDoesNotSpend:true,fiveProviders:true,devPassword1234:true}));
}finally{
 for(const organizationId of orgs){const users=await db.membership.findMany({where:{organizationId},select:{userId:true}});await db.processingJob.deleteMany({where:{organizationId}});await db.material.deleteMany({where:{organizationId}});await db.aiOperation.deleteMany({where:{organizationId}});await db.demoSpace.deleteMany({where:{organizationId}});await db.devSetting.deleteMany({where:{organizationId}});await db.organization.delete({where:{id:organizationId}});await db.user.deleteMany({where:{id:{in:users.map(x=>x.userId)}}});}
 await db.$disconnect();
}
