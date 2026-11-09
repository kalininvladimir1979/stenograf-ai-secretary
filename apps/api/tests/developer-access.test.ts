import {test} from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import {developerPasswordAccepted,isPlatformOwnerSession} from '../src/developer-access.js';

test('only the pinned real owner account can manage platform demo settings',()=>{
 assert.equal(isPlatformOwnerSession({id:'owner',demo:false},'owner'),true);
 for(const payload of [null,{id:'owner',demo:true},{id:'other',demo:false},{id:'owner'}])assert.equal(isPlatformOwnerSession(payload,'owner'),false);
 assert.equal(isPlatformOwnerSession({id:'owner',demo:false},null),false);
});

test('demo code is accepted only while the mode is enabled; real password remains unchanged',async()=>{
 const savedHash=await bcrypt.hash('Synthetic separate developer password',4),before=savedHash;
 assert.equal(await developerPasswordAccepted('1234',{demoEnabled:true,savedHash}),true);
 assert.equal(await developerPasswordAccepted('1234',{demoEnabled:false,savedHash}),false);
 for(const demoEnabled of [true,false]){
  assert.equal(await developerPasswordAccepted('Synthetic separate developer password',{demoEnabled,savedHash}),true);
  assert.equal(await developerPasswordAccepted('incorrect',{demoEnabled,savedHash}),false);
 }
 assert.equal(savedHash,before);
});
test('missing saved password still requires the configured bootstrap password outside demo',async()=>{
 assert.equal(await developerPasswordAccepted('1234',{demoEnabled:false}),false);
 assert.equal(await developerPasswordAccepted('1234',{demoEnabled:true}),true);
 assert.equal(await developerPasswordAccepted('bootstrap-fixture',{demoEnabled:false,bootstrapPassword:'bootstrap-fixture'}),true);
 assert.equal(await developerPasswordAccepted('anything',{demoEnabled:false,bootstrapPassword:'bootstrap-fixture'}),false);
});
