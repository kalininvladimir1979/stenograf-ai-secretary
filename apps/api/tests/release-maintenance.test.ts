import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,readFile,readdir,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {prepareMaintenance,finishMaintenance,releaseMode} from '../src/release-maintenance.js';

async function fixture(run:(root:string,env:NodeJS.ProcessEnv)=>Promise<void>){
 const root=await mkdtemp(path.join(tmpdir(),'secretary-maintenance-test-'));
 try{
  await mkdir(path.join(root,'deploy'));await mkdir(path.join(root,'.release'));await mkdir(path.join(root,'bin'));
  await writeFile(path.join(root,'deploy/compose.production.yml'),'fixture');await writeFile(path.join(root,'.env'),'fixture');
  await writeFile(path.join(root,'bin/docker'),`#!/bin/bash
echo "$*" >> "$FIXTURE_LOG"
case "$*" in
 *"images -q api web") printf 'aaaaaaaaaaaa\\nbbbbbbbbbbbb\\n';;
 "ps -aq --filter ancestor=bbbbbbbbbbbb") echo shared-container;;
esac
`,{mode:0o700});
  await run(root,{...process.env,PATH:path.join(root,'bin')+':'+process.env.PATH,FIXTURE_LOG:path.join(root,'docker.log')});
 }finally{await rm(root,{recursive:true,force:true});}
}
test('release mode rejects unknown input before starting a deployment',()=>{assert.equal(releaseMode(undefined),'standard');assert.equal(releaseMode('economy'),'economy');assert.throws(()=>releaseMode('prune-all'));});
test('economy stops only application services, preserves shared images and never removes volumes',()=>fixture(async(root,env)=>{
 execFileSync('bash',['-eu','-c',`install="$FIXTURE_ROOT"; project=fixture; ${prepareMaintenance('economy')}`],{env:{...env,FIXTURE_ROOT:root}});
 const log=await readFile(path.join(root,'docker.log'),'utf8');
 assert.match(log,/stop web api/);assert.match(log,/rm -f web api/);assert.match(log,/image rm aaaaaaaaaaaa/);assert.doesNotMatch(log,/image rm bbbbbbbbbbbb|prune|down|--volumes|stop.*postgres/);
 assert.ok(log.indexOf('stop web api')<log.indexOf('image rm aaaaaaaaaaaa'));
}));
test('standard mode captures images without stopping or deleting anything',()=>fixture(async(root,env)=>{
 execFileSync('bash',['-eu','-c',`install="$FIXTURE_ROOT"; project=fixture; ${prepareMaintenance('standard')}`],{env:{...env,FIXTURE_ROOT:root}});
 assert.doesNotMatch(await readFile(path.join(root,'docker.log'),'utf8'),/stop|rm|prune/);
}));
test('successful retention preserves latest rollback, two DB copies, unrelated files and symlinks',()=>fixture(async(root,env)=>{
 const folder=path.join(root,'.release');
 for(const name of ['before-20261101000000.tgz','before-20261102000000.tgz','database-before-20261101000000.sql','database-before-20261102000000.sql','database-before-20261103000000.sql','owner-backup.sql'])await writeFile(path.join(folder,name),'fixture');
 await symlink(path.join(folder,'owner-backup.sql'),path.join(folder,'before-20261001000000.tgz'));
 execFileSync('bash',['-eu','-c',`install="$FIXTURE_ROOT"; rollback_archive="$install/.release/before-20261102000000.tgz"; old_app_images=""; ${finishMaintenance()}`],{env:{...env,FIXTURE_ROOT:root}});
 assert.deepEqual((await readdir(folder)).sort(),['before-20261001000000.tgz','before-20261102000000.tgz','database-before-20261102000000.sql','database-before-20261103000000.sql','owner-backup.sql']);
}));
test('retention refuses to delete code backups when the promised rollback is missing',()=>fixture(async(root,env)=>{
 await writeFile(path.join(root,'.release/before-20261101000000.tgz'),'fixture');
 assert.throws(()=>execFileSync('bash',['-eu','-c',`install="$FIXTURE_ROOT"; rollback_archive="$install/.release/missing.tgz"; old_app_images=""; ${finishMaintenance()}`],{env:{...env,FIXTURE_ROOT:root},stdio:'pipe'}));
 assert.equal((await readdir(path.join(root,'.release'))).length,1);
}));
