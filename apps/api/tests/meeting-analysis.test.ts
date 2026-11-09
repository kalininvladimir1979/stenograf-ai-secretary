import {test} from 'node:test';import assert from 'node:assert/strict';
import {meetingAnalysisFormat,parseMeetingAnalysis,meetingCorpus} from '../src/meeting-analysis.js';
const response={summary:'Согласовали проверку импорта.',decisions:[{text:'Проверить импорт',evidence:null}],tasks:[],risks:[],missing:[],followUp:'',customFields:{}};
test('strict output schema defines all fields and disallows unspecified properties including template keys',()=>{
 const format=meetingAnalysisFormat(['Итоги','Ответственный']);assert.equal(format.type,'json_schema');assert.equal(format.strict,true);
 const walk=(schema:any)=>{if(schema.type==='object'){assert.equal(schema.additionalProperties,false);assert.deepEqual([...schema.required].sort(),Object.keys(schema.properties).sort());Object.values(schema.properties).forEach(walk);}if(schema.items)walk(schema.items);};walk(format.schema);assert.deepEqual(Object.keys((format.schema.properties.customFields as any).properties),['Итоги','Ответственный']);
});
test('null summary is handled without fabricating meeting content or losing other fields',()=>{
 const parsed=parseMeetingAnalysis(JSON.stringify({...response,summary:null}));assert.match(parsed.summary,/не сформировано/);assert.deepEqual(parsed.decisions,[{text:'Проверить импорт',evidence:undefined}]);assert.ok(parsed.missing.includes('Резюме требует уточнения.'));
});
test('invalid objects are rejected rather than silently stringified, dates are never invented',()=>{
 assert.throws(()=>parseMeetingAnalysis(JSON.stringify({...response,summary:{foo:'bar'}})));assert.throws(()=>parseMeetingAnalysis('not json'));
 const parsed=parseMeetingAnalysis(JSON.stringify({...response,tasks:[{title:'Проверить',dueDate:'когда-нибудь',needsClarification:false}]}));assert.equal(parsed.tasks[0].dueDate,null);assert.equal(parsed.tasks[0].needsClarification,true);
});
test('saved notes and selected files contribute once without reusing stale aggregate transcript',()=>{
 const selected=[{id:'m1',name:'recording.mp3',kind:'audio',text:'Разговор о запуске.'}];
 assert.equal(meetingCorpus({notes:'Контекст.',transcript:{source:'notes',text:'Контекст.'}},[]),'Контекст.');
 const text=meetingCorpus({notes:'Контекст.',transcript:{source:'materials',text:'Старый агрегат'}},selected);assert.ok(text.includes('Контекст.'));assert.ok(text.includes('Разговор о запуске.'));assert.ok(!text.includes('Старый агрегат'));
 assert.equal(meetingCorpus({notes:'Новые заметки',transcript:{source:'audio',text:'Сохранённая речь'}},[]),'Новые заметки\n\nСохранённая речь');
});
