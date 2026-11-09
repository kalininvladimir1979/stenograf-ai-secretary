import {test} from 'node:test';import assert from 'node:assert/strict';import {createSessionStore} from '../src/session-contour';
const storage=()=>{const values=new Map<string,string>();return {getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k),clear:()=>values.clear(),key:(i:number)=>[...values.keys()][i]??null,get length(){return values.size;}} as Storage;};
const jwt=(demo:boolean)=>'header.'+Buffer.from(JSON.stringify({id:demo?'visitor':'owner',demo})).toString('base64url')+'.signature';
test('demo contour ignores a saved working login without losing owner console access',()=>{
 const persistent=storage(),tab=storage(),sessions=createSessionStore(persistent,tab);sessions.saveWork(jwt(false));sessions.select('demo');assert.equal(sessions.token(),'');sessions.saveDemo(jwt(true));assert.equal(sessions.token(),jwt(true));assert.equal(sessions.developerToken(),jwt(false));assert.equal(sessions.workingToken(),jwt(false));
 sessions.select('work');assert.equal(sessions.token(),jwt(false));sessions.select('demo');assert.equal(sessions.token(),jwt(true));
});
test('demo sessions in separate tabs cannot overwrite the real login or each other',()=>{
 const persistent=storage(),a=createSessionStore(persistent,storage()),b=createSessionStore(persistent,storage());a.saveWork(jwt(false));a.saveDemo(jwt(true));b.select('demo');assert.equal(b.token(),'');assert.equal(b.developerToken(),jwt(false));assert.equal(a.token(),jwt(true));b.saveDemo(jwt(true)+'-second');assert.equal(a.token(),jwt(true));assert.equal(b.token(),jwt(true)+'-second');
});
test('legacy demo login migrates out of shared account storage',()=>{
 const persistent=storage(),tab=storage();persistent.setItem('secretary-token',jwt(true));const sessions=createSessionStore(persistent,tab);sessions.select('demo');assert.equal(sessions.token(),jwt(true));assert.equal(sessions.workingToken(),'');assert.equal(persistent.getItem('secretary-token'),null);sessions.select('work');assert.equal(sessions.token(),'');
});
test('clearing a demo session leaves the owner login intact; demo token cannot be saved as owner',()=>{
 const sessions=createSessionStore(storage(),storage());sessions.saveWork(jwt(false));sessions.saveDemo(jwt(true));sessions.clearActive();assert.equal(sessions.token(),'');assert.equal(sessions.developerToken(),jwt(false));assert.throws(()=>sessions.saveWork(jwt(true)),/Демо/);sessions.clearWork();assert.equal(sessions.developerToken(),'');
});
