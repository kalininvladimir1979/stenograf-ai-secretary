import {config} from 'dotenv';
import {PrismaClient} from '@prisma/client';
import {randomBytes,createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
config({path:'.env',quiet:true});
const dbUrl=new URL(process.env.DATABASE_URL||'');
if(process.env.NODE_ENV==='production'||process.env.SECRETARY_DEPLOYED==='true'||!['localhost','127.0.0.1'].includes(dbUrl.hostname)||dbUrl.port!=='5441')throw Error('This command is restricted to the local Stenograf database on port 5441');
const email=(process.argv[2]||'').trim().toLowerCase();
if(!email)throw Error('Specify the authorized local account email');
const db=new PrismaClient();
try{
 const user=await db.user.findUniqueOrThrow({where:{email}}),token=randomBytes(32).toString('hex'),expiresAt=Date.now()+15*60_000;
 const key='local_password_reset:'+createHash('sha256').update(token).digest('hex');
 await db.$transaction(async tx=>{
  await tx.devSetting.deleteMany({where:{key:{startsWith:'local_password_reset:'},value:{contains:JSON.stringify(user.id)}}});
  await tx.devSetting.create({data:{key,value:JSON.stringify({userId:user.id,expiresAt,passwordDigest:createHash('sha256').update(user.passwordHash).digest('hex')})}});
 });
 await mkdir('.local',{recursive:true,mode:0o700});
 const output=path.resolve('.local/account-recovery.json');
 await writeFile(output,JSON.stringify({token,email,expiresAt}),{mode:0o600});
 console.log('Local one-time reset prepared. Private handoff file: '+output+'. Password has not changed yet.');
}finally{await db.$disconnect();}
