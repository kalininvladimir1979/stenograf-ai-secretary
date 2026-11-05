import {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const db=new PrismaClient();
const name='stenograf_test_'+randomUUID().replaceAll('-','');
if(!/^stenograf_test_[a-f0-9]{32}$/.test(name))throw Error('Unexpected test database name');
const url=new URL(process.env.DATABASE_URL);url.pathname='/'+name;
let created=false;
try{
 await db.$executeRawUnsafe(`CREATE DATABASE "${name}"`);created=true;
 const env={...process.env,DATABASE_URL:url.href};
 execFileSync('npx',['prisma','migrate','deploy'],{env,stdio:'pipe'});
 const diff=execFileSync('npx',['prisma','migrate','diff','--from-schema-datasource','prisma/schema.prisma','--to-schema-datamodel','prisma/schema.prisma','--exit-code'],{env,encoding:'utf8'});
 console.log('Fresh database migrations:',diff.trim());
}catch(e){console.error(e.stdout?.toString()||e.message);process.exitCode=1;}
finally{if(created)await db.$executeRawUnsafe(`DROP DATABASE "${name}" WITH (FORCE)`);await db.$disconnect();}
