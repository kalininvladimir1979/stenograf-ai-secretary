import {useEffect,useState} from 'react';
import {RefreshCw,Cloud,ArrowUpRight} from 'lucide-react';
import {api} from './api';

export default function CloudStorageCheck({orgId,onViewMeetings}:{orgId:string;onViewMeetings:()=>void}){
 const [folders,setFolders]=useState<any[]|null>(null),[usage,setUsage]=useState<any>(null),[result,setResult]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const adminUrl=new URL(location.href);adminUrl.searchParams.set('surface','admin');adminUrl.searchParams.set('section','cloud');
 useEffect(()=>{let active=true;void api<any[]>('/cloud/folders?organizationId='+orgId).then(d=>{if(active)setFolders(d);}).catch(e=>{if(active)setError(e.message);});void api<any>('/ai/usage?organizationId='+orgId).then(d=>{if(active)setUsage(d);}).catch(()=>{});return()=>{active=false;};},[orgId]);
 const activeFolders=folders?.filter(f=>f.status==='active').length||0;
 const check=async()=>{setBusy(true);setError('');setResult(null);try{setResult(await api('/cloud/folders/check-all',{method:'POST',body:JSON.stringify({organizationId:orgId})}));void api('/ai/usage?organizationId='+orgId).then(setUsage).catch(()=>{});}catch(e:any){setError(e.message);}finally{setBusy(false);}};
 const statusNames:Record<string,string>={done:'Проверено',partial:'Есть ошибки',failed:'Ошибка проверки',paused:'На паузе',reconnect:'Требуется переподключение'};
 return <div className="cloud-storage-check">
  <div className="cloud-storage-check__intro"><Cloud size={22} aria-hidden="true"/><div><h3>Найти новые файлы в подключённых папках</h3><p>Используются папки и правила из админки: типы файлов, вложенные папки, автоанализ и режим объединения во встречи. Папки на паузе пропускаются.</p></div></div>
  {folders===null&&!error&&<p role="status">Загружаем подключённые папки…</p>}
  {folders&&<p className="cloud-storage-check__count">Подключено папок: <strong>{folders.length}</strong> · активно: <strong>{activeFolders}</strong></p>}
  {folders?.length===0&&<p>Папки ещё не добавлены. Подключите хранилище и выберите папку в админке.</p>}
  {!!folders?.length&&activeFolders===0&&<p>Активных папок нет. Возобновите проверку папки или переподключите аккаунт в админке.</p>}
  <p className="cloud-meta">Проверка наличия файлов не расходует AI-лимит. Распознавание и анализ найденных материалов учитываются по обычным правилам.{usage?.demo&&<> Осталось AI-обработок: <strong>{usage.remaining}</strong>.</>}</p>
  <div className="cloud-actions"><button type="button" className="primary" disabled={busy||!activeFolders} onClick={()=>void check()}><RefreshCw size={15} className={busy?'spin':''}/>{busy?'Проверяем облачные папки…':'Проверить сейчас'}</button><a href={adminUrl.href}>Настроить папки в админке <ArrowUpRight size={13}/></a></div>
  {busy&&<p role="status">Проверяем доступность и версии файлов. Найденные материалы попадут в серверную очередь обработки.</p>}
  {error&&<p role="alert" className="error">{error}</p>}
  {result&&<div className="cloud-storage-check__result"><h4>Результат проверки</h4><p role="status">Проверено папок: <strong>{result.summary.checked}</strong>. Всего файлов: <strong>{result.summary.total??(result.summary.new+result.summary.changed+result.summary.skipped+result.summary.pending+result.summary.errors)}</strong>. Новых файлов: <strong>{result.summary.new}</strong>, изменённых: <strong>{result.summary.changed}</strong>. В очереди: <strong>{result.summary.queued}</strong>. Пропущено: <strong>{result.summary.skipped}</strong>. Ошибок: <strong>{result.summary.errors}</strong>.</p><p className="cloud-meta">Общее число относится к успешно просмотренным папкам, включая файлы, исключённые настройками типов. Папки на паузе и недоступные папки в него не входят.</p>
   {result.summary.queued>0&&<p>Материалы обрабатываются в фоне по настройкам папок. Статус и результат появятся в соответствующих встречах.</p>}
   {result.summary.queued===0&&result.summary.checked>0&&<p>Файлов для новой обработки не найдено. Уже полученные материалы повторно не запускаются.</p>}
   {result.summary.pending>0&&<p>Ещё загружаются в облако: {result.summary.pending}. Они будут получены при следующей проверке после завершения загрузки.</p>}
   {result.results.map((r:any)=><article key={r.id}><header><strong>{r.name}</strong><span>{r.provider} · {statusNames[r.status]}</span></header>{r.stats&&<p>Всего файлов: {r.stats.total??(r.stats.new+r.stats.changed+r.stats.skipped+(r.pending||0)+r.stats.errors)} · новых: {r.stats.new} · изменённых: {r.stats.changed} · пропущено: {r.stats.skipped}{r.stats.errors?` · ошибок: ${r.stats.errors}`:''}</p>}{r.error&&<p className="error">{r.error}</p>}</article>)}
   <button type="button" className="outline" onClick={onViewMeetings}>Перейти к встречам <ArrowUpRight size={14}/></button>
  </div>}
 </div>;
}
