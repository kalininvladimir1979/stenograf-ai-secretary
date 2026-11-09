import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {BookOpen,CircleHelp,FileText,FileVideo,Headphones,Link,Maximize,Minimize,Mic,Plus,RefreshCw,Square,Trash2,X} from 'lucide-react';
import {API,api,demoBrowser,token} from './api';
import {useVoiceInput,VoiceMeter} from './VoiceInput';
import {appendDictation} from './voice-dictation';
import './instructions.css';
type Instruction={id:string;title:string;text:string;kind:string;published:boolean;hasFile?:boolean;fileName?:string;size?:number;sourceUrl?:string;embedUrl?:string;previewNotice?:string;pageCount?:number};
const labels:Record<string,string>={text:'Текст',video:'Видео',audio:'Аудио',pdf:'PDF',document:'Документ',image:'Изображение',link:'Ссылка'};
const authHeaders=()=>({'x-demo-browser':demoBrowser(),Authorization:'Bearer '+token()});
function MaterialIcon({kind}:{kind:string}){const Icon=kind==='video'?FileVideo:kind==='audio'?Headphones:kind==='link'?Link:FileText;return <Icon size={17} aria-hidden="true"/>;}
function TextInstruction({orgId,value,onChange,onActivityChange}:{orgId:string;value:string;onChange:(s:string)=>void;onActivityChange:(active:boolean)=>void}){
 const draft=useRef(value);draft.current=value;
 const voice=useVoiceInput('instruction:'+orgId,text=>onChange(appendDictation(draft.current,text)),async(blob,signal)=>{const form=new FormData();form.append('audio',blob,'instruction.webm');const r=await fetch(`${API}/admin/instructions/${orgId}/dictation`,{method:'POST',body:form,headers:authHeaders(),signal});const d=await r.json();if(!r.ok)throw Error(d.error||'Не удалось распознать запись.');return d;});
 useEffect(()=>{onActivityChange(voice.state!=='idle');return()=>onActivityChange(false);},[voice.state,onActivityChange]);
 return <div className="instruction-text-editor" onKeyDown={e=>{if(e.key==='Escape'&&voice.state!=='idle'){e.preventDefault();e.stopPropagation();voice.cancel();}}}>
  <label>Текст инструкции<textarea rows={8} value={value} onChange={e=>onChange(e.target.value)} placeholder="Напишите инструкцию или продиктуйте её…"/></label>
  <div className="instruction-voice">{voice.state==='recording'?<><VoiceMeter seconds={voice.seconds} level={voice.level}/><button type="button" className="outline" onClick={()=>voice.stop()}><Square size={15}/>Остановить и добавить текст</button></>:voice.state!=='idle'?<><span role="status">{voice.state==='starting'?'Ожидаем разрешение микрофона…':'Распознаём речь…'}</span><button type="button" className="outline" onClick={voice.cancel}>Отмена</button></>:<button type="button" className="outline" onClick={voice.start}><Mic size={17}/>Надиктовать текст</button>}
  {voice.state==='recording'&&<button type="button" className="outline" onClick={voice.cancel}>Отмена записи</button>}</div>{voice.error&&<p role="alert" className="instruction-error">{voice.error}</p>}
 </div>;
}
function InstructionPreview({orgId,item}:{orgId:string;item:Instruction}){
 const [url,setUrl]=useState(''),[error,setError]=useState(''),[reload,setReload]=useState(0);
 useEffect(()=>{let alive=true;setUrl('');setError('');if(item.hasFile)api<{path:string}>(`/instructions/${orgId}/${item.id}/playback`).then(r=>{if(alive)setUrl(API+r.path);}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[orgId,item.id,item.hasFile,reload]);
 return <article className="instruction-preview" key={item.id}>
  <header><span>{labels[item.kind]||'Материал'}</span><h3>{item.title}</h3></header>
  {error&&<p role="alert">{error} <button className="outline" onClick={()=>setReload(n=>n+1)}>Повторить</button></p>}
  {item.embedUrl&&<><iframe className="instruction-embed" src={item.embedUrl} title={item.title} allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/><p className="instruction-muted">Если сервис запрещает встраивание или требует вход, откройте источник по ссылке ниже.</p></>}
  {item.hasFile&&!url&&!error&&<p role="status">Подготавливаем просмотр…</p>}
  {url&&item.kind==='video'&&<video key={url} className="instruction-video" src={url} controls preload="metadata" onError={()=>setError('Браузер не смог воспроизвести этот формат. Скачайте оригинал или загрузите видео MP4 с H.264.')}/>}
  {url&&item.kind==='audio'&&<audio key={url} src={url} controls preload="metadata" onError={()=>setError('Браузер не смог воспроизвести аудио. Скачайте оригинал или загрузите MP3.')}/>}
  {url&&item.kind==='pdf'&&!!item.pageCount&&<div className="instruction-pdf-pages">{Array.from({length:item.pageCount},(_,i)=><figure key={i}><img src={url+'&page='+i} alt={`Страница ${i+1} документа «${item.title}»`} loading="lazy"/><figcaption>Страница {i+1} из {item.pageCount}</figcaption></figure>)}</div>}
  {url&&item.kind==='image'&&<img className="instruction-image" src={url} alt={item.title}/>}
  {item.text&&<div className="instruction-prose">{item.text.split(/\n\s*\n/).map((p,i)=><p key={i}>{p}</p>)}</div>}
  {item.kind==='document'&&!item.text&&<p>Для этого формата встроенный просмотр недоступен. Скачайте файл и откройте его в подходящей программе.</p>}
  {item.previewNotice&&<p>{item.previewNotice}</p>}
  <footer>{url&&<a className="outline" href={url+'&download=1'} download={item.fileName}>Скачать {item.fileName||'файл'}</a>}{item.sourceUrl&&<a className="outline" href={item.sourceUrl} target="_blank" rel="noopener noreferrer">Открыть источник</a>}</footer>
 </article>;
}
export function InstructionsLibrary({orgId,onClose}:{orgId:string;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);const [items,setItems]=useState<Instruction[]>([]),[selected,setSelected]=useState(''),[loading,setLoading]=useState(true),[error,setError]=useState(''),[full,setFull]=useState(false),[reload,setReload]=useState(0);
 useEffect(()=>{const d=dialog.current!;d.showModal();const old=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{d.close();document.body.style.overflow=old;};},[]);
 useEffect(()=>{let active=true;setLoading(true);setError('');api<Instruction[]>(`/instructions/${orgId}`).then(x=>{if(active){setItems(x);setSelected(x[0]?.id||'');}}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[orgId,reload]);
 const item=items.find(i=>i.id===selected);
 return <dialog ref={dialog} className={`instructions-dialog${full?' instructions-dialog--full':''}`} aria-labelledby="instructions-dialog-title" onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)onClose();}}}>
  <header className="instructions-dialog__header"><div><h2 id="instructions-dialog-title">Видео и инструкции</h2><p>Посмотрите, послушайте или прочитайте материалы по работе с приложением.</p></div><div className="instructions-window-controls"><button type="button" aria-label={full?'Свернуть окно':'Развернуть окно'} aria-pressed={full} onClick={()=>setFull(!full)}>{full?<Minimize size={18}/>:<Maximize size={18}/>}</button><button type="button" aria-label="Закрыть инструкции" onClick={onClose}><X size={18}/></button></div></header>
  {loading?<p className="instructions-state" role="status">Загружаем инструкции…</p>:error?<div className="instructions-state" role="alert"><p>{error}</p><button className="outline" onClick={()=>setReload(n=>n+1)}>Повторить</button></div>:!items.length?<div className="instructions-state"><BookOpen size={28}/><h3>Инструкции пока не добавлены</h3><p>Администратор может опубликовать их в разделе «Инструкции». Подсказки на странице доступны через значок вопроса.</p></div>:<div className="instructions-dialog__body"><nav aria-label="Материалы инструкций">{items.map(i=><button key={i.id} className={i.id===selected?'active':''} aria-pressed={i.id===selected} onClick={()=>setSelected(i.id)}><MaterialIcon kind={i.kind}/><span>{i.title}<small>{labels[i.kind]}</small></span></button>)}</nav><div className="instructions-dialog__viewer">{item&&<InstructionPreview key={item.id} orgId={orgId} item={item}/>}</div></div>}
 </dialog>;
}
export default function AdminInstructions({orgId}:{orgId:string}){
 const [items,setItems]=useState<Instruction[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[mode,setMode]=useState('text'),[title,setTitle]=useState(''),[text,setText]=useState(''),[url,setUrl]=useState(''),[file,setFile]=useState<File|null>(null),[published,setPublished]=useState(true),[edit,setEdit]=useState<Instruction|null>(null),[voiceBusy,setVoiceBusy]=useState(false),[preview,setPreview]=useState<Instruction|null>(null),[removing,setRemoving]=useState<Instruction|null>(null);
 const input=useRef<HTMLInputElement>(null);const load=async()=>{setItems(await api<Instruction[]>(`/admin/instructions/${orgId}`));};
 useEffect(()=>{let active=true;setLoading(true);api<Instruction[]>(`/admin/instructions/${orgId}`).then(x=>{if(active)setItems(x);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[orgId]);
 const clear=()=>{setEdit(null);setTitle('');setText('');setUrl('');setFile(null);setPublished(true);if(input.current)input.current.value='';};
 const save=async()=>{setBusy(true);setError('');setNotice('');try{
  if(edit)await api(`/admin/instructions/${orgId}/${edit.id}`,{method:'PUT',body:JSON.stringify({title,text,published})});
  else if(mode==='file') {if(!file)throw Error('Выберите файл.');const data=new FormData();data.append('file',file);data.append('title',title||file.name);data.append('published',String(published));const r=await fetch(`${API}/admin/instructions/${orgId}/files`,{method:'POST',headers:authHeaders(),body:data});const d=await r.json();if(!r.ok)throw Error(d.error||'Загрузка не удалась.');}
  else await api(`/admin/instructions/${orgId}`,{method:'POST',body:JSON.stringify({title,text,url:mode==='link'?url:undefined,published})});
  clear();setPreview(null);await load();setNotice('Инструкция сохранена. '+(published?'Она доступна участникам через значок вопроса.':'Черновик виден только администраторам.'));
 }catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить инструкцию.');}finally{setBusy(false);}};
 return <section className="admin-instructions"><header><h2>Инструкции</h2><p>Добавляйте материалы для пользователей. Опубликованные инструкции открываются через значок вопроса в шапке приложения.</p></header>
 <section className="instruction-compose" aria-label="Редактор инструкции"><h3>{edit?'Редактирование инструкции':'Новая инструкция'}</h3>
 {!edit&&<div className="compose-source-switch" role="group" aria-label="Тип инструкции">{[['text','Текст и диктовка'],['file','Загрузить файл'],['link','Ссылка на видео или файл']].map(([key,label])=><button type="button" key={key} aria-pressed={mode===key} disabled={busy} onClick={()=>{setMode(key);setError('');}}>{label}</button>)}</div>}
 <label>Название<input value={title} maxLength={200} onChange={e=>setTitle(e.target.value)} placeholder="Например, как создать первую встречу"/></label>
 {(mode==='text'||edit)&&<TextInstruction key={edit?.id||'new'} orgId={orgId} value={text} onChange={setText} onActivityChange={setVoiceBusy}/>}
 {!edit&&mode==='file'&&<label>Видео, аудио, изображение или документ<input ref={input} type="file" onChange={e=>{const f=e.target.files?.[0]||null;setFile(f);if(f&&!title)setTitle(f.name);}}/><small>До 512 МБ. MP4, MP3, PDF и изображения открываются встроенно. Для DOCX, таблиц и презентаций показывается извлечённый текст; другие файлы доступны для скачивания.</small></label>}
 {!edit&&mode==='link'&&<label>Ссылка<input type="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…"/><small>YouTube и Google Диск — встроенный просмотр. Публичный файл Яндекс Диска или другого облака импортируется. Для закрытых файлов сначала включите доступ по ссылке либо загрузите файл с компьютера.</small></label>}
 <label className="cloud-check"><input type="checkbox" checked={published} onChange={e=>setPublished(e.target.checked)}/>Опубликовать для участников организации</label>
 <div className="cloud-actions"><button type="button" className="primary" disabled={busy||voiceBusy||(!title.trim()&&mode!=='file')} onClick={save}>{busy?<><RefreshCw size={15} className="spin"/>Сохраняем материал…</>:<><Plus size={15}/>{edit?'Сохранить изменения':'Добавить инструкцию'}</>}</button>{edit&&<button type="button" className="outline" disabled={busy} onClick={clear}>Отмена редактирования</button>}</div>
 {error&&<p className="instruction-error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
 </section>
 {loading?<p role="status">Загружаем материалы…</p>:<section className="instruction-admin-list" aria-label="Сохранённые инструкции"><h3>Материалы · {items.length}</h3>{!items.length&&<p>Добавьте первую инструкцию: текст, файл или ссылку.</p>}{items.map(i=><article key={i.id}><div><MaterialIcon kind={i.kind}/><strong>{i.title}</strong><small>{labels[i.kind]} · {i.published?'Опубликовано':'Черновик'}</small></div><div className="cloud-actions"><button className="outline" onClick={()=>setPreview(preview?.id===i.id?null:i)}>Просмотреть</button><button className="outline" disabled={busy} onClick={()=>{setEdit(i);setTitle(i.title);setText(i.text||'');setPublished(i.published);}}>Редактировать</button><button className="outline" disabled={busy} onClick={()=>setRemoving(i)} aria-label={`Удалить инструкцию ${i.title}`}><Trash2 size={15}/></button></div>{preview?.id===i.id&&<InstructionPreview orgId={orgId} item={i}/>}</article>)}</section>}
 {removing&&<DeleteInstruction title={removing.title} busy={busy} onCancel={()=>setRemoving(null)} onDelete={async()=>{setBusy(true);try{await api(`/admin/instructions/${orgId}/${removing.id}`,{method:'DELETE'});if(preview?.id===removing.id)setPreview(null);setRemoving(null);await load();}catch(e){setRemoving(null);setError(e instanceof Error?e.message:'Удаление не удалось.');}finally{setBusy(false);}}}/>}

 </section>;
}
function DeleteInstruction({title,busy,onCancel,onDelete}:{title:string;busy:boolean;onCancel:()=>void;onDelete:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);useEffect(()=>{const d=dialog.current!;d.showModal();return()=>d.close();},[]);
 return <dialog ref={dialog} className="instruction-delete" aria-labelledby="instruction-delete-title" onCancel={e=>{if(busy)e.preventDefault();else onCancel();}} onClick={e=>{if(!busy&&e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)onCancel();}}}><h3 id="instruction-delete-title">Удалить инструкцию?</h3><p>«{title}» и её файл будут удалены. Это действие нельзя отменить.</p><button className="outline" disabled={busy} onClick={onCancel}>Отмена</button><button className="primary" disabled={busy} onClick={onDelete}>{busy?'Удаляем…':'Удалить инструкцию'}</button></dialog>;
}
export function InstructionsHelp({orgId,onGuide}:{orgId?:string;onGuide:()=>void}){
 const [open,setOpen]=useState(false),[library,setLibrary]=useState(false);const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
 useEffect(()=>{if(!open)return;const outside=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false);};const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){setOpen(false);trigger.current?.focus();}};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',key);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',key);};},[open]);
 useEffect(()=>{setOpen(false);setLibrary(false);},[orgId]);
 return <div className="instructions-help" ref={root}><button ref={trigger} className="icon-action" aria-label="Помощь и инструкции" title="Помощь и инструкции" aria-expanded={open} onClick={()=>setOpen(!open)}><CircleHelp size={16}/></button>{open&&<div className="instructions-help__menu"><button disabled={!orgId} onClick={()=>{setOpen(false);setLibrary(true);}}><FileVideo size={17}/><span>Просмотреть видеоинструкции<small>Видео, аудио, документы и текст</small></span></button><button onClick={()=>{setOpen(false);onGuide();}}><BookOpen size={17}/>Показать подсказки на странице</button></div>}{library&&orgId&&createPortal(<InstructionsLibrary orgId={orgId} onClose={()=>{setLibrary(false);requestAnimationFrame(()=>trigger.current?.focus());}}/>,document.body)}</div>;
}
