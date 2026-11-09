import {useEffect,useRef} from 'react';
import {X} from 'lucide-react';

export default function WorkspaceSignInDialog({onCancel,onConfirm}:{onCancel:()=>void;onConfirm:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const element=dialog.current!;element.showModal();return()=>element.close();},[]);
  return <dialog ref={dialog} className="workspace-signin-dialog" aria-labelledby="workspace-signin-title" aria-describedby="workspace-signin-description"
    onCancel={event=>{event.preventDefault();onCancel();}}
    onClick={event=>{if(event.target===event.currentTarget){const bounds=event.currentTarget.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)onCancel();}}}>
    <button type="button" className="modal-close" aria-label="Закрыть окно перехода" onClick={onCancel}><X size={18}/></button>
    <small>СМЕНА ПРОСТРАНСТВА</small>
    <h2 id="workspace-signin-title">Войти в рабочее пространство?</h2>
    <p id="workspace-signin-description">Вы выйдете из текущего сеанса и перейдёте на страницу входа. Введите email и пароль своего рабочего аккаунта. Пароль Dev-консоли для этого входа не подходит.</p>
    <p>Демо-пространство, встречи и настройки сохранятся. Доступ к рабочей организации определяется вашим аккаунтом.</p>
    <footer><button type="button" className="outline" autoFocus onClick={onCancel}>Отмена</button><button type="button" className="primary" onClick={onConfirm}>Перейти ко входу</button></footer>
  </dialog>;
}
