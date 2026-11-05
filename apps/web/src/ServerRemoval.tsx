import { useEffect, useState } from "react";
import { CheckCircle2, ChevronDown, HardDrive, RefreshCw, Server, ShieldAlert } from "lucide-react";
import { dev } from "./api";

type Profile = { id: string; name: string; environment: string; host: string; installPath: string; publicUrl: string };
type Preflight = { checkedAt: string; host: string; installPath: string; project: string; output: string; workerAvailable: false };
type DiskVolume = { totalKb: number; usedKb: number; freeKb: number; mount: string };
type Disk = { checkedAt: string; host: string; installPath: string; measuredPath: string; project: DiskVolume; dockerPath: string | null; docker: DiskVolume | null };
type RemovalStatus = { preflight: Preflight | null; diskBefore: Disk | null; diskAfter: Disk | null; workerAvailable: false };
const gib = (kb: number) => `${(kb / 1024 / 1024).toFixed(1)} ГБ`;
const delta = (kb: number) => `${kb >= 0 ? "+" : "−"}${gib(Math.abs(kb))}`;
const explainRemovalError = (reason: unknown, fallback: string) => {
  const message = reason instanceof Error ? reason.message : fallback;
  return message === "Требуется вход"
    ? "Сеанс Dev-консоли истёк. Войдите в неё с постоянным паролем и повторите проверку VPS."
    : message;
};

