import {z} from 'zod';
export const analysisSchema=z.object({summary:z.string(),decisions:z.array(z.object({text:z.string(),evidence:z.string().nullish().transform(x=>x??undefined)})),tasks:z.array(z.object({title:z.string(),description:z.string().nullish().transform(x=>x??undefined),assigneeEmail:z.string().nullable().optional(),dueDate:z.string().nullable().optional(),evidence:z.string().nullish().transform(x=>x??undefined),needsClarification:z.boolean().default(false)})),risks:z.array(z.string()),missing:z.array(z.string()),followUp:z.string(),customFields:z.record(z.string(),z.string().nullable()).optional()});
const object=(properties:Record<string,unknown>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const string={type:'string'},nullable={type:['string','null']},strings={type:'array',items:string};
export function meetingAnalysisFormat(fields:unknown){
 const names=Array.isArray(fields)?[...new Set(fields.filter(x=>typeof x==='string'))]:[];
 return {type:'json_schema',name:'meeting_analysis',strict:true,schema:object({summary:string,decisions:{type:'array',items:object({text:string,evidence:nullable})},tasks:{type:'array',items:object({title:string,description:nullable,assigneeEmail:nullable,dueDate:{...nullable,description:'ISO 8601 date if explicitly specified in the source, otherwise null'},evidence:nullable,needsClarification:{type:'boolean'}})},risks:strings,missing:strings,followUp:string,customFields:object(Object.fromEntries(names.map(name=>[name,nullable])))})};
}
export function parseMeetingAnalysis(text:string){
 const raw=JSON.parse(text);
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Некорректный формат анализа.');
 // Missing content is not a reason to invent a summary or to discard the rest
 // of a valid response from an older provider/model.
 if(raw.summary==null){raw.summary='Резюме не сформировано по материалам встречи.';raw.missing=[...(Array.isArray(raw.missing)?raw.missing:[]),'Резюме требует уточнения.'];}
 const result=analysisSchema.parse(raw);
 for(const task of result.tasks)if(task.dueDate&&!Number.isFinite(Date.parse(task.dueDate))){task.dueDate=null;task.needsClarification=true;}
 return result;
}
export function meetingCorpus(meeting:any,materials:any[]){
 const parts=[meeting.notes||''];
 const transcript=meeting.transcript;
 if(transcript?.source!=='materials'&&transcript?.text&&transcript.text!==meeting.notes)parts.push(transcript.text);
 if(!materials.length&&transcript?.source==='materials'&&transcript.text)parts.push(transcript.text);
 parts.push(...materials.map(m=>`[Источник ${m.id}: ${m.name}; ${m.kind}]\n${m.text||''}`));
 return parts.filter(x=>x.trim()).join('\n\n');
}
