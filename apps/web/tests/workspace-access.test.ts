import {test} from 'node:test';import assert from 'node:assert/strict';
import {modelCatalogOrganizations,shouldStartPublicDemo,surfaceForPath} from '../src/workspace-access';
test('admin and developer paths work at root and below the production base',()=>{
 assert.equal(surfaceForPath('/adminvk'),'admin');assert.equal(surfaceForPath('/dev/'),'dev');assert.equal(surfaceForPath('/ai-sekretar261026/adminvk','/ai-sekretar261026/'),'admin');assert.equal(surfaceForPath('/ai-sekretar261026/dev','/ai-sekretar261026/'),'dev');assert.equal(surfaceForPath('/other/dev','/ai-sekretar261026/'),null);
});
test('catalog keeps real organizations and exactly the current browser demo',()=>{
 const items=[{id:'a',slug:'company',isDemo:false},{id:'b',slug:'demo-1',isDemo:true,isCurrentDemo:false},{id:'c',slug:'demo-2',isDemo:true,isCurrentDemo:true},{id:'d',slug:'demo-stenograf',isDemo:true}];assert.deepEqual(modelCatalogOrganizations(items).map(x=>x.id),['a','c']);
});
test('legacy responses do not populate catalog with every browser demo',()=>{assert.deepEqual(modelCatalogOrganizations([{id:'1',slug:'demo-old'},{id:'2',slug:'working'}]).map(o=>o.id),['2']);});
test('a real organization named demo-something is kept when server classifies it as real',()=>{assert.equal(modelCatalogOrganizations([{id:'1',slug:'demo-company',isDemo:false}]).length,1);});
test('public demo never overwrites an existing login or an explicit account sign-in',()=>{
 const base={enabled:true,publicAccess:true};assert.equal(shouldStartPublicDemo({...base,restored:false,explicitLogin:false}),true);assert.equal(shouldStartPublicDemo({...base,restored:true,explicitLogin:false}),false);assert.equal(shouldStartPublicDemo({...base,restored:false,explicitLogin:true}),false);assert.equal(shouldStartPublicDemo({...base,enabled:false,restored:false,explicitLogin:false}),false);
});