export default function ServerRemoval({ readOnlyDemo }: { readOnlyDemo: boolean }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileId, setProfileId] = useState("");
  const [status, setStatus] = useState<RemovalStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [diskBusy, setDiskBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    dev<Profile[]>("/developer/publication/profiles")
      .then((items) => { setProfiles(items); setProfileId((current) => current || items[0]?.id || ""); })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Не удалось получить профили публикации."));
  }, []);

  useEffect(() => {
    if (!profileId || readOnlyDemo) { setStatus(null); return; }
    setError("");
    dev<RemovalStatus>(`/developer/removal/profiles/${profileId}/status`)
      .then(setStatus)
      .catch((reason) => setError(explainRemovalError(reason, "Не удалось получить состояние проверки.")));
  }, [profileId, readOnlyDemo]);

  const selected = profiles.find((profile) => profile.id === profileId);
  const preflight = status?.preflight;
  const diskBefore = status?.diskBefore;
  const diskAfter = status?.diskAfter;
  async function inspectDisk(phase: "before" | "after") {
    if (!profileId) return;
    setDiskBusy(true);
    setError("");
    setStatus((current) => current ? { ...current, [phase === "before" ? "diskBefore" : "diskAfter"]: null } : null);
    try {
      const result = await dev<{ disk: Disk }>(`/developer/removal/profiles/${profileId}/disk`, { method: "POST", body: JSON.stringify({ phase }) });
      setStatus((current) => ({ preflight: current?.preflight || null, diskBefore: phase === "before" ? result.disk : current?.diskBefore || null, diskAfter: phase === "after" ? result.disk : current?.diskAfter || null, workerAvailable: false }));
    } catch (reason) {
      setError(explainRemovalError(reason, "Замер места не завершён."));
    } finally { setDiskBusy(false); }
  }
  async function inspect() {
    if (!profileId) return;
    setBusy(true);
    setError("");
    setStatus((current) => current ? { ...current, preflight: null } : null);
    try {
      const result = await dev<{ preflight: Preflight; workerAvailable: false }>(`/developer/removal/profiles/${profileId}/preflight`, { method: "POST" });
      setStatus((current) => ({ preflight: result.preflight, diskBefore: current?.diskBefore || null, diskAfter: current?.diskAfter || null, workerAvailable: false }));
    } catch (reason) {
      setError(explainRemovalError(reason, "Проверка VPS не завершена."));
    } finally { setBusy(false); }
  }

  return <section className="server-removal-page" aria-labelledby="server-removal-title">
    <header className="server-removal-page__header">
      <p className="eyebrow">Управление сервером</p>
      <h2 id="server-removal-title">Удаление агента с сервера</h2>
      <p>Снятие касается только выбранного профиля выпуска. Локальный проект и профиль публикации сохраняются.</p>
    </header>
    <details className="server-removal-accordion">
      <summary><span><ShieldAlert size={20} /> Удаление агента с сервера</span><ChevronDown size={18} className="server-removal-accordion__chevron" /></summary>
      <div className="server-removal-accordion__body">
        <label className="server-removal-profile">Профиль выпуска
          <select value={profileId} onChange={(event) => setProfileId(event.target.value)}>
            {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name} · {profile.environment}</option>)}
          </select>
        </label>
        {selected && <div className="server-removal-target"><Server size={17} /><span><strong>{selected.host}</strong><small>{selected.installPath} · {selected.publicUrl}</small></span></div>}
        <div className="server-removal-boundary" role="status">
          <strong>Сейчас доступен только осмотр VPS.</strong>
          <p>Кнопки «Замерить место» и «Проверить VPS» читают состояние сервера и ничего на нём не меняют. Для создания архива, снятия агента и восстановления нужен отдельный защищённый сервис управления на VPS. Он пока не установлен и не подключён к этой консоли.</p>
        </div>
        {readOnlyDemo && <p className="server-removal-notice" role="status">Демо-доступ не позволяет проверять или снимать приложение с сервера. Нужна постоянная роль владельца и пароль Dev-консоли.</p>}
        {!profiles.length && !error && <p className="server-removal-notice">Сначала создайте профиль во вкладке «Публикация».</p>}
        {error && <p className="error server-removal-error" role="alert">{error}</p>}
        <ol className="server-removal-steps">
          <li><div><strong>Замерить место до удаления</strong><p>Независимый замер разделов проекта и Docker. Работает и после снятия приложения, если доступен родительский каталог.</p></div><button type="button" className="outline" onClick={() => inspectDisk("before")} disabled={diskBusy || readOnlyDemo || !selected}>{diskBusy ? <RefreshCw size={15} className="spin" /> : <HardDrive size={15} />}{diskBusy ? "Измеряем…" : "Замерить место"}</button></li>
          <li><div><strong>Создать и скачать архив</strong><p>Шаг станет доступен после подключения отдельного сервиса. Он должен зашифровать базу, загрузки и конфигурацию, проверить архив и дать скачать его.</p></div><button type="button" className="outline" disabled>Нужен сервис</button></li>
          <li><div><strong>Сверить состав ресурсов</strong><p>Без изменений на VPS: точный путь установки, Compose-проект, контейнеры, тома и сети.</p></div><button type="button" className="outline" onClick={inspect} disabled={busy || readOnlyDemo || !selected}>{busy ? <RefreshCw size={15} className="spin" /> : <Server size={15} />}{busy ? "Проверяем…" : "Проверить VPS"}</button></li>
          <li><div><strong>Подтвердить и снять агент</strong><p>Шаг станет доступен после подключения сервиса, составления точного плана и отдельного подтверждения владельца. Нужен проверенный архив либо явный отказ от него.</p></div><button type="button" className="outline" disabled>Нужен сервис</button></li>
          <li><div><strong>Замерить место после удаления</strong><p>Повторный независимый замер на тех же разделах. Если раздел изменился, сравнение не строится.</p></div><button type="button" className="outline" onClick={() => inspectDisk("after")} disabled={diskBusy || readOnlyDemo || !selected || !diskBefore}>{diskBusy ? "Измеряем…" : "Повторить замер"}</button></li>
          <li><div><strong>Восстановить из архива</strong><p>Шаг станет доступен после подключения сервиса. Для восстановления потребуется сохранённый архив и его пароль.</p></div><button type="button" className="outline" disabled>Нужен сервис</button></li>
        </ol>
        {diskBefore && <section className="server-removal-result" aria-live="polite">
          <h3><CheckCircle2 size={17} /> Место до удаления измерено</h3>
          <p>{new Date(diskBefore.checkedAt).toLocaleString("ru-RU")} · {diskBefore.host} · {diskBefore.measuredPath}</p>
          <dl className="server-removal-disk"><div><dt>Раздел проекта <code>{diskBefore.project.mount}</code></dt><dd>Занято {gib(diskBefore.project.usedKb)} из {gib(diskBefore.project.totalKb)} · свободно {gib(diskBefore.project.freeKb)}</dd></div>
            {diskBefore.docker && <div><dt>Раздел Docker <code>{diskBefore.docker.mount}</code></dt><dd>Занято {gib(diskBefore.docker.usedKb)} из {gib(diskBefore.docker.totalKb)} · свободно {gib(diskBefore.docker.freeKb)}</dd></div>}</dl>
          {diskBefore.docker?.mount === diskBefore.project.mount && <p>Проект и Docker находятся на одном разделе; значения не складываются.</p>}
        </section>}
        {diskAfter && <section className="server-removal-result" aria-live="polite">
          <h3><CheckCircle2 size={17} /> Повторный замер выполнен</h3>
          <p>{new Date(diskAfter.checkedAt).toLocaleString("ru-RU")} · {diskAfter.host} · {diskAfter.measuredPath}</p>
          <dl className="server-removal-disk"><div><dt>Раздел проекта <code>{diskAfter.project.mount}</code></dt><dd>Занято {gib(diskAfter.project.usedKb)} из {gib(diskAfter.project.totalKb)} · свободно {gib(diskAfter.project.freeKb)}</dd></div>
            {diskAfter.docker && <div><dt>Раздел Docker <code>{diskAfter.docker.mount}</code></dt><dd>Занято {gib(diskAfter.docker.usedKb)} из {gib(diskAfter.docker.totalKb)} · свободно {gib(diskAfter.docker.freeKb)}</dd></div>}</dl>
          {diskBefore && diskBefore.project.mount === diskAfter.project.mount && <p>Свободное место на разделе проекта: до {gib(diskBefore.project.freeKb)}, после {gib(diskAfter.project.freeKb)}, изменение {delta(diskAfter.project.freeKb - diskBefore.project.freeKb)}.</p>}
          {diskBefore?.docker && diskAfter.docker && diskBefore.docker.mount === diskAfter.docker.mount && diskBefore.docker.mount !== diskBefore.project.mount && <p>Свободное место на разделе Docker: до {gib(diskBefore.docker.freeKb)}, после {gib(diskAfter.docker.freeKb)}, изменение {delta(diskAfter.docker.freeKb - diskBefore.docker.freeKb)}.</p>}
          <p className="server-removal-notice">Разница свободного места может включать изменения других сервисов. Сам по себе замер не подтверждает удаление агента.</p>
        </section>}
        {preflight && <section className="server-removal-result" aria-live="polite">
          <h3><CheckCircle2 size={17} /> Проверка VPS завершена</h3>
          <p>Проверено {new Date(preflight.checkedAt).toLocaleString("ru-RU")}. Найден Compose-проект <code>{preflight.project}</code> на хосте {preflight.host}.</p>
          <details><summary>Технический состав и данные VPS</summary><pre>{preflight.output}</pre></details>
          <p className="server-removal-notice">Это только осмотр. Правило HTTPS-прокси, архив и состав удаления ещё не подтверждены. Ничего на сервере не изменено.</p>
        </section>}
      </div>
    </details>
  </section>;
}
