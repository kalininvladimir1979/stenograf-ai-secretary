import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Mic,Square,SendHorizonal,X,RefreshCw} from 'lucide-react';
import {API,token,demoBrowser} from './api';
import {createVoiceDictation,appendDictation,type DictationState} from './voice-dictation';

export async function transcribeVoice(meetingId:string,blob:Blob,signal:AbortSignal,chat=false):Promise<{text:string}>{
 const form=new FormData();form.append('audio',blob,blob.type.includes('mp4')?'dictation.m4a':'dictation.webm');
 let r:Response;try{r=await fetch(`${API}/meetings/${meetingId}/${chat?'chat-dictation':'dictation'}`,{method:'POST',signal,headers:{'x-demo-browser':demoBrowser(),...(token()?{Authorization:'Bearer '+token()}:{})},body:form});}catch(e){if(signal.aborted)throw e;throw Error('Не удалось отправить запись. Проверьте соединение и повторите диктовку.');}
 const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.error||'Не удалось распознать запись. Повторите диктовку.');return data;
}
export function useVoiceInput(owner:string,onText:(text:string,send:boolean)=>void,transcribe:(blob:Blob,signal:AbortSignal)=>Promise<{text:string}>){
 const [state,setState]=useState<DictationState>('idle'),[seconds,setSeconds]=useState(0),[level,setLevel]=useState(0),[error,setError]=useState('');
 const client=useRef<ReturnType<typeof createVoiceDictation>|null>(null),send=useRef(false),stopping=useRef(false),currentOwner=useRef(owner),callbacks=useRef({onText,transcribe});callbacks.current={onText,transcribe};currentOwner.current=owner;
 const cancel=()=>{client.current?.cancel();client.current=null;send.current=false;stopping.current=false;};
 useEffect(()=>{setError('');setSeconds(0);return cancel;},[owner]);
 useEffect(()=>{if(state!=='recording')return;const began=Date.now();const timer=setInterval(()=>setSeconds(Math.floor((Date.now()-began)/1000)),250);return()=>clearInterval(timer);},[state]);
 const start=()=>{if(client.current)return;setError('');setSeconds(0);send.current=false;stopping.current=false;const session=createVoiceDictation({transcribe:(blob,signal)=>callbacks.current.transcribe(blob,signal),onState:s=>{setState(s);if(s==='idle')client.current=null;},onLevel:setLevel,onError:setError,onText:text=>{if(currentOwner.current===owner)callbacks.current.onText(text,send.current);}});client.current=session;void session.start();};
 const stop=(submit=false)=>{if(stopping.current)return;stopping.current=true;send.current=submit;client.current?.stop();};
 return {state,seconds,level,error,start,stop,cancel};
}
export function VoiceMeter({seconds,level}:{seconds:number;level:number}){return <span className="voice-input-meter"><span aria-label="Время записи">{String(Math.floor(seconds/60)).padStart(2,'0')}:{String(seconds%60).padStart(2,'0')}</span><span className="voice-input-meter__track" role="meter" aria-label="Уровень входного аудиосигнала" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level*100)}><i style={{height:`${Math.max(.1,level)*100}%`}}/></span></span>;}
export default function ChatComposer({meetingId,value,onChange,onSend,busy,hasKey,onNeedKey,contextKey,mode='chat',inputLabel}:{meetingId:string;value:string;onChange:(text:string)=>void;onSend:(text:string)=>Promise<unknown>;busy:boolean;hasKey:boolean;onNeedKey:()=>void;contextKey?:string;mode?:'chat'|'comment';inputLabel?:string}){
 const comment=mode==='comment',sendLabel=comment?'Отправить комментарий':'Отправить вопрос',stopSendLabel=comment?'Остановить и отправить комментарий':'Остановить и отправить в чат';
 const input=useRef<HTMLTextAreaElement>(null),draft=useRef(value);draft.current=value;
 const voice=useVoiceInput(contextKey||meetingId,(text,send)=>{const next=appendDictation(draft.current,text);onChange(next);input.current?.focus();if(send)void onSend(next);},(blob,signal)=>transcribeVoice(meetingId,blob,signal,!comment));
 useLayoutEffect(()=>{if(input.current){input.current.style.height='auto';input.current.style.height=Math.min(132,input.current.scrollHeight)+'px';}},[value]);
 const active=voice.state!=='idle';const submit=()=>{if(value.trim()&&!busy&&!active)void onSend(value);};
 return <div className={`chat-composer${comment?' chat-composer--comment':''}`} onKeyDown={e=>{if(e.key==='Escape'&&active){e.preventDefault();voice.cancel();}}}>
  <div className="ask chat-composer__row"><div className="chat-composer__field"><textarea ref={input} rows={1} aria-label={inputLabel||(comment?'Комментарий к поручению':'Вопрос о встрече')} value={value} onChange={e=>onChange(e.target.value)} placeholder={comment?'Добавить комментарий…':'Спросите о встрече…'} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();submit();}}}/>{value&&<button className="chat-composer__clear" type="button" aria-label="Очистить поле сообщения" title="Очистить поле сообщения" onClick={()=>{onChange('');input.current?.focus();}}><X size={13}/></button>}</div>
   <div className="chat-composer__controls">{voice.state==='recording'?<><VoiceMeter seconds={voice.seconds} level={voice.level}/><button className="chat-composer__mic recording" type="button" aria-label="Остановить и добавить текст в поле" title="Остановить и добавить текст в поле" onClick={()=>voice.stop()}><Square size={14} fill="currentColor"/></button><button className="chat-composer__send" type="button" aria-label={stopSendLabel} title={stopSendLabel} onClick={()=>voice.stop(true)}><SendHorizonal size={17}/></button></>:active?<button className="chat-composer__mic" type="button" aria-label="Отменить диктовку" title="Отменить диктовку" onClick={voice.cancel}><RefreshCw className="spin" size={17}/></button>:value.trim()?<button className="chat-composer__send" type="button" aria-label={sendLabel} title={sendLabel} disabled={busy} onClick={submit}><SendHorizonal size={17}/></button>:<button className="chat-composer__mic" type="button" aria-label="Голосовой ввод" title={comment?'Продиктовать комментарий':'Продиктовать сообщение'} disabled={busy} onClick={()=>hasKey?voice.start():onNeedKey()}><Mic size={18}/></button>}</div>
  </div>
  {active&&<p className="chat-composer__hint" role="status">{voice.state==='starting'?'Разрешите доступ к микрофону…':voice.state==='transcribing'?'Распознаём речь…':'Квадрат — добавить текст, стрелка — отправить.'} <button type="button" onClick={voice.cancel}>Отмена</button></p>}
  {voice.error&&<p className="chat-error" role="alert">{voice.error}</p>}
 </div>;
}
