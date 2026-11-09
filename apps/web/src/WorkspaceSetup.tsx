import {useState} from 'react';
import {api} from './api';
import {workspaceUrl} from './workspace-access';

export default function WorkspaceSetup({email,onCreated}:{email:string;onCreated:()=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 return <main className="login password-reset"><section className="login-panel"><div className="brand">СтеноГРАФ</div><h1>Вход выполнен</h1>
 <p>Вы вошли в рабочий аккаунт <strong>{email}</strong>. У него пока нет доступных организаций.</p>
 <form onSubmit={async event=>{event.preventDefault();const fields=new FormData(event.currentTarget);setBusy(true);setError('');try{await api('/organizations',{method:'POST',body:JSON.stringify({name:String(fields.get('organizationName')||'').trim()})});onCreated();}catch(e){setError(e instanceof Error?e.message:'Не удалось создать рабочее пространство.');}finally{setBusy(false);}}}>
 <label>Название организации<input name="organizationName" required minLength={2} maxLength={120} placeholder="Например, моя компания" disabled={busy}/></label>
 <p className="login-account-hint">Будет создано пустое рабочее пространство. Вы станете его владельцем и сможете добавить отделы, коллег и встречи.</p>
 {error&&<p className="error" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy?'Создаём…':'Создать рабочее пространство'}</button>
 </form><small>Если организация уже существует, попросите её владельца предоставить доступ вашему аккаунту.</small>
 <nav className="login-alternatives" aria-label="Смена аккаунта"><button className="text-btn" onClick={()=>{localStorage.removeItem('secretary-token');location.assign(workspaceUrl(true));}}>Выйти и войти в другой аккаунт</button></nav>
 </section></main>;
}
