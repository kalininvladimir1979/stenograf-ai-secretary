import {useEffect,useState} from 'react';
import {api} from './api';
import {workspaceUrl} from './workspace-access';

export default function LocalPasswordReset({ticket}:{ticket:string}){
 const [email,setEmail]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[done,setDone]=useState(false);
 useEffect(()=>{
  history.replaceState(null,'',workspaceUrl(true));
  api<{email:string}>('/auth/local-password-reset/inspect',{method:'POST',body:JSON.stringify({token:ticket})}).then(r=>setEmail(r.email)).catch(e=>setError(e.message));
 },[ticket]);
 return <main className="login password-reset"><section className="login-panel"><div className="brand">СтеноГРАФ</div><h1>{done?'Пароль изменён':'Новый пароль'}</h1>
 {done?<><p>Пароль локального аккаунта {email} сохранён. Организации, встречи и настройки на месте.</p><a className="primary" href={workspaceUrl(true)}>Войти в рабочее пространство</a></>:<><p>Локальный аккаунт: <strong>{email||'проверяем ссылку…'}</strong>. Эта одноразовая ссылка действует 15 минут. Изменится только пароль; рабочие данные сохранятся.</p>
 <form onSubmit={async event=>{event.preventDefault();const fields=new FormData(event.currentTarget);setError('');setBusy(true);try{await api('/auth/local-password-reset/complete',{method:'POST',body:JSON.stringify({token:ticket,password:fields.get('password'),confirmation:fields.get('confirmation')})});setDone(true);}catch(e){setError(e instanceof Error?e.message:'Не удалось сменить пароль.');}finally{setBusy(false);}}}>
 <label>Новый пароль<input name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required disabled={!email||busy}/></label>
 <label>Повторите новый пароль<input name="confirmation" type="password" autoComplete="new-password" minLength={8} maxLength={128} required disabled={!email||busy}/></label>
 <p className="login-account-hint">Не менее 8 символов. Задайте отдельный пароль для СтеноГРАФа. Пароль Яндекс-почты здесь не нужен.</p>
 {error&&<p className="error" role="alert">{error}</p>}<button className="primary" disabled={!email||busy}>{busy?'Сохраняем…':'Сохранить новый пароль'}</button></form></>}
 </section></main>;
}
