import { useRef, useState } from "react";
import { Download, FileJson, Info, Upload, X } from "lucide-react";
import { dev } from "./api";

type Scope = "prompt" | "templates" | "all";
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
  { scope: "prompt", title: "Системный промпт", description: "Инструкции для анализа встреч. Общая настройка агента." },
  { scope: "templates", title: "Шаблоны встреч", description: "Названия, поля и инструкции выбранной организации." },
  { scope: "all", title: "Всё вместе", description: "Системный промпт и шаблоны встреч одним файлом." },
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const inputs = useRef<Record<Scope, HTMLInputElement | null>>({ prompt: null, templates: null, all: null });
  const selectedOrganization = organizations.some((item) => item.id === organizationId) ? organizationId : organizations[0]?.id ?? "";

  async function exportScope(scope: Scope) {
    setError(""); setSuccess(""); setBusy(true);
    try {
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

  async function exportPromptLab() {
    setError(""); setSuccess(""); setBusy(true);
    try {
      const data = await dev<unknown>("/developer/knowledge/prompt-lab");
      saveJson(data, `stenograf-prompt-lab-${new Date().toISOString().slice(0, 10)}.json`);
      setSuccess("Декларативный пакет для Prompt Lab выгружен. Рабочая конфигурация не изменена.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось выгрузить пакет."); }
    finally { setBusy(false); }
  }

  return <section className="knowledge-transfer" aria-labelledby="knowledge-transfer-heading">
    <header className="knowledge-transfer__header">
      <span className="knowledge-transfer__eyebrow">ТЕХНИЧЕСКИЙ ДОСТУП · JSON</span>
      <h2 id="knowledge-transfer-heading">Перенос заданий</h2>
      <p>Перенесите инструкции агента и шаблоны встреч между установками.</p>
    </header>
    <div className="knowledge-transfer__panel">
      <div className="knowledge-transfer__intro">
        <div><span className="knowledge-transfer__eyebrow">ПЕРЕНОС ЗНАНИЙ · JSON</span><h3>Промпт и шаблоны для AI</h3></div>
        <details className="knowledge-transfer__info"><summary aria-label="Что входит в перенос"><Info size={16} /></summary><p>Экспорт содержит только системный промпт и поля шаблонов. Ключи, пароли, встречи, поручения и история диалогов не переносятся. Импорт добавляет или обновляет шаблоны, не удаляя остальные.</p></details>
      </div>
      {readOnlyDemo && <p className="knowledge-transfer__notice">В публичном демо-режиме перенос недоступен.</p>}
      <div className="knowledge-transfer__organization">
        <label htmlFor="knowledge-transfer-organization">Организация для шаблонов</label>
        <select id="knowledge-transfer-organization" value={selectedOrganization} onChange={(event) => { setOrganizationId(event.target.value); setPending(null); setError(""); }} disabled={busy || readOnlyDemo || organizations.length === 0}>
          {organizations.length === 0 ? <option value="">Нет рабочих организаций</option> : organizations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </div>
      <div className="knowledge-transfer__list">
        {rows.map((row) => <div className={`knowledge-transfer__row${row.scope === "all" ? " knowledge-transfer__row--all" : ""}`} key={row.scope}>
          <div className="knowledge-transfer__copy"><strong>{row.title}</strong><span>{row.description}</span></div>
          <div className="knowledge-transfer__actions">
            <button className="outline" type="button" disabled={busy || readOnlyDemo || (row.scope !== "prompt" && !selectedOrganization)} onClick={() => exportScope(row.scope)}><Download size={15} /> Выгрузить</button>
            <button className="outline" type="button" disabled={busy || readOnlyDemo || (row.scope !== "prompt" && !selectedOrganization)} onClick={() => inputs.current[row.scope]?.click()}><Upload size={15} /> Загрузить</button>
            <input ref={(element) => { inputs.current[row.scope] = element; }} className="knowledge-transfer__file" type="file" accept=".json,application/json" aria-label={`Выбрать файл: ${row.title}`} onChange={(event) => { void chooseFile(event.target.files?.[0], row.scope); event.target.value = ""; }} />
          </div>
        </div>)}
        <div className="knowledge-transfer__row knowledge-transfer__row--lab">
          <div className="knowledge-transfer__copy"><strong>Экспорт для Prompt Lab</strong><span>Промпт, контракт операции и план проверки; без материалов и секретов.</span></div>
          <div className="knowledge-transfer__actions"><button className="outline" type="button" disabled={busy || readOnlyDemo} onClick={exportPromptLab}><FileJson size={15} /> Выгрузить</button></div>
        </div>
      </div>
      {pending && <div className="knowledge-transfer__preview" role="region" aria-label="Предпросмотр импорта">
        <div className="knowledge-transfer__preview-title"><div><span className="knowledge-transfer__eyebrow">ПРЕДПРОСМОТР ИМПОРТА</span><h3>{pending.fileName}</h3></div><button className="knowledge-transfer__close" type="button" title="Отмена" aria-label="Отменить импорт" onClick={() => setPending(null)}><X size={17} /></button></div>
        <p>В файле: {pending.preview.sections.join(" и ").toLowerCase()}{pending.preview.organization ? ` · организация «${pending.preview.organization}»` : ""}.</p>
        {pending.preview.prompt && <p>Системный промпт: {pending.preview.prompt.characters} символов. Будет заменён текущий.</p>}
        {pending.preview.templates.length > 0 && <div className="knowledge-transfer__templates"><strong>Шаблоны: {pending.preview.counts.create} новых, {pending.preview.counts.update} обновятся</strong><ul>{pending.preview.templates.map((item) => <li key={item.name}>{item.name} <span>{item.action === "create" ? "Добавить" : "Обновить"}</span></li>)}</ul></div>}
        {pending.scope !== "prompt" && pending.preview.templates.length === 0 && <p>Шаблонов в файле нет; существующие шаблоны останутся на месте.</p>}
        <div className="knowledge-transfer__preview-actions"><button className="outline" type="button" disabled={busy} onClick={() => setPending(null)}>Отмена</button><button className="primary" type="button" disabled={busy || readOnlyDemo} onClick={applyImport}>{busy ? "Применяем…" : "Применить импорт"}</button></div>
      </div>}
      {error && <p className="knowledge-transfer__error" role="alert">{error}</p>}
      {success && <p className="knowledge-transfer__success" role="status">{success}</p>}
    </div>
  </section>;
}
