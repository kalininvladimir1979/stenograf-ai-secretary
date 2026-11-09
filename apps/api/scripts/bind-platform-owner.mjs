import 'dotenv/config';
import {PrismaClient} from '@prisma/client';
const email=String(process.argv[2]||'').trim().toLowerCase();
if(!email.includes('@')||email.endsWith('@demo.stenograf.local')||email==='demo@stenograf.local')throw Error('Укажите email существующего рабочего аккаунта владельца.');
const db=new PrismaClient();
try{
 const owner=await db.user.findUniqueOrThrow({where:{email},select:{id:true}});
 const key='developer_owner_user_id',old=await db.devSetting.findUnique({where:{key}});
 if(old?.value&&old.value!==owner.id)throw Error('Установка уже привязана к другому владельцу. Автоматическая замена запрещена.');
 await db.devSetting.upsert({where:{key},create:{key,value:owner.id},update:{value:owner.id}});
 console.log('Рабочий аккаунт владельца привязан. Войдите по email и паролю аккаунта.');
}finally{await db.$disconnect();}
