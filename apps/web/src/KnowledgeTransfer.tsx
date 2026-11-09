import { useRef, useState } from "react";
import { Download, Info, Upload, X, Lock } from "lucide-react";
import { dev, devResponse } from "./api";
import {developerOwnerLoginUrl} from "./workspace-access";

type Scope = "prompt" | "templates" | "processed" | "all";
type Organization = { id: string; name: string };
type Preview = {
  scope: Scope;
  sections: string[];
  organization: string | null;
  prompt: { characters: number } | null;
  templates: { name: string; action: "create" | "update" }[];
  counts: { create: number; update: number };
};

const rows: { scope: Scope; title: string; description: string }[] = [
  { scope: "prompt", title: "Системный промпт", description: "Инструкция для анализа встреч. Редактируется в консоли: «Секреты API → System prompt»." },
  { scope: "templates", title: "Шаблоны встреч", description: "Названия, поля и инструкции выбранной организации." },
  { scope: "processed", title: "Обработанные встречи", description: "Готовые встречи выбранной организации: результаты, расшифровки, поручения, комментарии и связанные файлы." },
  { scope: "all", title: "Всё вместе", description: "Все организации, встречи, пользователи, шаблоны, инструкции, настройки AI и связанные файлы агента." },
];

function saveJson(data: unknown, fileName: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function KnowledgeTransfer({ organizations, readOnlyDemo }: { organizations: Organization[]; readOnlyDemo: boolean }) {
  const [organizationId, setOrganizationId] = useState(organizations[0]?.id ?? "");
  const [pending, setPending] = useState<{ fileName: string; document: unknown; scope: Scope; organizationId?: string; preview: Preview } | null>(null);
  const [archivePassword,setArchivePassword]=useState("");
  const [archivePending,setArchivePending]=useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const inputs = useRef<Record<Scope, HTMLInputElement | null>>({ prompt: null, templates: null, processed: null, all: null });
  const selectedOrganization = organizations.some((item) => item.id === organizationId) ? organizationId : organizations[0]?.id ?? "";

  async function exportScope(scope: Scope) {
    setError(""); setSuccess(""); setBusy(true);
    try {
      if(scope==='processed'||scope==='all'){
        if(archivePassword.length<12)throw new Error('Введите пароль архива: минимум 12 символов.');
        const response=await devResponse('/developer/archive/export',{method:'POST',body:JSON.stringify({scope,organizationId:selectedOrganization,password:archivePassword})});
        const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=url;link.download=`stenograf-${scope}-${new Date().toISOString().slice(0,10)}.stenograf`;link.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
        setSuccess('Зашифрованный архив выгружен. Для загрузки на другой установке понадобится указанный пароль.');return;
      }
      const query = new URLSearchParams({ scope });
      if (scope !== "prompt") query.set("organizationId", selectedOrganization);
      const data = await dev<unknown>(`/developer/knowledge/export?${query}`);
      saveJson(data, `stenograf-${scope}-${new Date().toISOString().slice(0, 10)}.json`);
      setSuccess("Файл выгружен. Секреты и материалы встреч в него не входят.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось выгрузить файл."); }
    finally { setBusy(false); }
  }

  async function chooseFile(file: File | undefined, scope: Scope) {
    if (!file) return;
    setPending(null); setError(""); setSuccess("");
    if(archivePending){const previous=archivePending.id;setArchivePending(null);await dev('/developer/archive/preview/'+previous,{method:'DELETE'}).catch(()=>undefined);}
    if((scope==='processed'||scope==='all')&&!file.name.toLowerCase().endsWith('.json')){
      setBusy(true);
      try{
        if(archivePassword.length<12)throw new Error('Введите пароль, которым зашифрован архив.');
        if(file.size>4.25*1024**3)throw new Error('Архив превышает 4 ГБ.');
        const body=new FormData();body.append('file',file);body.append('password',archivePassword);body.append('expectedScope',scope);
        const response=await devResponse('/developer/archive/preview',{method:'POST',body});setArchivePending({...await response.json(),fileName:file.name});
      }catch(cause){setError(cause instanceof Error?cause.message:'Не удалось проверить архив.');}
      finally{setBusy(false);}return;
    }
    if(scope==='processed'){setError('Для обработанных встреч выберите файл .stenograf.');return;}
    if (file.size > 256 * 1024) { setError("Файл превышает 256 КБ."); return; }
    setBusy(true);
    try {
      let document: unknown;
      try { document = JSON.parse(await file.text()); }
      catch { throw new Error("Файл не является корректным JSON."); }
      const importOrganizationId = scope === "prompt" ? undefined : selectedOrganization;
      const preview = await dev<Preview>("/developer/knowledge/import-preview", { method: "POST", body: JSON.stringify({ document, expectedScope: scope, organizationId: importOrganizationId }) });
      setPending({ fileName: file.name, document, scope, organizationId: importOrganizationId, preview });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось проверить файл."); }
    finally { setBusy(false); }
  }

  async function applyImport() {
    if (!pending) return;
    setError(""); setSuccess(""); setBusy(true);
    try {
      await dev("/developer/knowledge/import", { method: "POST", body: JSON.stringify({ document: pending.document, expectedScope: pending.scope, organizationId: pending.organizationId }) });
      setSuccess(`Импорт применён: ${pending.preview.sections.join(" и ").toLowerCase()}.`);
      setPending(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось применить импорт."); }
    finally { setBusy(false); }
  }

  async function applyArchive(){
    if(!archivePending)return;setBusy(true);setError('');
    try{const result=await dev<any>('/developer/archive/apply',{method:'POST',body:JSON.stringify({id:archivePending.id,confirm:true})});setSuccess(`Импорт завершён: организаций — ${result.organizations}, встреч — ${result.meetings}, файлов — ${result.files}. Обновите рабочее пространство, чтобы увидеть импортированные копии.`);setArchivePending(null);setArchivePassword('');}
    catch(cause){setError(cause instanceof Error?cause.message:'Не удалось применить импорт.');setArchivePending(null);}
    finally{setBusy(false);}
  }
  async function cancelArchive(){
    if(archivePending)await dev('/developer/archive/preview/'+archivePending.id,{method:'DELETE'}).catch(()=>undefined);setArchivePending(null);
  }

  return <section className="knowledge-transfer" aria-labelledby="knowledge-transfer-heading">
    <header className="knowledge-transfer__header">
      <span className="knowledge-transfer__eyebrow">ДОСТУП ВЛАДЕЛЬЦА · ПЕРЕНОС ДАННЫХ</span>
      <h2 id="knowledge-transfer-heading">Перенос данных</h2>
      <p>Сохраните обработанные встречи или перенесите данные агента на другую установку.</p>
    </header>
    <div className="knowledge-transfer__panel">
      <div className="knowledge-transfer__intro">
        <div><span className="knowledge-transfer__eyebrow">JSON · ЗАШИФРОВАННЫЕ АРХИВЫ</span><h3>Настройки, встречи и материалы</h3></div>
        <details className="knowledge-transfer__info"><summary aria-label="Что входит в перенос"><Info size={16} /></summary><p>Промпт и шаблоны доступны отдельными JSON-файлами. Архивы .stenograf включают связанные материалы и шифруются паролем. Перед импортом показывается состав. Организации и встречи создаются как копии. SSH-профили, активные сессии, доступ владельца и настройки безопасности целевой установки сохраняются. Импортированные облачные папки будут на паузе.</p></details>
      </div>
      {readOnlyDemo && <p className="knowledge-transfer__notice">Выгрузка и загрузка доступны только после рабочего входа владельца.</p>}
      <div className="knowledge-transfer__organization">
        <label htmlFor="knowledge-transfer-organization">Организация для шаблонов и обработанных встреч</label>
        <select id="knowledge-transfer-organization" value={selectedOrganization} onChange={(event) => { setOrganizationId(event.target.value); setPending(null); setError(""); }} disabled={busy || readOnlyDemo || organizations.length === 0}>
          {organizations.length === 0 ? <option value="">Нет рабочих организаций</option> : organizations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </div>
      {!readOnlyDemo&&<label className="archive-password"><span><Lock size={15}/> Пароль архива</span><input type="password" autoComplete="off" minLength={12} maxLength={256} value={archivePassword} onChange={e=>setArchivePassword(e.target.value)} placeholder="Минимум 12 символов" disabled={busy}/><small>Отдельный пароль для этого файла, не пароль аккаунта. Нужен для архивов встреч и «Всё вместе»; запомните его для переноса.</small></label>}
      {readOnlyDemo&&<p><a href={developerOwnerLoginUrl()}>Войти владельцу по email и паролю</a></p>}
      <div className="knowledge-transfer__list">
        {rows.map((row) => <div className={`knowledge-transfer__row${row.scope === "all" ? " knowledge-transfer__row--all" : ""}`} key={row.scope}>
          <div className="knowledge-transfer__copy"><strong>{row.title}</strong><span>{row.description}</span></div>
          <div className="knowledge-transfer__actions">
            <button className="outline" type="button" disabled={busy || readOnlyDemo || (["templates","processed"].includes(row.scope) && !selectedOrganization)} onClick={() => exportScope(row.scope)}><Download size={15} /> Выгрузить</button>
            <button className="outline" type="button" disabled={busy || readOnlyDemo || (["templates","processed"].includes(row.scope) && !selectedOrganization)} onClick={() => inputs.current[row.scope]?.click()}><Upload size={15} /> Загрузить</button>
            <input ref={(element) => { inputs.current[row.scope] = element; }} className="knowledge-transfer__file" type="file" accept={row.scope==='processed'?'.stenograf':row.scope==='all'?'.stenograf,.json':'.json,application/json'} aria-label={`Выбрать файл: ${row.title}`} onChange={(event) => { void chooseFile(event.target.files?.[0], row.scope); event.target.value = ""; }} />
          </div>
        </div>)}
      </div>
      {pending && <div className="knowledge-transfer__preview" role="region" aria-label="Предпросмотр импорта">
        <div className="knowledge-transfer__preview-title"><div><span className="knowledge-transfer__eyebrow">ПРЕДПРОСМОТР ИМПОРТА</span><h3>{pending.fileName}</h3></div><button className="knowledge-transfer__close" type="button" title="Отмена" aria-label="Отменить импорт" onClick={() => setPending(null)}><X size={17} /></button></div>
        <p>В файле: {pending.preview.sections.join(" и ").toLowerCase()}{pending.preview.organization ? ` · организация «${pending.preview.organization}»` : ""}.</p>
        {pending.preview.prompt && <p>Системный промпт: {pending.preview.prompt.characters} символов. Будет заменён текущий.</p>}
        {pending.preview.templates.length > 0 && <div className="knowledge-transfer__templates"><strong>Шаблоны: {pending.preview.counts.create} новых, {pending.preview.counts.update} обновятся</strong><ul>{pending.preview.templates.map((item) => <li key={item.name}>{item.name} <span>{item.action === "create" ? "Добавить" : "Обновить"}</span></li>)}</ul></div>}
        {pending.scope !== "prompt" && pending.preview.templates.length === 0 && <p>Шаблонов в файле нет; существующие шаблоны останутся на месте.</p>}
        <div className="knowledge-transfer__preview-actions"><button className="outline" type="button" disabled={busy} onClick={() => setPending(null)}>Отмена</button><button className="primary" type="button" disabled={busy || readOnlyDemo} onClick={applyImport}>{busy ? "Применяем…" : "Применить импорт"}</button></div>
      </div>}
      {archivePending&&<div className="knowledge-transfer__preview" role="region" aria-label="Предпросмотр архива">
        <h3>{archivePending.fileName}</h3><p>{archivePending.notice}</p>
        <p>Организаций: {archivePending.organizations.length} · встреч: {archivePending.meetings} · поручений: {archivePending.tasks} · файлов: {archivePending.files} ({(archivePending.bytes/1024**2).toFixed(1)} МБ).</p>
        <p>Организации: {archivePending.organizations.join(', ')||'нет'}.</p>
        {archivePending.settings.length>0&&<p>Будут обновлены настройки AI: {archivePending.settings.join(', ')}.</p>}
        {archivePending.missing>0&&<p className="error">Исходных файлов уже нет на исходной установке: {archivePending.missing}. Их содержимое восстановить из этого архива нельзя.</p>}
        <div className="knowledge-transfer__preview-actions"><button className="outline" disabled={busy} onClick={()=>void cancelArchive()}>Отмена</button><button className="primary" disabled={busy||readOnlyDemo} onClick={()=>void applyArchive()}>{busy?'Импортируем…':'Применить импорт архива'}</button></div>
      </div>}
      {busy&&<p role="status">Обрабатываем файл. Большой архив может занять несколько минут…</p>}
      {error && <p className="knowledge-transfer__error" role="alert">{error}</p>}
      {success && <p className="knowledge-transfer__success" role="status">{success}</p>}
    </div>
  </section>;
}
