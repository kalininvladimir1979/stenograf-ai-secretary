import dotenv from 'dotenv';
import {PrismaClient}from'@prisma/client';
import {createHash,createDecipheriv}from'node:crypto';
import {rawProviderGenerate}from'../shared/llm-channel.mjs';
dotenv.config({path:['.env','../../MULTiBOT/.env'],quiet:true});
process.env.MULTIBOT_LLM_GATEWAY_INTERNAL_URL='http://127.0.0.1:8012';
const db=new PrismaClient();
try{
 const saved=await db.devSetting.findUniqueOrThrow({where:{key:'developer_openai_api_key'}});let key=saved.value;
 if(key.startsWith('v1:')){const [,iv,tag,data]=key.split(':');const decipher=createDecipheriv('aes-256-gcm',createHash('sha256').update(process.env.PUBLICATION_SECRET_KEY||process.env.JWT_SECRET||'secretary-local-dev').digest(),Buffer.from(iv,'base64url'));decipher.setAuthTag(Buffer.from(tag,'base64url'));key=Buffer.concat([decipher.update(Buffer.from(data,'base64url')),decipher.final()]).toString();}
 for(const input of [{model:'gpt-4.1-mini',input:'Return a JSON object with the key ok and boolean true.',text:{format:{type:'json_object'}}},{model:'gpt-4.1-mini',instructions:'Return only JSON.',input:'Return a JSON object with the key ok and boolean true.',text:{format:{type:'json_object'}}}]){
   try{const r=await rawProviderGenerate({apiKey:key,model:input.model,payload:input,timeoutSeconds:30});console.log(JSON.stringify({channel:r.channel,data:r.data}));}catch(e){console.log({message:e.message,code:e.code});}
 }
 const models=await rawProviderGenerate({apiKey:key,model:'gpt-4.1-mini',operation:'model_catalog',payload:{},timeoutSeconds:30}).catch(e=>({error:e.message}));
 console.log('Model access:',models.error||models.data?.data?.filter(x=>/gpt-4.1-mini|gpt-image-2.5|whisper-1/.test(x.id)).map(x=>x.id));
}finally{await db.$disconnect();}
