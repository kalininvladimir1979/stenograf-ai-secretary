export type TranscriptPart={prefix:string;text:string;source:string;heading:string};
/** Separate only the application's source/track markers. Original text round-trips unchanged. */
export function splitTranscript(text:string):TranscriptPart[]{
 const parts:TranscriptPart[]=[];let prefix='',body='',source='',heading='Текст записи';
 const flush=()=>{if(prefix||body)parts.push({prefix,text:body,source,heading});prefix='';body='';};
 for(const line of text.match(/[^\n]*\n|[^\n]+$/g)||[]){
  const trimmed=line.replace(/\r?\n$/,'').trim();
  const file=trimmed.match(/^\[Источник [A-Za-z0-9_-]{8,}: (.+); (?:video|audio|image|document|collection)\]$/);
  const track=trimmed.match(/^\[(Дорожка[^;\]\n]+);\s*([+-]?\d+:\d{2}(?::\d{2})?)\]$/);
  if(file||track){if(body)flush();prefix+=line;if(file){source=file[1];heading='Текст записи';}if(track){heading=track[1].trim();if(!/^\+?0+:00(?::00)?$/.test(track[2]))heading+=' · сдвиг '+track[2];}}
  else body+=line;
 }
 flush();return parts.length?parts:[{prefix:'',text:'',source:'',heading:'Текст записи'}];
}
export function joinTranscript(parts:TranscriptPart[],draft:string[]){
 let out='';parts.forEach((part,i)=>{if(i&&part.prefix&&out&&!out.endsWith('\n'))out+='\n';out+=part.prefix+(draft[i]??part.text);});return out;
}
export function transcriptParagraphs(text:string){
 const out:string[]=[];
 for(const block of text.replace(/\r\n?/g,'\n').split(/\n+/).map(x=>x.trim()).filter(Boolean)){
  const sentences=block.split(/(?<=[.!?…])\s+(?=[\p{Lu}«„"—])/u);let paragraph='';
  for(const sentence of sentences){
   if(paragraph&&paragraph.length+sentence.length>460){out.push(paragraph);paragraph='';}
   if(sentence.length>700){for(const word of sentence.split(/\s+/)){if(paragraph&&paragraph.length+word.length>460){out.push(paragraph);paragraph='';}paragraph+=(paragraph?' ':'')+word;}}
   else paragraph+=(paragraph?' ':'')+sentence;
  }
  if(paragraph)out.push(paragraph);
 }
 return out;
}
