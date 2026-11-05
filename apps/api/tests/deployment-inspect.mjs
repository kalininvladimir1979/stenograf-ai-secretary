import dotenv from 'dotenv';
import {PrismaClient}from'@prisma/client';
import {createHash,createDecipheriv}from'node:crypto';
import fs from'node:fs/promises';import os from'node:os';import path from'node:path';
import{execFileSync}from'node:child_process';
dotenv.config({path:'.env',quiet:true});const db=new PrismaClient();const dir=await fs.mkdtemp(path.join(os.tmpdir(),'stenograf-inspect-'));
try{
 const profile=await db.publicationProfile.findUniqueOrThrow({where:{id:'cmvossfqe0000rfdvdsm8a7jc'}});
 const [,iv,tag,data]=profile.secretCiphertext.split(':');const decipher=createDecipheriv('aes-256-gcm',createHash('sha256').update(process.env.PUBLICATION_SECRET_KEY||process.env.JWT_SECRET||'secretary-local-dev').digest(),Buffer.from(iv,'base64url'));decipher.setAuthTag(Buffer.from(tag,'base64url'));const secret=Buffer.concat([decipher.update(Buffer.from(data,'base64url')),decipher.final()]).toString();
 const known=path.join(dir,'known_hosts');await fs.writeFile(known,execFileSync('ssh-keyscan',['-p',String(profile.sshPort),'-t','ed25519',profile.host],{stdio:['ignore','pipe','ignore']}));
 const fingerprint=await db.devSetting.findUniqueOrThrow({where:{key:'publication_host_fingerprint:'+profile.id}});if(!execFileSync('ssh-keygen',['-lf',known,'-E','sha256'],{encoding:'utf8'}).includes(fingerprint.value))throw Error('Host key mismatch');
 const command='set -eu; cd /opt/ai-sekretar261026; echo INSPECT; stat -c "%y %n" apps/api/src/index.ts deploy/compose.production.yml; head -3 release-manifest.sha256; docker compose --env-file .env -f deploy/compose.production.yml -p ai-sekretar261026 ps; docker compose --env-file .env -f deploy/compose.production.yml -p ai-sekretar261026 logs --tail=35 api; ls -lt .release | head -6; df -h /; ps -C docker -o pid,etimes,args || true; ps -C runc -o pid,etimes,args || true; docker system df';
 const result=execFileSync('sshpass',['-e','ssh','-o','UserKnownHostsFile='+known,'-o','StrictHostKeyChecking=yes','-p',String(profile.sshPort),profile.sshUser+'@'+profile.host,command],{env:{...process.env,SSHPASS:secret},encoding:'utf8',timeout:45000});
 console.log(result.split('\n').filter(x=>!/(?:password|secret|token)=/i.test(x)).join('\n'));
}finally{await fs.rm(dir,{recursive:true,force:true});await db.$disconnect();}
