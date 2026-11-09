import {forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import {Cloud,FileText,Files,Mic,Square,Upload,Save,Play,CheckCircle2} from 'lucide-react';
import {api,API,token,demoBrowser} from './api';
import {MaterialGallery} from './CloudWorkspace';
import {OriginalFile,DeleteAction} from './MaterialActions';
import CloudStorageCheck from './CloudStorageCheck';
import {useVoiceInput,transcribeVoice,VoiceMeter} from './VoiceInput';
import {appendDictation} from './voice-dictation';
import './meeting-materials.css';
export type MeetingMaterialsHandle={save:()=>Promise<void>};
const modes=[['text','Заметки',FileText],['files','Файлы и запись',Files],['link','Ссылка на файл в облаке',Cloud],['check','Проверить облачное хранилище',Cloud]] as const;
const accepted='.mp4,.webm,.mov,.mkv,.avi,.mpeg,.mpg,.m4v,.wmv,.flv,.3gp,.ogv,.mp3,.wav,.m4a,.ogg,.aac,.flac,.opus,.wma,.aiff,.jpg,.jpeg,.png,.webp,.tif,.tiff,.txt,.md,.pdf,.docx,.rtf,.csv,.xlsx,.pptx';
export default forwardRef<MeetingMaterialsHandle,{org:any;meeting:any;sources:any[];onChanged:()=>Promise<unknown>;onViewMeetings:()=>void;onTranscript:()=>void}>(function MeetingMaterials({org,meeting,sources,onChanged,onViewMeetings,onTranscript},ref){
 const draftKey='secretary-notes-draft:'+meeting.id;
 const initial=meeting.notes??(meeting.transcript?.source==='notes'?meeting.transcript.text:'')??'';
 const [mode,setMode]=useState<(typeof modes)[number][0]>('text');
 const [notes,setNotes]=useState(()=>sessionStorage.getItem(draftKey)??initial),saved=useRef(initial);
 const [files,setFiles]=useState<File[]>([]),[url,setUrl]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 const processing=meeting.state==='PROCESSING',editable=!!meeting.canEdit;
 const setDraft=(text:string)=>{setNotes(text);sessionStorage.setItem(draftKey,text);};
 const voice=useVoiceInput(meeting.id+':notes:'+mode,text=>setDraft(appendDictation(notes,text)),(blob,signal)=>transcribeVoice(meeting.id,blob,signal));
 const recording=useVoiceInput(meeting.id+':file:'+mode,()=>{},async blob=>{setFiles(current=>[...current,new File([blob],'Запись встречи '+new Date().toISOString().replace(/[:.]/g,'-')+'.webm',{type:blob.type||'audio/webm'})]);return {text:'Аудиозапись добавлена в список файлов.'};});
 const voiceActive=voice.state!=='idle'||recording.state!=='idle';
 useEffect(()=>{if(notes===saved.current){saved.current=initial;setNotes(initial);}},[initial]);
 const persistNotes=async()=>{
  if(notes===saved.current)return;
  await api(`/meetings/${meeting.id}/notes`,{method:'PUT',body:JSON.stringify({text:notes})});saved.current=notes;sessionStorage.removeItem(draftKey);await onChanged();
 };
 const choose=(items:File[])=>{const unsupported=items.filter(file=>!accepted.split(',').some(ext=>file.name.toLowerCase().endsWith(ext)));if(unsupported.length){setError('Неподдерживаемый формат: '+unsupported.map(file=>file.name).join(', '));return;}setFiles(current=>[...current,...items]);setError('');};
 const upload=async()=>{
  let done=0;
  try{for(const file of files){const form=new FormData();form.append('file',file);form.append('organizationId',org.id);form.append('meetingId',meeting.id);const response=await fetch(API+'/materials/upload',{method:'POST',headers:{Authorization:'Bearer '+token(),'x-demo-browser':demoBrowser()},body:form});const result=await response.json();if(!response.ok)throw Error(result.error||'Не удалось загрузить файл.');done++;setMessage(`Принято файлов: ${done} из ${files.length}. Обработка продолжится на сервере.`);}}finally{if(done){setFiles(current=>current.slice(done));setRevision(x=>x+1);await onChanged();}}
 };
 const perform=async(action:'save'|'analyze'|'upload'|'link')=>{
  if(busy||processing||voiceActive||!editable)return;
  setBusy(true);setError('');setMessage('');
  try{
   await persistNotes();
   if(action==='upload')await upload();
   else if(action==='link'){await api('/materials/import',{method:'POST',body:JSON.stringify({organizationId:org.id,meetingId:meeting.id,url:url.trim(),rule:'meeting'})});setUrl('');setRevision(x=>x+1);await onChanged();setMessage('Файл добавлен в эту встречу. Скачивание и обработка выполняются на сервере.');}
   else if(action==='analyze'){await api(`/meetings/${meeting.id}/retry`,{method:'POST'});await onChanged();setMessage('Материалы сохранены. Анализ запущен; статус показан в шапке встречи.');}
   else setMessage('Заметки сохранены на сервере. Анализ можно запустить отдельно.');
  }catch(e){setError(e instanceof Error?e.message:'Не удалось выполнить действие. Черновик сохранён в этой вкладке.');await onChanged();}finally{setBusy(false);}
 };
 useImperativeHandle(ref,()=>({save:()=>perform(mode==='files'&&files.length?'upload':mode==='link'&&url.trim()?'link':'save')}));
 const blocked=busy||processing||voiceActive||!editable;
 return <section className="meeting-input" aria-label="Материалы встречи">
  <header className="meeting-input__heading"><div><span className="eyebrow">МАТЕРИАЛЫ ВСТРЕЧИ</span><h2>Добавить и сохранить материалы</h2><p>Заметки, файлы и расшифровка хранятся в этой встрече. Ошибка AI не удаляет сохранённые материалы.</p></div>{notes===saved.current&&<span className="meeting-input__saved"><CheckCircle2 size={16}/>Заметки сохранены</span>}</header>
  {editable&&<>
  <div className="compose-source-switch meeting-input__tabs" role="group" aria-label="Источник материалов">{modes.map(([value,label,Icon])=><button type="button" key={value} aria-pressed={mode===value} className={mode===value?'active':''} onClick={()=>{setMode(value);setError('');setMessage('');}}><Icon size={15}/>{label}</button>)}</div>
  {mode==='text'&&<div className="meeting-input__editor"><label htmlFor={'meeting-notes-'+meeting.id}>Заметки встречи</label><textarea id={'meeting-notes-'+meeting.id} value={notes} onChange={e=>setDraft(e.target.value)} disabled={busy||processing} placeholder="Вставьте заметки, стенограмму или продиктуйте текст…"/><p className="cloud-meta">{notes!==saved.current?'Есть несохранённые изменения. Черновик остаётся в этой вкладке.':'Это сохранённый текст заметок.'} Файлы и распознанная речь сохраняются отдельно.</p><div className="cloud-actions"><button className="outline" type="button" disabled={busy||processing||voice.state==='transcribing'||!meeting.hasTranscriptionKey} onClick={()=>voice.state==='recording'?voice.stop():voice.state==='starting'?voice.cancel():voice.start()}>{voice.state==='recording'?<Square size={15}/>:<Mic size={16}/>} {voice.state==='recording'?'Остановить диктовку':voice.state==='transcribing'?'Распознаём…':'Добавить голосом'}</button>{voice.state==='recording'&&<VoiceMeter seconds={voice.seconds} level={voice.level}/>}<button className="outline" type="button" disabled={blocked||notes===saved.current} onClick={()=>void perform('save')}><Save size={15}/>Сохранить заметки</button><button className="primary" type="button" disabled={blocked||(!notes.trim()&&!meeting.canRetryFromSource)} onClick={()=>void perform('analyze')}><Play size={15}/>{busy?'Выполняем…':'Сохранить и обработать'}</button></div>{voice.error&&<p className="error" role="alert">{voice.error}</p>}</div>}
  {mode==='files'&&<div className="meeting-input__files"><label className="meeting-input__drop" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();choose(Array.from(e.dataTransfer.files));}}><Upload size={24}/><strong>Выберите файлы или перетащите сюда</strong><span>Аудио, видео, изображения и документы. Можно выбрать несколько файлов.</span><input type="file" multiple accept={accepted} disabled={busy||processing} onChange={e=>{choose(Array.from(e.target.files||[]));e.target.value='';}}/></label><div className="cloud-actions"><button className="outline" type="button" disabled={busy||processing||recording.state==='transcribing'} onClick={()=>recording.state==='recording'?recording.stop():recording.state==='starting'?recording.cancel():recording.start()}>{recording.state==='recording'?<Square size={15}/>:<Mic size={16}/>} {recording.state==='recording'?'Остановить запись':'Записать встречу с микрофона'}</button>{recording.state==='recording'&&<VoiceMeter seconds={recording.seconds} level={recording.level}/>}</div>{recording.error&&<p className="error">{recording.error}</p>}{files.length>0&&<ul className="meeting-input__pending">{files.map((file,index)=><li key={index}><span>{file.name} · {(file.size/1024/1024).toFixed(1)} МБ</span><button type="button" className="text-btn" disabled={busy} onClick={()=>setFiles(current=>current.filter((_,i)=>i!==index))}>Убрать</button></li>)}</ul>}<button className="primary" disabled={blocked||!files.length} onClick={()=>void perform('upload')}>Загрузить и обработать {files.length?`(${files.length})`:''}</button><p className="cloud-meta">Выбранные файлы попадут на сервер после нажатия кнопки. Уже загруженные файлы показаны ниже.</p></div>}
  {mode==='link'&&<div className="meeting-input__editor"><label htmlFor={'material-url-'+meeting.id}>Ссылка на конкретный файл в облаке</label><input id={'material-url-'+meeting.id} type="url" value={url} disabled={busy||processing} onChange={e=>setUrl(e.target.value)} placeholder="https://disk.yandex.ru/i/…"/><p>Файл добавится именно в эту встречу. Заметки и другие сохранённые файлы останутся на месте.</p><button className="primary" disabled={blocked||!url.trim()} onClick={()=>void perform('link')}>Добавить и обработать файл</button></div>}
  {mode==='check'&&<><p className="cloud-meta">Проверка папок создаёт или обновляет встречи по правилам из админки. Чтобы добавить конкретный файл сюда, используйте вкладку со ссылкой.</p><CloudStorageCheck orgId={org.id} onViewMeetings={onViewMeetings}/></>}
  </>}
  {processing&&<p className="meeting-input__notice" role="status">Материалы обрабатываются на сервере. Можно перейти на другую вкладку; состояние будет сохранено.</p>}{message&&<p role="status" className="meeting-input__notice">{message}</p>}{error&&<p role="alert" className="error">{error}</p>}
  <div className="meeting-input__stored"><header><div><h3>Сохранённые материалы</h3><p>Заметки: {saved.current.length} символов · Расшифровка: {meeting.transcript?.text?.length||0} символов · Файлы: {meeting.savedMaterialCount||sources.length||0}</p></div>{meeting.transcript?.text&&<button className="outline" onClick={onTranscript}>Посмотреть расшифровку</button>}</header><MaterialGallery key={meeting.id+':'+revision} orgId={org.id} meetingId={meeting.id}/>{sources.filter(s=>!(meeting.savedMaterialIds||[]).includes(s.id)).map(source=><article className="meeting-input__legacy" key={source.id}><strong>{source.name}</strong><span>{source.status==='ready'?'Распознано':source.status==='failed'?'Обработка не завершилась':source.status}</span>{source.status!=='file_deleted'&&<><OriginalFile path={`/meetings/${meeting.id}/media-sources/${source.id}/file`} name={source.name}/>{editable&&<DeleteAction path={`/meetings/${meeting.id}/media-sources/${source.id}/file`} label={'запись «'+source.name+'»'} onDone={()=>void onChanged()}/>}</>}</article>)}{!meeting.savedMaterialCount&&!sources.length&&<p className="cloud-meta">Сохранённых файлов здесь пока нет. Заметки и стенограмма показаны выше и во вкладке «Расшифровка».</p>}</div>
 </section>;
});
