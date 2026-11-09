import { lazy, Suspense, type TextareaHTMLAttributes, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  Bell,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  CircleDot,
  CircleHelp,
  Compass,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  ExternalLink,
  FileAudio,
  FileVideo,
  FileText,
  FolderKanban,
  Info,
  LayoutDashboard,
  Lock,
  Mail,
  Mic,
  Moon,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Rocket,
  Server,
  Send,
  Settings2,
  Sparkles,
  RotateCcw,
  Sun,
  Square,
  Trophy,
  Trash2,
  Users,
  Workflow,
  X,
  Type,
} from "lucide-react";
import { API, api, audio, dev, token, uploadAvatar, video, demoBrowser, sessions} from "./api";
import KnowledgeTransfer from "./KnowledgeTransfer";
import MeetingMaterials,{type MeetingMaterialsHandle} from "./MeetingMaterials";
import CloudStorageCheck from "./CloudStorageCheck";
import TranscriptView from "./TranscriptView";
import {modelCatalogOrganizations,shouldStartPublicDemo,workspaceUrl,surfaceForPath,surfaceUrl,developerOwnerLoginUrl} from "./workspace-access";
import WorkspaceSignInDialog from "./WorkspaceSignInDialog";
import LocalPasswordReset from "./LocalPasswordReset";
import WorkspaceSetup from "./WorkspaceSetup";
import AdminInstructions,{InstructionsHelp} from "./Instructions";

import ChatComposer from "./VoiceInput";
import {appendDictation} from "./voice-dictation";
import ServerRemoval from "./ServerRemoval";
import {AdminLink,Usage,ImportMaterial,CloudFolders,MainCloudConnections,DeveloperCloud,MaterialGallery,VersionPanel} from './CloudWorkspace';
import meetingsEditorial from "./assets/meetings-editorial.png";
import tasksEditorial from "./assets/tasks-editorial.png";
import momentumEditorial from "./assets/momentum-editorial.png";
import "./styles.css";

const MeetingNotes = lazy(() => import("./MeetingNotes"));

type Org = {
  id: string;
  name: string;
  departments: { id: string; name: string }[];
  taskStatuses: { id: string; name: string; key: string; position: number; transitions?: string[] }[];
  templates: {
    id: string;
    name: string;
    description: string;
    instructions: string;
    fields: string[];
  }[];
};
type Membership = {
  role: string;
  organization: Org;
  department?: { id: string; name: string };
};
type User = { id: string; name: string; email: string; phone?: string | null; jobTitle?: string | null; avatarDataUrl?: string | null };
type Meeting = {
  id: string;
  creatorId: string;
  title: string;
  state: string;
  summary?: string;
  createdAt: string;
  updatedAt: string;
  processingStartedAt?: string | null;
  processingStage?: string | null;
  sourceKind?: string;
  materialKind?: string;
  department: { id: string; name: string };
  template?: { name: string };
  tasks: any[];
};
type MeetingListView = "detailed" | "compact" | "brief" | "minimal";
const meetingListViewOptions: { value: MeetingListView; label: string; hint: string }[] = [
  { value: "detailed", label: "Подробно", hint: "До четырёх предложений" },
  { value: "compact", label: "Сжато", hint: "До двух предложений" },
  { value: "brief", label: "Кратко", hint: "Одно предложение" },
  { value: "minimal", label: "Минимально", hint: "Только главное" },
];
type CalendarView = "month" | "week" | "day" | "agenda";
type CalendarSort = "due-asc" | "due-desc" | "title" | "status";
const calendarViewOptions: { value: CalendarView; label: string; hint: string }[] = [
  { value: "month", label: "Месяц", hint: "Сетка месяца" },
  { value: "week", label: "Неделя", hint: "Сетка недели" },
  { value: "day", label: "День", hint: "Поручения на выбранный день" },
  { value: "agenda", label: "Список", hint: "Список поручений по датам" },
];
const meetingStateLabels: Record<string, string> = {
  DRAFT: "Черновик",
  PROCESSING: "Обрабатывается",
  READY: "Готово",
  FAILED: "Ошибка обработки",
};
const date = (x?: string) =>
  x
    ? new Intl.DateTimeFormat("ru-RU", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date(x))
    : "—";
const meetingPreview = (summary?: string, view: Exclude<MeetingListView, "minimal"> = "brief") => {
  const text = summary?.replace(/\s+/g, " ").trim();
  if (!text) return "Материалы ожидают обработки AI.";

  const settings = {
    detailed: { sentences: 4, limit: 520 },
    compact: { sentences: 2, limit: 320 },
    brief: { sentences: 1, limit: 180 },
  }[view];
  const sentences = text.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g)?.map((sentence) => sentence.trim()) || [text];
  const preview = sentences.slice(0, settings.sentences).join(" ");
  if (preview.length <= settings.limit) return preview;

  const boundary = preview.lastIndexOf(" ", settings.limit);
  return `${preview.slice(0, boundary > 0 ? boundary : settings.limit).trim()}…`;
};
const displayFileName = (name: string) => {
  if (!/[ÐÑ][\u0080-\u00bf]/.test(name)) return name;
  const bytes = Array.from(name, (character) => character.charCodeAt(0));
  if (bytes.some((byte) => byte > 255)) return name;
  try { return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bytes)); }
  catch { return name; }
};
const roleName: Record<string, string> = {
  OWNER: "Владелец организации",
  ADMIN: "Администратор",
  DEPARTMENT_HEAD: "Руководитель отдела",
  MEMBER: "Участник",
  GUEST: "Гость",
};
const analysisModelOptions = [
  { id: "gpt-6.1-sol", label: "GPT-6.1 Sol", note: "Баланс качества и стоимости" },
  { id: "gpt-6-luna", label: "GPT-6 Luna", note: "Экономичный для большого потока" },
  { id: "gpt-6-astra", label: "GPT-6 Astra", note: "Максимальная точность для сложных протоколов" },
  { id: "gpt-4.1-mini", label: "GPT-4.1 mini", note: "Совместимый вариант для существующих ключей" },
];
const transcriptionModelOptions = [
  { id: "gpt-transcribe", label: "GPT-Transcribe", note: "Рекомендуется: высокая точность речи" },
  { id: "whisper-1", label: "Whisper-1", note: "Совместимый вариант Whisper API" },
];
const modelSettingInfo: Record<string, { title: string; text: string }> = {
  analysis_model: {
    title: "Модель анализа",
    text: "Формирует резюме, решения, поручения и ответы по материалам встречи. Используется как системное значение по умолчанию; организация может переопределить его в админ-панели.",
  },
  whisper_model: {
    title: "Модель расшифровки",
    text: "Преобразует загруженный аудиофайл в текст до анализа. В списке — только модели, поддерживаемые текущей реализацией /audio/transcriptions.",
  },
};
function ChoiceMenu({
  value,
  options,
  onChange,
  label,
  className = "",
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  label: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) || options[0];
  return (
    <div className={`choice-menu ${className}`}>
      <button
        type="button"
        className="choice-menu__trigger"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span>{selected?.label || "Выберите вариант"}</span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="choice-menu__options" role="listbox" aria-label={label}>
          {options.map((option) => (
            <button
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={option.value === value ? "selected" : ""}
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
              {option.value === value && <Check size={15} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Login({ onAuth, demoAvailable=false }: { onAuth: (token: string) => void; demoAvailable?:boolean }) {
  const [mode, setMode] = useState<"login" | "register">("login"),
    [form, setForm] = useState({
      email: "",
      password: "",
      name: "",
      organizationName: "",
    }),
    [error, setError] = useState(""),
    [passwordVisible, setPasswordVisible] = useState(false);
  const [submitting,setSubmitting]=useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if(submitting)return;
    setSubmitting(true);
    setError("");
    // Browser/password-manager autofill may not emit React's change event.
    // Read the actual controls when submitting; never trim the password.
    const submitted = new FormData(e.currentTarget as HTMLFormElement);
    const credentials = {
      ...form,
      email: String(submitted.get("email") ?? "").trim(),
      password: String(submitted.get("password") ?? ""),
      ...(mode === "register" ? {
        name: String(submitted.get("name") ?? ""),
        organizationName: String(submitted.get("organizationName") ?? ""),
      } : {}),
    };
    try {
      const r = await api<{ token: string }>(`/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify(credentials),
      });
      sessions.saveWork(r.token);
      if(new URL(location.href).searchParams.get('returnTo')==='dev'){
        sessionStorage.removeItem('secretary-dev-password');
        window.location.assign(surfaceUrl('dev'));
        return;
      }
      const url=new URL(location.href);url.searchParams.delete("login");history.replaceState(null,"",url);
      onAuth(r.token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally { setSubmitting(false); }
  };
  return (
    <main className="login">
      <div className="login-panel">
        <div className="brand">
          СтеноГРАФ
        </div>
        <span className="login-eyebrow">Умный протокол встречи</span>
        <h1>
          {mode === "login"
            ? "Встречи превращаются в решения."
            : "Создайте рабочее пространство."}
        </h1>
        <p>
          AI-секретарь фиксирует сказанное, не добавляя ни одного факта от себя.
        </p>
        <form onSubmit={submit}>
          <label>
            Email
            <input
              type="email"
              name="email"
              required
              autoComplete="username"
              value={form.email}
              onChange={(e) => {
                setError("");
                setForm({ ...form, email: e.target.value });
              }}
            />
          </label>
          <label>
            Пароль
            <span className="login-password-input">
              <input
                type={passwordVisible ? "text" : "password"}
                name="password"
                required
                value={form.password}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                onChange={(e) => {
                  setError("");
                  setForm({ ...form, password: e.target.value });
                }}
              />
              {form.password && (
                <button
                  type="button"
                  className="login-password-action login-password-action--clear"
                  aria-label="Очистить пароль"
                  title="Очистить пароль"
                  onClick={() => setForm({ ...form, password: "" })}
                ><X size={15} /></button>
              )}
              <button
                type="button"
                className="login-password-action"
                aria-label={passwordVisible ? "Скрыть пароль" : "Показать пароль"}
                title={passwordVisible ? "Скрыть пароль" : "Показать пароль"}
                onClick={() => setPasswordVisible(!passwordVisible)}
              >{passwordVisible ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </span>
          </label>
          {mode === "register" && (
            <>
              <label>
                Ваше имя
                <input
                  name="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label>
                Организация
                <input
                  name="organizationName"
                  value={form.organizationName}
                  onChange={(e) =>
                    setForm({ ...form, organizationName: e.target.value })
                  }
                />
              </label>
            </>
          )}{" "}
          <p className="login-account-hint">{mode === "login" ? "Введите пароль аккаунта СтеноГРАФа. Пароль почты и пароль Dev-консоли здесь не используются." : "Задайте отдельный пароль для аккаунта СтеноГРАФа."}{["localhost", "127.0.0.1"].includes(window.location.hostname) ? " Это локальная версия: её аккаунты хранятся отдельно от серверных." : " Это серверная версия: локальные аккаунты автоматически сюда не переносятся."} Если аккаунт в этой версии ещё не создан, выберите «Создать аккаунт».</p>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary" disabled={submitting}>
            {submitting ? "Проверяем…" : mode === "login" ? "Войти в пространство" : "Создать организацию"}
            <ArrowUpRight size={16} />
          </button>
        </form>
        <nav className="login-alternatives" aria-label="Другие способы входа">
        <div><span>{mode === "login" ? "Нет аккаунта?" : "Уже есть аккаунт?"}</span><button
          className="text-btn"
          type="button"
          onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
        >
          {mode === "login"
            ? "Создать аккаунт"
            : "Войти в аккаунт"}
        </button></div>
        {demoAvailable&&<a className="login-demo-link" href={workspaceUrl()}><span>Открыть моё демо-пространство</span><ArrowUpRight size={16} aria-hidden="true"/></a>}
        </nav>
        <small>{mode === "login" ? "Ваши встречи, решения и поручения — в одном пространстве." : "После регистрации вы сможете пригласить коллег в организацию."}</small>
      </div>
      <aside aria-label="О СтеноГРАФе">
        <span>01 / ВСТРЕЧА → РЕШЕНИЕ</span>
        <blockquote>
          «Умный протокол — не сокращение разговора, а договорённость, которой
          можно доверять.»
        </blockquote>
        <div className="login-aside-caption">Слова становятся ясными решениями.</div>
        <div className="grid-art">
          <i />
          <i />
          <i />
          <i />
        </div>
      </aside>
    </main>
  );
}

function Top({
  user,
  org,
  onView,
  view,
  onAdminTour,
  onSiteGuide,
  onUserUpdated,
  demoFeatures,
}: {
  user: User;
  org?: Org;
  onView: (v: string) => void;
  view: string;
  onAdminTour: () => void;
  onSiteGuide: () => void;
  onUserUpdated: (user: User) => void;
  demoFeatures: DemoFeatures;
}) {
  const [theme, setTheme] = useState(
    localStorage.getItem("secretary-theme") || "light",
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("secretary-theme", theme);
  }, [theme]);
  const [profileOpen, setProfileOpen] = useState(false),
    [noticeOpen, setNoticeOpen] = useState(false),
    [notices, setNotices] = useState<any[]>([]);
  const loadNotices = () => api<any[]>("/notifications").then(setNotices).catch(() => setNotices([]));
  useEffect(() => { loadNotices(); }, []);
  const unreadCount = notices.filter((notice) => !notice.readAt).length;
  return (
    <>
      <header className="top">
        <div className="brand">
          СтеноГРАФ
        </div>
        <nav data-tour-target="site-navigation">
          {demoFeatures.meetings && <button onClick={() => onView("meetings")}>
            <Compass size={14} />
            Встречи и протоколы
          </button>}
          {(demoFeatures.tasks || demoFeatures.calendar) && <button onClick={() => onView(demoFeatures.tasks ? "tasks" : "calendar")}>
            <CircleDot size={14} />
            Доска задач и календарь
          </button>}
        </nav>
        <div className="top-actions">
          <InstructionsHelp key={org?.id} orgId={org?.id} onGuide={view === "admin" ? onAdminTour : onSiteGuide}/>
          <button
            className="icon-action"
            aria-label={
              theme === "light"
                ? "Включить тёмную тему"
                : "Включить светлую тему"
            }
            title={theme === "light" ? "Тёмная тема" : "Светлая тема"}
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          >
            {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          {demoFeatures.notifications && <button
            className={`icon-action notice-action ${unreadCount ? "has-unread" : ""}`}
            aria-label="Уведомления"
            title="Уведомления"
            aria-expanded={noticeOpen}
            onClick={() => { setNoticeOpen(!noticeOpen); setProfileOpen(false); loadNotices(); }}
          >
            <Bell size={16} />
          </button>}
          <button className="avatar" title="Профиль и контакты" aria-label="Открыть профиль" onClick={() => { setProfileOpen(!profileOpen); setNoticeOpen(false); }} aria-expanded={profileOpen}>
            {user.avatarDataUrl ? <img src={user.avatarDataUrl} alt="" /> : user.name
              .split(" ")
              .map((x) => x[0])
              .join("")}
          </button>
          {profileOpen && <ProfilePopover user={user} onUpdated={onUserUpdated} onClose={() => setProfileOpen(false)} />}
          {noticeOpen && <NotificationsPopover items={notices} onReadAll={async () => {
            await api("/notifications/read", { method: "POST" });
            setNotices((current) => current.map((item) => ({ ...item, readAt: new Date().toISOString() })));
          }} />}
        </div>
      </header>
      <div className="context">
        <span>Текущий контур:</span>
        <b>{org?.name || "Загрузка…"}</b>
        <span>Доступ ограничен ролью и приглашениями</span>
      </div>
    </>
  );
}

function NotificationsPopover({ items, onReadAll }: { items: any[]; onReadAll: () => Promise<void> }) {
  const unread = items.filter((item) => !item.readAt);
  return <section className="notifications-popover" aria-label="Уведомления">
    <header><div><strong>Напоминания</strong><span>{unread.length ? `${unread.length} непрочитанных` : "Новых уведомлений нет"}</span></div>{unread.length > 0 && <button className="text-btn" onClick={onReadAll}>Прочитать все</button>}</header>
    {items.length ? <div className="notifications-popover__list">{items.slice(0, 6).map((item) => <article className={item.readAt ? "" : "unread"} key={item.id}><Bell size={15} /><div><b>{item.title}</b><p>{item.body}</p><time>{date(item.createdAt)}</time></div></article>)}</div> : <div className="notifications-popover__empty"><Bell size={19} /><p>Напоминаний пока нет.</p></div>}
  </section>;
}

function ProfilePopover({ user, onUpdated, onClose }: { user: User; onUpdated: (user: User) => void; onClose: () => void }) {
  const [profile, setProfile] = useState<{ user: User; stats: { meetings: number; tasks: number; organizations: number } } | null>(null);
  const [form, setForm] = useState({ name: user.name, phone: user.phone || "", jobTitle: user.jobTitle || "" });
  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const avatarInput = useRef<HTMLInputElement>(null);
  useEffect(() => { api<{ user: User; stats: { meetings: number; tasks: number; organizations: number } }>("/profile").then(setProfile); }, []);
  const save = async () => {
    setSaving(true);
    try { onUpdated(await api<User>("/profile", { method: "PUT", body: JSON.stringify(form) })); onClose(); }
    finally { setSaving(false); }
  };
  const saveAvatar = async (file: File) => {
    setAvatarBusy(true);
    setAvatarError("");
    try { onUpdated(await uploadAvatar(file) as User); }
    catch (error) { setAvatarError(error instanceof Error ? error.message : "Не удалось загрузить аватар."); }
    finally { setAvatarBusy(false); }
  };
  const removeAvatar = async () => {
    setAvatarBusy(true);
    setAvatarError("");
    try { onUpdated(await api<User>("/profile/avatar", { method: "DELETE" })); }
    catch (error) { setAvatarError(error instanceof Error ? error.message : "Не удалось убрать аватар."); }
    finally { setAvatarBusy(false); }
  };
  return <section className="profile-popover" aria-label="Профиль пользователя">
    <header><button type="button" className="profile-popover__monogram" title="Загрузить аватар" aria-label="Загрузить аватар" disabled={avatarBusy} onClick={() => avatarInput.current?.click()}>{user.avatarDataUrl ? <img src={user.avatarDataUrl} alt="" /> : user.name.split(" ").map((x) => x[0]).join("").slice(0, 2)}</button><div><strong>{user.name}</strong><span>{user.email}</span></div></header>
    <input ref={avatarInput} className="profile-popover__file-input" type="file" accept="image/*,.heic,.heif,.avif,.tif,.tiff,.bmp,.ico" onChange={(event) => { const file = event.target.files?.[0]; if (file) void saveAvatar(file); event.target.value = ""; }} />
    <div className="profile-popover__avatar-actions"><button type="button" className="outline" disabled={avatarBusy} onClick={() => avatarInput.current?.click()}>{avatarBusy ? "Загружаем…" : user.avatarDataUrl ? "Заменить аватар" : "Добавить аватар"}</button>{user.avatarDataUrl && <button type="button" className="outline" disabled={avatarBusy} onClick={removeAvatar}>Убрать</button>}</div>
    <p className="profile-popover__avatar-hint">Изображение до 20 МБ. Сервер подготовит его для профиля.</p>
    {avatarError && <p className="error" role="alert">{avatarError}</p>}
    <div className="profile-popover__stats">
      <span><b>{profile?.stats.meetings ?? "—"}</b>встреч</span>
      <span><b>{profile?.stats.tasks ?? "—"}</b>активных задач</span>
      <span><b>{profile?.stats.organizations ?? "—"}</b>организаций</span>
    </div>
    <label>Имя<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
    <label>Должность<input value={form.jobTitle} placeholder="Например, руководитель продукта" onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} /></label>
    <label>Телефон<input value={form.phone} placeholder="+7 900 000-00-00" onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
    <button className="primary" disabled={saving || form.name.trim().length < 2} onClick={save}>{saving ? "Сохраняем…" : "Сохранить"}</button>
    <button type="button" className="outline" onClick={()=>{sessions.clearActive();window.location.assign(workspaceUrl(true));}}>Выйти и войти в другой аккаунт</button>
  </section>;
}

function Sidebar({
  user,
  orgs,
  current,
  setOrg,
  departmentFilter,
  setDepartmentFilter,
  view,
  setView,
  demoFeatures,
}: {
  user: User;
  orgs: Membership[];
  current: Membership;
  setOrg: (x: Membership) => void;
  departmentFilter: string;
  setDepartmentFilter: (id: string) => void;
  view: string;
  setView: (x: string) => void;
  demoFeatures: DemoFeatures;
}) {
  return (
    <aside className="sidebar">
      <div className="person">
        <div className="monogram">
          {user.avatarDataUrl ? <img src={user.avatarDataUrl} alt="" /> : user.name
            .split(" ")
            .map((part) => part[0])
            .join("")
            .slice(0, 2)}
        </div>
        <div>
          <strong>{user.name}</strong>
          <small>{roleName[current.role]}</small>
        </div>
      </div>
      <div className="switcher">
        <span>ДОСТУПНЫЕ ОРГАНИЗАЦИИ</span>
        {orgs.length > 1 ? <select
          aria-label="Переключить организацию"
          value={current.organization.id}
          onChange={(e) =>
            setOrg(orgs.find((x) => x.organization.id === e.target.value)!)
          }
        >
          {orgs.map((x) => (
            <option key={x.organization.id} value={x.organization.id}>
              {x.organization.name}
            </option>
          ))}
        </select> : <div className="switcher__single">{current.organization.name}</div>}
      </div>
      {demoFeatures.meetings && <div className="side-section">
        <span>ОТДЕЛЫ</span>
        {current.organization.departments.map((d) => (
          <button
            className={departmentFilter === d.id ? "selected" : ""}
            key={d.id}
            onClick={() => {
              setDepartmentFilter(departmentFilter === d.id ? "" : d.id);
              setView("meetings");
            }}
          >
            {d.name}
          </button>
        ))}
      </div>}
      <div className="side-section nav">
        {demoFeatures.meetings && <button
          className={view === "meetings" ? "selected" : ""}
          onClick={() => setView("meetings")}
        >
          <LayoutDashboard />
          Все встречи
        </button>}
        {demoFeatures.tasks && <button
          data-tour-target="side-tasks"
          className={view === "tasks" ? "selected" : ""}
          onClick={() => setView("tasks")}
        >
          <FolderKanban />
          Поручения
        </button>}
        {demoFeatures.calendar && <button
          data-tour-target="side-calendar"
          className={view === "calendar" ? "selected" : ""}
          onClick={() => setView("calendar")}
        >
          <CalendarDays />
          Календарь
        </button>}
        {demoFeatures.notifications && <button
          data-tour-target="side-notifications"
          className={view === "notifications" ? "selected" : ""}
          onClick={() => setView("notifications")}
        >
          <Bell />
          Уведомления
        </button>}
      </div>
    </aside>
  );
}

function MeetingCard({
  meeting,
  view,
  onOpen,
  onTasks,
  onDelete,
  expanded = false,
  onToggle,
}: {
  meeting: Meeting;
  view: MeetingListView;
  onOpen?: () => void;
  onTasks?: () => void;
  onDelete?: () => void;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  const nextAction = meeting.state === "PROCESSING" ? null
    : meeting.state === "READY" && meeting.tasks.length > 0
      ? { label: `Поручения · ${meeting.tasks.length}`, onClick: onTasks || onOpen }
      : meeting.state === "READY"
        ? { label: "Открыть протокол", onClick: onOpen }
        : { label: "Проверить обработку", onClick: onOpen };
  if (view === "minimal") return <article className="meeting-accordion">
    <h2 className="meeting-accordion__heading">
      <button type="button" className="meeting-accordion__trigger" id={`meeting-trigger-${meeting.id}`} aria-expanded={expanded} aria-controls={`meeting-panel-${meeting.id}`} onClick={onToggle}>
        <span className="meeting-accordion__title" title={meeting.title}>{meeting.title}</span>
        {meeting.state === "PROCESSING" ? <MeetingCardProcessing startedAt={meeting.processingStartedAt || meeting.updatedAt} /> : <span className={meeting.state === "READY" ? "ready" : "pending"}>{meetingStateLabels[meeting.state] || meeting.state}</span>}
        <ChevronDown size={16} aria-hidden="true" />
      </button>
    </h2>
    <div id={`meeting-panel-${meeting.id}`} aria-labelledby={`meeting-trigger-${meeting.id}`} className="meeting-accordion__panel" hidden={!expanded}>
      <div className="card-meta">
        <span className="card-meta__department">{meeting.department.name}</span>
        <span>{date(meeting.updatedAt)}</span>
        <span>{meeting.template?.name || "Без шаблона"}</span>
        <span className="card-meta__source">{meeting.sourceKind==='folder'?'Из облачной папки':meeting.sourceKind==='link'?'Из облака по ссылке':'Загружено вручную'}<span aria-hidden="true">·</span><span>{{audio:'Аудиозапись',video:'Видеозапись',image:'Изображение',document:'Документ',collection:'Папка / проект',text:'Заметки'}[meeting.materialKind||'text']||'Материал'}</span></span>
      </div>
      <p className="meeting-accordion__preview">{meetingPreview(meeting.summary, "brief")}</p>
      {meeting.state === "PROCESSING" && meeting.processingStage && <p role="status">{meeting.processingStage}</p>}
      <div className="meeting-accordion__actions">
        {onOpen && <button type="button" className="outline" onClick={onOpen}><ArrowUpRight size={14} />Открыть встречу</button>}
        <span>Поручения: {meeting.tasks.length}</span>
        {onTasks && <button type="button" className="outline" onClick={onTasks}>К поручениям</button>}
        {onDelete && <button type="button" className="meeting-card__delete" aria-label={`Удалить встречу ${meeting.title}`} title="Удалить встречу" onClick={onDelete}><Trash2 size={15} /></button>}
      </div>
    </div>
  </article>;
  return (
    <article className={`meeting-card meeting-card--${view}${onOpen ? "" : " meeting-card--processing"}`} onClick={onOpen}>
      <div className="card-meta">
        <span className="card-meta__department">{meeting.department.name}</span>
        <span>{date(meeting.updatedAt)}</span>
        <span>{meeting.template?.name || "Без шаблона"}</span>
        <span className="card-meta__source">{meeting.sourceKind==='folder'?'Из облачной папки':meeting.sourceKind==='link'?'Из облака по ссылке':'Загружено вручную'}<span aria-hidden="true">·</span><span>{{audio:'Аудиозапись',video:'Видеозапись',image:'Изображение',document:'Документ',collection:'Папка / проект',text:'Заметки'}[meeting.materialKind||'text']||'Материал'}</span></span>
        <ArrowUpRight className="card-meta__open" size={14} aria-hidden="true" />
      </div>
      <h2>{meeting.title}</h2>
      {meeting.processingStage&&<p className="meeting-card__stage" role="status">{meeting.processingStage}</p>}
      <p className="meeting-card__preview">{meetingPreview(meeting.summary, view)}</p>
      <footer>
        <span>Решения: {meeting.summary ? "есть" : "—"}</span>
        <span>Поручения: {meeting.tasks.length}</span>
        {meeting.state === "PROCESSING" ? <MeetingCardProcessing startedAt={meeting.processingStartedAt || meeting.updatedAt} /> : <span className={meeting.state === "READY" ? "ready" : "pending"}>
          {meetingStateLabels[meeting.state] || meeting.state}
        </span>}
        {nextAction?.onClick && <button className="meeting-card__next" type="button" onClick={(event) => { event.stopPropagation(); nextAction.onClick?.(); }}><ArrowUpRight size={13} />{nextAction.label}</button>}
        {onDelete && <button className="meeting-card__delete" type="button" aria-label={`Удалить встречу ${meeting.title}`} title="Удалить встречу" onClick={(event) => { event.stopPropagation(); onDelete(); }}><Trash2 size={15} /></button>}
      </footer>
    </article>
  );
}

function CollectionViewToggle<T extends string>({ value, onChange, options, label }: { value: T; onChange: (value: T) => void; options: { value: T; label: string; hint: string }[]; label: string }) {
  return <div className="collection-view-toggle" role="group" aria-label={label}>
    {options.map((option) => <button
      key={option.value}
      type="button"
      className={value === option.value ? "active" : ""}
      aria-pressed={value === option.value}
      title={option.hint}
      onClick={() => onChange(option.value)}
    >{option.label}</button>)}
  </div>;
}

function MeetingCardProcessing({ startedAt }: { startedAt?: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <span className="meeting-card__processing" aria-label={`Обработка идёт ${processingDuration(startedAt, now)}`}>
    <RefreshCw size={12} aria-hidden="true" />
    <span>Обрабатывается · {processingDuration(startedAt, now)}</span>
  </span>;
}

function ConfirmDelete({ title, description, busy, error, onCancel, onConfirm }: {
  title: string;
  description: string;
  busy: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onCancel(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onCancel]);
  return <div className="publication-modal meeting-confirm" role="dialog" aria-modal="true" aria-labelledby="meeting-confirm-title" onClick={() => !busy && onCancel()}>
    <div onClick={(event) => event.stopPropagation()}>
      <button className="modal-close" type="button" aria-label="Закрыть" disabled={busy} onClick={onCancel}><X size={18} /></button>
      <small>ПОДТВЕРЖДЕНИЕ УДАЛЕНИЯ</small>
      <h3 id="meeting-confirm-title">{title}</h3>
      <p>{description}</p>
      {error && <p className="meeting-confirm__error" role="alert">{error}</p>}
      <footer><button className="outline" type="button" autoFocus disabled={busy} onClick={onCancel}>Отмена</button><button className="danger-button" type="button" disabled={busy} onClick={onConfirm}><Trash2 size={15} /> {busy ? "Удаляем…" : "Удалить"}</button></footer>
    </div>
  </div>;
}

function WorkspaceDeck({
  meetings,
  onCreate,
  onView,
}: {
  meetings: Meeting[];
  onCreate: () => void;
  onView: (view: string) => void;
}) {
  const ready = meetings.filter((meeting) => meeting.state === "READY").length;
  const totalTasks = meetings.reduce(
    (count, meeting) => count + meeting.tasks.length,
    0,
  );
  const clarity = meetings.length
    ? Math.round((ready / meetings.length) * 100)
    : 0;
  return (
    <section className="workspace-deck" aria-label="Быстрые действия">
      <button
        className="editorial-action wide"
        style={{ backgroundImage: `url(${meetingsEditorial})` }}
        onClick={onCreate}
      >
        <span className="editorial-shade" />
        <span className="editorial-copy">
          <span className="editorial-icon">
            <Sparkles size={16} />
          </span>
          <strong>Зафиксировать встречу</strong>
          <small>Заметки или запись → ясный протокол</small>
        </span>
        <ArrowUpRight className="editorial-arrow" size={19} />
      </button>
      <button
        className="editorial-action"
        style={{ backgroundImage: `url(${tasksEditorial})` }}
        onClick={() => onView("tasks")}
      >
        <span className="editorial-shade" />
        <span className="editorial-copy">
          <span className="editorial-icon">
            <CircleDot size={16} />
          </span>
          <strong>Собрать фокус</strong>
          <small>
            {totalTasks
              ? `${totalTasks} активных поручений`
              : "Доска ждёт первого шага"}
          </small>
        </span>
        <ArrowUpRight className="editorial-arrow" size={19} />
      </button>
      <article
        className="momentum-card"
        style={{ backgroundImage: `url(${momentumEditorial})` }}
        aria-label={`Ясность протоколов: ${clarity}%`}
      >
        <span className="editorial-shade" />
        <div className="momentum-content">
          <span className="editorial-icon">
            <Trophy size={16} />
          </span>
          <strong>Ритм ясности</strong>
          <p>
            {ready} из {meetings.length || 0} протоколов проверены
          </p>
          <div className="clarity-meter" aria-hidden="true">
            <i style={{ width: `${clarity}%` }} />
          </div>
          <small>
            {clarity === 100 && meetings.length
              ? "Отличный темп — контур синхронизирован"
              : "Каждый проверенный протокол укрепляет ритм"}
          </small>
        </div>
      </article>
    </section>
  );
}

const mediaFileKind = (file: File): "audio" | "video" | null => {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  if (["mp4", "mov", "mkv", "avi", "webm", "mpeg", "mpg", "m4v", "wmv", "flv", "ts", "mts", "m2ts", "3gp", "ogv", "vob"].includes(extension)) return "video";
  if (["mp3", "m4a", "wav", "aac", "flac", "ogg", "oga", "opus", "wma", "aiff", "aif", "amr", "caf", "alac"].includes(extension)) return "audio";
  return null;
};
const fileCountLabel = (count: number) => `${count} ${count % 10 === 1 && count % 100 !== 11 ? "файл" : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14) ? "файла" : "файлов"}`;
const meetingAttachmentKind=(file:File)=>mediaFileKind(file)||(/\.(jpe?g|png|webp|tiff?)$/i.test(file.name)?'image':/\.(txt|md|pdf|docx|rtf|csv|xlsx|pptx)$/i.test(file.name)?'document':null);

function MeetingCreate({ org, canCheckCloud, onDone, onCancel }: { org: Org; canCheckCloud:boolean; onDone: (meetingId: string, processing: boolean) => void; onCancel: () => void }) {
  const [form, setForm] = useState<{title:string;departmentId:string;templateId:string;notes:string;illustrations:boolean;source:'upload'|'link'|'sync';cloudUrl:string}>(() => ({
      title: "",
      departmentId: org.departments[0]?.id || "",
      templateId: org.templates[0]?.id || "",
      notes: "",
      illustrations:true,
      source:'upload',
      cloudUrl:sessionStorage.getItem('secretary-cloud-link')||'',
      ...JSON.parse(sessionStorage.getItem('secretary-create-draft:'+org.id)||'{}'),
    })),
    [mediaFiles, setMediaFiles] = useState<File[]>([]),
    [dragging, setDragging] = useState(false),
    [recording, setRecording] = useState(false),
    [recordingSeconds, setRecordingSeconds] = useState(0),
    [recordingLevel, setRecordingLevel] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [titleError, setTitleError] = useState(""),
    [confirmCancel, setConfirmCancel] = useState(false),
    [cancelBusy, setCancelBusy] = useState(false),
    [cancelError, setCancelError] = useState("");
  useEffect(()=>{if(!canCheckCloud&&form.source==='sync')setForm(f=>({...f,source:'upload'}));},[canCheckCloud,form.source]);
  const mediaInput = useRef<HTMLInputElement>(null);
  useEffect(()=>{sessionStorage.setItem('secretary-create-draft:'+org.id,JSON.stringify(form));},[form,org.id]);
  const titleInput = useRef<HTMLInputElement>(null);
  const createdMeetingId = useRef<string | null>(null);
  const uploadedMediaCount = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingContextRef = useRef<AudioContext | null>(null);
  const recordingFrameRef = useRef<number | null>(null);
  const stopRecordingResources = () => {
    if (recordingFrameRef.current !== null) cancelAnimationFrame(recordingFrameRef.current);
    recordingFrameRef.current = null;
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordingStreamRef.current = null;
    void recordingContextRef.current?.close(); recordingContextRef.current = null;
    setRecordingLevel(0);
  };
  useEffect(() => () => { recorderRef.current?.state === "recording" && recorderRef.current.stop(); stopRecordingResources(); }, []);
  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setRecordingSeconds((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);
  useEffect(() => {
    setForm(current => {
      const departmentId = org.departments.some(department => department.id === current.departmentId)
        ? current.departmentId : org.departments[0]?.id || "";
      const templateId = org.templates.some(template => template.id === current.templateId)
        ? current.templateId : org.templates[0]?.id || "";
      return departmentId === current.departmentId && templateId === current.templateId
        ? current : { ...current, departmentId, templateId };
    });
  }, [org]);
  useEffect(() => {
    if (!confirmCancel) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape" && !cancelBusy) setConfirmCancel(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmCancel, cancelBusy]);
  useEffect(() => {
    const preventFileNavigation = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
    };
    window.addEventListener("dragover", preventFileNavigation);
    window.addEventListener("drop", preventFileNavigation);
    return () => {
      window.removeEventListener("dragover", preventFileNavigation);
      window.removeEventListener("drop", preventFileNavigation);
    };
  }, []);
  const chooseMedia = (files: File[]) => {
    if(busy)return;
    const unsupported = files.filter((item) => !meetingAttachmentKind(item));
    if (unsupported.length) {
      setError(`Формат не поддерживается: ${unsupported.map((item) => item.name).join(", ")}. Выберите аудио, видео, изображение или документ из списка поддерживаемых форматов.`);
      return;
    }
    setMediaFiles(files);
    uploadedMediaCount.current = 0;
    setError("");
  };
  const startRecording = async () => {
    if (recording) return;
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error("Запись с микрофона недоступна в этом браузере.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStreamRef.current = stream;
      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(stream, MediaRecorder.isTypeSupported("audio/webm") ? { mimeType: "audio/webm" } : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        stopRecordingResources(); setRecording(false);
        if (chunks.length) chooseMedia([...mediaFiles, new File(chunks, `Запись встречи ${new Date().toLocaleString("ru-RU")}.webm`, { type: recorder.mimeType || "audio/webm" })]);
      };
      recorder.start(); setRecordingSeconds(0); setRecording(true); setRecordingLevel(3);
      try {
        const context = new AudioContext(); recordingContextRef.current = context;
        const analyser = context.createAnalyser(); analyser.fftSize = 512;
        context.createMediaStreamSource(stream).connect(analyser); const samples = new Uint8Array(analyser.fftSize);
        const measure = () => { analyser.getByteTimeDomainData(samples); const rms = Math.sqrt(samples.reduce((total, sample) => total + ((sample - 128) / 128) ** 2, 0) / samples.length); setRecordingLevel(Math.max(3, Math.min(100, Math.round(rms * 260)))); recordingFrameRef.current = requestAnimationFrame(measure); }; measure();
      } catch { /* Recording is still useful when the level meter is unavailable. */ }
    } catch (cause) { stopRecordingResources(); setError(cause instanceof Error ? cause.message : "Не удалось открыть микрофон."); }
  };
  const stopRecording = () => { if (recorderRef.current?.state === "recording") recorderRef.current.stop(); };
  const requestCancel = () => {
    if (busy || cancelBusy) return;
    const changed = Boolean(form.title.trim() || form.notes.trim() || form.cloudUrl.trim() || mediaFiles.length || createdMeetingId.current ||
      form.departmentId !== (org.departments[0]?.id || "") || form.templateId !== (org.templates[0]?.id || ""));
    if (changed) { setCancelError(""); setConfirmCancel(true); }
    else onCancel();
  };
  const discardDraft = async () => {
    setCancelBusy(true);
    setCancelError("");
    try {
      if (createdMeetingId.current) await api(`/meetings/${createdMeetingId.current}`, { method: "DELETE" });
      sessionStorage.removeItem('secretary-create-draft:'+org.id);
      onCancel();
    } catch (cause) {
      setCancelError(cause instanceof Error ? cause.message : "Не удалось отменить создание встречи.");
    } finally {
      setCancelBusy(false);
    }
  };
  const create = async () => {
    if (form.title.trim().length < 3) {
      setTitleError(form.title.trim() ? "Введите не менее 3 символов." : "Введите название встречи.");
      titleInput.current?.focus();
      titleInput.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setTitleError("");
    setBusy(true);
    setError("");
    try {
      if(form.source==='link'){
        if(!form.cloudUrl.trim())throw Error('Вставьте ссылку на файл в облаке');
        const result=await api<any>('/materials/import',{method:'POST',body:JSON.stringify({organizationId:org.id,departmentId:form.departmentId,templateId:form.templateId,title:form.title,notes:form.notes,illustrations:form.illustrations,url:form.cloudUrl.trim(),rule:'meeting'})});
        sessionStorage.removeItem('secretary-create-draft:'+org.id);sessionStorage.removeItem('secretary-cloud-link');
        onDone(result.meetingId,!result.duplicate);return;
      }
      if (!createdMeetingId.current) {
        const meeting = await api<any>("/meetings", {
          method: "POST",
          body: JSON.stringify({ organizationId: org.id, ...form, deferAnalysis:mediaFiles.length>0 }),
        });
        createdMeetingId.current = meeting.id;
      }
      const meetingId = createdMeetingId.current;
      if (!meetingId) throw new Error("Не удалось создать встречу.");
      for (let index = uploadedMediaCount.current; index < mediaFiles.length; index++) {
        const mediaFile = mediaFiles[index];
        if (mediaFileKind(mediaFile) === "video") await video(`/meetings/${meetingId}/video`, mediaFile);
        else if(mediaFileKind(mediaFile)==='audio')await audio(`/meetings/${meetingId}/audio`, mediaFile);
        else{const data=new FormData();data.append('file',mediaFile);data.append('organizationId',org.id);data.append('meetingId',meetingId);const r=await fetch(API+'/materials/upload',{method:'POST',headers:{Authorization:'Bearer '+token(),'x-demo-browser':demoBrowser()},body:data});const result=await r.json();if(!r.ok)throw Error(result.error||'Не удалось загрузить материал');}
        uploadedMediaCount.current = index + 1;
      }
      sessionStorage.removeItem('secretary-create-draft:'+org.id);
      onDone(meetingId, Boolean(mediaFiles.length || form.notes.trim()));
    } catch (e) {
      setError((e instanceof Error ? e.message : "Ошибка")+(form.source==='link'?' Если файл недоступен по ссылке, скачайте его и выберите «Файлы с компьютера».':''));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="compose">
      <div className="compose-heading">
        <button type="button" className="back" disabled={busy || cancelBusy} onClick={requestCancel}>← Все встречи</button>
        <h1>{form.source==='sync'?'Проверка облачного хранилища':'Новая встреча'}</h1>
        <p>
          {form.source==='sync'?'Найдите новые материалы в папках, настроенных в админке.':'Добавьте заметки, файлы с компьютера или ссылку на запись в облаке. Материалы и результаты сохранятся в одной встрече.'}
        </p>
      </div>
      {form.source!=='sync'&&<><div className="form-grid">
        <label data-tour-target="meeting-title" className={titleError ? "compose-title-invalid" : undefined}>
          Название встречи
          <input
            ref={titleInput}
            value={form.title}
            placeholder="Например, планирование Q4"
            aria-invalid={Boolean(titleError)}
            aria-describedby={titleError ? "meeting-title-error" : undefined}
            onChange={(e) => { setForm({ ...form, title: e.target.value }); if (titleError) setTitleError(""); }}
          />
          {titleError && <span id="meeting-title-error" className="compose-field-error" role="alert">{titleError}</span>}
        </label>
        <label>
          Отдел
          <select
            value={form.departmentId}
            onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
          >
            {org.departments.map((x) => (
              <option value={x.id} key={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Шаблон
          <select
            value={form.templateId}
            onChange={(e) => setForm({ ...form, templateId: e.target.value })}
          >
            {org.templates.map((x) => (
              <option value={x.id} key={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="notes">
        Заметки встречи
        <textarea
          value={form.notes}
          placeholder="Вставьте стенограмму или заметки…"
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </label>
      </>}
      <section className="compose-material-source"><h2>Материалы встречи</h2><div className="compose-source-switch" role="group" aria-label="Источник материалов"><button type="button" aria-pressed={form.source==='upload'} disabled={busy||recording||!!createdMeetingId.current} onClick={()=>setForm({...form,source:'upload'})}>Файлы с компьютера</button><button type="button" aria-pressed={form.source==='link'} disabled={busy||recording||!!createdMeetingId.current} onClick={()=>setForm({...form,source:'link'})}>Ссылка на файл в облаке</button><button type="button" aria-pressed={form.source==='sync'} title={!canCheckCloud?'Доступно владельцу и администратору':undefined} disabled={!canCheckCloud||busy||recording||!!createdMeetingId.current} onClick={()=>setForm({...form,source:'sync'})}>Проверить облачное хранилище</button></div>
      {form.source==='sync'?(canCheckCloud&&<CloudStorageCheck key={org.id} orgId={org.id} onViewMeetings={onCancel}/>):form.source==='link'?<label className="compose-cloud-link">Ссылка на видеозапись или другой файл<input type="url" value={form.cloudUrl} disabled={busy} placeholder="https://disk.yandex.ru/i/…" onChange={e=>setForm({...form,cloudUrl:e.target.value})}/><small>Укажите конкретный файл. После создания встречи скачивание, распознавание и AI-анализ запустятся автоматически. Повторная неизменённая ссылка откроет сохранённый результат.</small></label>:<>
      <input ref={mediaInput} className="media-picker-input" type="file" multiple accept="audio/*,video/*,.mp3,.m4a,.wav,.aac,.flac,.ogg,.oga,.opus,.wma,.aiff,.aif,.amr,.caf,.alac,.mp4,.mov,.mkv,.avi,.webm,.mpeg,.mpg,.m4v,.wmv,.flv,.ts,.mts,.m2ts,.3gp,.ogv,.vob,.jpg,.jpeg,.png,.webp,.tif,.tiff,.txt,.md,.pdf,.docx,.rtf,.csv,.xlsx,.pptx" onChange={(event) => { chooseMedia(Array.from(event.target.files || [])); event.target.value = ""; }} />
      <button data-tour-target="meeting-materials" type="button" className={`audio-drop media-drop${dragging ? " media-drop--dragging" : ""}`} onClick={() => mediaInput.current?.click()} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }} onDragLeave={(event) => { event.preventDefault(); if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={(event) => { event.preventDefault(); setDragging(false); chooseMedia(Array.from(event.dataTransfer.files)); }}>
        <FileAudio size={22} />
        <strong>{mediaFiles.length ? `Выбрано файлов: ${mediaFiles.length}` : "Добавить файлы встречи"}</strong>
        <span>Аудио, видео, изображения и документы. Нажмите для выбора или перетащите файлы сюда.</span>
      </button>
      <div className="meeting-recorder" role="status" data-tour-target="meeting-recording">
        <button type="button" className={`meeting-materials__dictation ${recording ? "recording" : ""}`} disabled={busy} onClick={recording ? stopRecording : startRecording} aria-label={recording ? "Остановить запись встречи" : "Записать встречу с микрофона"}>{recording ? <Square size={16} /> : <Mic size={17} />}{recording ? "Остановить запись" : "Записать встречу"}</button>
        {recording ? <><span>Идёт запись · {Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, "0")}</span><span className="meeting-materials__voice-meter" role="meter" aria-label="Уровень микрофона" aria-valuenow={recordingLevel} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${recordingLevel}%` }} /></span></> : <span>Запись автоматически станет материалом новой встречи.</span>}
      </div>
      {mediaFiles.length > 0 && <ul className="media-selection">{mediaFiles.map((item, index) => <li key={`${item.name}-${index}`}>{mediaFileKind(item) === "video" ? <FileVideo size={16} /> : mediaFileKind(item)==='audio'?<FileAudio size={16}/>:<FileText size={16}/>}<span>{item.name}</span><small>{{video:'Видео',audio:'Аудио',image:'Изображение',document:'Документ'}[meetingAttachmentKind(item)||'document']}</small></li>)}</ul>}
      {mediaFiles.some((item) => mediaFileKind(item) === "video") && <p className="local-preparation"><CheckCircle2 size={15} /> Аудио из видео извлекается локально на сервере; исходное видео в AI не передаётся.</p>}
      </>}</section>
      {form.source!=='sync'&&<><label className="cloud-check"><input type="checkbox" checked={form.illustrations} onChange={e=>setForm({...form,illustrations:e.target.checked})}/>Добавлять AI-иллюстрации, если они поясняют результат</label>
      {error && <p className="error">{error}</p>}
      {/ключ|лимит/i.test(error)&&<><AdminLink meetingId={createdMeetingId.current||undefined}/><p>Текст и параметры сохранены. После возвращения выберите локальный файл заново, если браузер его сбросит.</p></>}
      <div className="compose-actions">
        <button type="button" className="outline" disabled={busy || cancelBusy} onClick={requestCancel}>Отмена</button>
        <button
          data-tour-target="meeting-analyze"
          className="primary"
          disabled={busy || recording || (form.source==='link'?!form.cloudUrl.trim():!form.notes.trim()&&!mediaFiles.length)}
          onClick={create}
        >
          {busy ? <RefreshCw className="spin" /> : "Создать встречу и анализировать"}
          <ArrowUpRight size={16} />
        </button>
        <span>Состояние обработки появится в карточке встречи.</span>
      </div>
      </>}
      {confirmCancel && <div className="publication-modal meeting-confirm" role="dialog" aria-modal="true" aria-labelledby="discard-meeting-title" onClick={() => !cancelBusy && setConfirmCancel(false)}>
        <div onClick={(event) => event.stopPropagation()}>
          <button className="modal-close" type="button" aria-label="Закрыть" disabled={cancelBusy} onClick={() => setConfirmCancel(false)}><X size={18} /></button>
          <small>НЕСОХРАНЁННЫЙ ЧЕРНОВИК</small>
          <h3 id="discard-meeting-title">Отменить новую встречу?</h3>
          <p>Введённые заметки и выбранные файлы будут сброшены. Встреча не останется в списке.</p>
          {cancelError && <p className="meeting-confirm__error" role="alert">{cancelError}</p>}
          <footer><button className="outline" type="button" autoFocus disabled={cancelBusy} onClick={() => setConfirmCancel(false)}>Продолжить заполнение</button><button className="danger-button" type="button" disabled={cancelBusy} onClick={discardDraft}>{cancelBusy ? "Отменяем…" : "Отменить встречу"}</button></footer>
        </div>
      </div>}
    </section>
  );
}

function countLabel(count: number, one: string, few: string, many: string) {
  const form = count % 100 >= 11 && count % 100 <= 14 ? many : count % 10 === 1 ? one : count % 10 >= 2 && count % 10 <= 4 ? few : many;
  return `${count} ${form}`;
}

function ExpandingTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const measure = () => {
    const field = ref.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${field.scrollHeight}px`;
  };
  useLayoutEffect(() => {
    measure();
  }, [props.value]);
  useEffect(() => {
    const field = ref.current;
    if (!field) return;
    let width = field.clientWidth;
    const observer = new ResizeObserver(() => {
      if (field.clientWidth === width) return;
      width = field.clientWidth;
      measure();
    });
    observer.observe(field);
    return () => observer.disconnect();
  }, []);
  return <textarea {...props} ref={ref} rows={3} />;
}

function ResultAccordion({ id, title, summary, open, onToggle, children }: { id: string; title: string; summary: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  const [helpOpen,setHelpOpen]=useState(false);
  const helpDialog=useRef<HTMLDialogElement>(null);
  const help:Record<string,string>={
    'Резюме':'Краткое содержание встречи: основные темы, важные факты и общий итог. Проверьте формулировки по исходным материалам и при необходимости отредактируйте текст.',
    'Решения':'Договорённости, которые участники приняли на встрече. Здесь фиксируется, что именно согласовано. Конкретные задачи, ответственные и сроки находятся в разделе «Поручения».',
    'Риски и требуется уточнение':'Возможные проблемы, противоречия и недостающие сведения: например, неясный срок или неназначенный ответственный. Эти пункты стоит проверить и уточнить у участников.',
    'Письмо по итогам встречи':'Редактируемый черновик сообщения участникам с итогами встречи и дальнейшими действиями. Проверьте содержание перед отправкой. Автоматически письмо не отправляется.',
    'Поля шаблона':'Дополнительные сведения, предусмотренные выбранным шаблоном встречи. Состав полей зависит от её типа. Значения можно проверить и исправить вручную.',
    'Поручения':'Задачи по итогам встречи: что сделать, кто отвечает, к какому сроку и в каком состоянии находится работа. Неизвестные сроки и ответственных нужно уточнить. Поручения также доступны на доске задач и в календаре.'
  };
  useEffect(()=>{if(helpOpen){helpDialog.current?.showModal();return()=>helpDialog.current?.close();}},[helpOpen]);
  return <section className={`result-accordion ${open ? "open" : ""}`}>
    <div className="result-accordion__heading">
    <button type="button" className="result-accordion__trigger" aria-expanded={open} aria-controls={id} onClick={onToggle}>
      <span><strong>{title}</strong><small>{summary}</small></span>
      <ChevronDown size={17} aria-hidden="true" />
    </button>
    <button type="button" className="result-accordion__info" aria-label={`О разделе «${title}»`} title={`О разделе «${title}»`} aria-haspopup="dialog" aria-expanded={helpOpen} aria-controls={`${id}-help`} onClick={()=>setHelpOpen(true)}><Info size={16} aria-hidden="true"/></button>
    </div>
    <dialog ref={helpDialog} id={`${id}-help`} className="result-help-dialog" aria-labelledby={`${id}-help-title`} aria-describedby={`${id}-help-text`} onCancel={()=>setHelpOpen(false)} onClick={e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)setHelpOpen(false);}}}>
      <button type="button" className="result-help-dialog__close" aria-label="Закрыть пояснение" autoFocus onClick={()=>setHelpOpen(false)}><X size={18}/></button>
      <Info size={22} aria-hidden="true"/>
      <h3 id={`${id}-help-title`}>{title}</h3><p id={`${id}-help-text`}>{help[title]}</p>
    </dialog>
    {open && <div id={id} className="result-accordion__content">{children}</div>}
  </section>;
}

function processingDuration(startedAt?: string | null, now = Date.now()) {
  const started = startedAt ? new Date(startedAt).getTime() : NaN;
  const seconds = Number.isFinite(started) ? Math.max(0, Math.floor((now - started) / 1000)) : 0;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes ? `${minutes} мин ${String(remainder).padStart(2, "0")} сек` : `${remainder} сек`;
}

function ProcessingPanel({ kind, startedAt }: { kind: "result" | "transcript"; startedAt?: string | null }) {
  const transcription = kind === "transcript";
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <div className="result-processing" role="status" aria-live="polite">
    <div className="result-processing__icon"><RefreshCw size={30} aria-hidden="true" /></div>
    <span className="result-processing__eyebrow">{transcription ? "РАСШИФРОВКА ЗАПИСИ" : "АНАЛИЗ ВСТРЕЧИ"}</span>
    <h2>{transcription ? "Расшифровываем запись" : "Готовим протокол"}</h2>
    <p>{transcription
      ? "Преобразуем речь в текст. Расшифровка появится здесь автоматически после обработки записи."
      : "Обрабатываем материалы встречи и составляем резюме, решения и поручения. Результат появится здесь автоматически."}</p>
    <div className="result-processing__track" aria-hidden="true"><span /></div>
    <time className="result-processing__elapsed" dateTime={startedAt || undefined} aria-live="off">В обработке: {processingDuration(startedAt, now)}</time>
    <small>Можно перейти в другой раздел: обработка продолжится.</small>
  </div>;
}

function MeetingDetail({
  id,
  org,
  onBack,
  onDelete,
  tourResultSection,
}: {
  id: string;
  org: Org;
  onBack: () => void;
  onDelete: (meeting: Meeting) => void;
  tourResultSection?: "tasks";
}) {
  const readTab = (meetingId: string) => {
    const saved = sessionStorage.getItem(`secretary-meeting-tab:${meetingId}`);
    return ["result", "transcript", "notes", "materials", "sources", "invite"].includes(saved || "") ? saved! : "result";
  };
  const materialsPanelRef=useRef<MeetingMaterialsHandle>(null);
  const [m, setM] = useState<any>(null),
    [tab, setTab] = useState(() => readTab(id)),
    [message, setMessage] = useState(""),
    [chat, setChat] = useState<any[]>([]),
    [chatError, setChatError] = useState(""),
    [openResultSection, setOpenResultSection] = useState<string | null>(null),
    [people, setPeople] = useState<any[]>([]),
    [sources, setSources] = useState<any[]>([]),
    [editingTitle, setEditingTitle] = useState(false),
    [titleDraft, setTitleDraft] = useState(""),
    [retryError, setRetryError] = useState(""),
    [busy, setBusy] = useState(false);
  const changeTab=(next:string)=>{sessionStorage.setItem(`secretary-meeting-tab:${id}`,next);setTab(next);};
  const load = () =>
    api<any>(`/meetings/${id}`).then((x) => {
      setM(x);
      setChat(x.chatMessages || []);
      api<any[]>(`/organizations/${x.organizationId}/members`).then(setPeople);
      api<any[]>(`/meetings/${id}/media-sources`).then((items) =>
        setSources(items.map((item) => ({ ...item, name: displayFileName(item.name) }))),
      );
    });
  useEffect(() => {
    setTab(readTab(id));
    setOpenResultSection(null);
    load();
  }, [id]);
  useEffect(() => {
    if (!tourResultSection) return;
    setTab("result");
    setOpenResultSection(tourResultSection);
  }, [tourResultSection]);
  useEffect(() => {
    if (m?.state !== "PROCESSING") return;
    const timer = window.setInterval(() => load(), 5000);
    return () => window.clearInterval(timer);
  }, [id, m?.state]);
  if (!m) return <div className="loading">Открываем встречу…</div>;
  const save = async () => {
    if(tab==='materials'){await materialsPanelRef.current?.save();return;}
    await api(`/meetings/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        summary: m.summary,
        title: editingTitle ? titleDraft.trim() : m.title,
        decisionsText: m.decisionsText,
        risksText: m.risksText,
        followUp: m.followUp,
        analysis: m.analysis,
      }),
    });
    setEditingTitle(false);
    load();
  };
  const retry = async () => {
    setBusy(true);
    setRetryError("");
    try {
      await api(`/meetings/${id}/retry`, { method: "POST" });
      load();
    } catch (error) {
      setRetryError(error instanceof Error ? error.message : "Не удалось повторить обработку.");
    } finally {
      setBusy(false);
    }
  };
  const openOrganizationConnections = () => {
    window.location.assign(surfaceUrl('admin','integrations'));
  };
  const exportFile = async (format: "md" | "pdf") => {
    const response = await fetch(
      `${API}/meetings/${id}/export?format=${format}`,
      { headers: { Authorization: `Bearer ${token()}`, 'x-demo-browser':demoBrowser() } },
    );
    if (!response.ok) return;
    const blob = await response.blob();
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `meeting.${format}`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  };
  const regionUnavailable = /unsupported_country_region_territory|недоступен из региона/i.test(m.error || "");
  const invalidAnalysis = /invalid_type|неполный анализ|неподдерживаемом формате/.test(m.error || "");
  const updateTask = async (
    taskId: string,
    payload: Record<string, unknown>,
  ) => {
    const updated = await api<any>(`/tasks/${taskId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    setM({
      ...m,
      tasks: m.tasks.map((task: any) =>
        task.id === taskId
          ? {
              ...task,
              ...updated,
              assignee:
                people.find((person) => person.id === updated.assigneeId) ||
                task.assignee,
              status:
                org.taskStatuses.find(
                  (status) => status.id === updated.statusId,
                ) || task.status,
            }
          : task,
      ),
    });
  };
  const ask = async (override?:string) => {
    if (!(override??message).trim() || busy) return;
    setBusy(true);
    setChatError("");
    const text = (override??message).trim();
    setMessage("");
    try {
      const r = await api<{ answer: string }>(`/meetings/${id}/chat`, {
        method: "POST",
        body: JSON.stringify({ message: text }),
      });
      setChat((current) => [
        ...current,
        { role: "user", content: text },
        { role: "assistant", content: r.answer },
      ]);
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "AI-бот не смог ответить. Повторите попытку.");
      setMessage((current) => appendDictation(text,current));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="detail">
      <Usage orgId={org.id}/>
      {m.error&&/ключ/i.test(m.error)&&<AdminLink meetingId={id}/>}
      <button className="back" onClick={onBack}>
        ← Все встречи
      </button>
      <header className="detail-head detail-head--meeting">
        <div>
          <p>
            {m.department.name} · {m.template?.name}
          </p>
          {editingTitle ? (
            <label className="detail-title-edit">Название встречи
              <input value={titleDraft} maxLength={160} onChange={(event) => setTitleDraft(event.target.value)} />
            </label>
          ) : <h1>{m.title}</h1>}
        </div>
        <div className="detail-head__actions" role="group" aria-label="Действия со встречей">
          {m.canEdit && !editingTitle && <button className="outline" onClick={() => { setEditingTitle(true); setTitleDraft(m.title); }}><Pencil size={15} /> Переименовать</button>}
          {editingTitle && <button className="outline" onClick={() => setEditingTitle(false)}><X size={15} /> Отмена</button>}
          {m.canEdit && <button className="outline" onClick={() => changeTab("materials")}><Plus size={15} /> Добавить материалы</button>}
          {m.canDelete && <button className="outline detail-delete" onClick={() => onDelete(m)}><Trash2 size={15} /> Удалить встречу</button>}
          <button className="outline" onClick={() => exportFile("md")}>
            <FileText size={15} />
            Экспорт Markdown
          </button>
          <button className="outline" onClick={() => exportFile("pdf")}>
            <FileText size={15} /> PDF
          </button>
          <button className="primary" onClick={save} disabled={editingTitle && !titleDraft.trim()}>
            Сохранить изменения
          </button>
        </div>
        <div className="detail-head__status" role="status"><span className={`state ${m.state.toLowerCase()}`}>{meetingStateLabels[m.state] || m.state}</span>{m.state==='PROCESSING'&&m.processingStage&&<span>{m.processingStage}{m.processingStartedAt?` · начало ${new Date(m.processingStartedAt).toLocaleString('ru-RU')}`:''}</span>}</div>
      </header>
      {m.state === "FAILED" && (
        <div className="detail-error-panel" role="alert">
          <strong>Обработка не завершилась</strong>
          <p>{regionUnavailable ? "OpenAI отклонил расшифровку: сервис был недоступен из региона сервера. Если вы изменили маршрут обработки, повторите распознавание сохранённой аудиодорожки. Через прежний маршрут запрос снова завершится ошибкой." : invalidAnalysis ? "AI не смог сформировать результат в нужном формате. Материалы сохранены. Повторите обработку или добавьте содержательные заметки." : m.error || "Неизвестная ошибка."}</p>
          {retryError && <p>{retryError}</p>}
          {!m.hasTranscriptionKey && <p>Для расшифровки аудио нужен ключ OpenAI именно в настройках этой организации. В демо источник ключа определяется настройкой «Использовать ключ платформы» в консоли.</p>}
          {!m.canRetryFromSource && <p>В этой встрече пока нет материалов для анализа. Откройте «Материалы» и добавьте текст, файл или облачную ссылку.</p>}
          {regionUnavailable && <p>Также можно вставить готовую стенограмму во вкладке «Материалы» и обработать текст без распознавания аудио.</p>}
          <div>
            {m.canRetryFromSource && (m.hasTranscriptionKey || m.transcript?.text) && <button className="primary" onClick={retry} disabled={busy}><RefreshCw size={15} className={busy ? "spin" : ""} />{busy ? "Запускаем…" : regionUnavailable && !m.transcript?.text ? "Повторить распознавание" : "Повторить обработку"}</button>}
            {!m.hasTranscriptionKey && <button className="outline" onClick={openOrganizationConnections}>Настроить OpenAI в админ-панели</button>}
            {(regionUnavailable || !m.canRetryFromSource) && <button className="outline" onClick={() => changeTab("materials")}>{m.canRetryFromSource ? "Вставить текст встречи" : "Выбрать файл заново"}</button>}
          </div>
        </div>
      )}
      <nav className="tabs meeting-tabs" aria-label="Разделы встречи" data-tour-target="meeting-results">
        <button
          className={tab === "result" ? "active" : ""}
          aria-current={tab==='result'?'true':undefined}
          onClick={() => changeTab("result")}
        >
          <BookOpen size={15} aria-hidden="true"/>Результат
        </button>
        <button
          className={tab === "transcript" ? "active" : ""}
          aria-current={tab==='transcript'?'true':undefined}
          onClick={() => changeTab("transcript")}
        >
          <Type size={15} aria-hidden="true"/>Расшифровка
        </button>
        <button aria-current={tab==='notes'?'true':undefined} className={tab === "notes" ? "active" : ""} onClick={() => changeTab("notes")}><FileText size={15} aria-hidden="true"/>Конспект</button>
        <button aria-current={tab==='materials'?'true':undefined} className={tab === "materials" ? "active" : ""} onClick={() => changeTab("materials")}><FileAudio size={15} aria-hidden="true"/>Материалы</button>
        {sources.length > 0 && <button aria-label={`Источники (${sources.length})`} aria-current={tab==='sources'?'true':undefined} className={tab === "sources" ? "active" : ""} onClick={() => changeTab("sources")}><Workflow size={15} aria-hidden="true"/>Источники <span className="meeting-tabs__count">{sources.length}</span></button>}
        {m.canManageInvites && (
          <button
            className={tab === "invite" ? "active" : ""}
            aria-current={tab==='invite'?'true':undefined}
            onClick={() => changeTab("invite")}
          >
            <Users size={15} aria-hidden="true"/>Доступ и приглашения
          </button>
        )}
      </nav>
      {tab === "result" && (
        <div className="result-layout">
          <div className="results">
            {m.state === "PROCESSING" ? (
              <ProcessingPanel kind="result" startedAt={m.processingStartedAt || m.updatedAt} />
            ) : <>
            {m.analysis?.provider === "local-region-fallback" && <p className="meeting-materials__warning">OpenAI недоступен из региона сервера. Результат составлен локально по тексту встречи; проверьте решения, сроки и ответственных.</p>}
            <ResultAccordion id={`${id}-result-summary`} title="Резюме" summary={m.summary?.trim() ? "Краткое содержание встречи" : "Пока не заполнено"} open={openResultSection === "summary"} onToggle={() => setOpenResultSection(openResultSection === "summary" ? null : "summary")}>
              <ExpandingTextarea
                aria-label="Резюме"
                value={m.summary || ""}
                onChange={(e) => setM({ ...m, summary: e.target.value })}
              />
            </ResultAccordion>
            <ResultAccordion id={`${id}-result-decisions`} title="Решения" summary={countLabel((m.decisionsText || "").split("\n").filter((line: string) => line.trim()).length, "решение", "решения", "решений")} open={openResultSection === "decisions"} onToggle={() => setOpenResultSection(openResultSection === "decisions" ? null : "decisions")}>
              <ExpandingTextarea
                aria-label="Решения"
                value={m.decisionsText || ""}
                onChange={(e) => setM({ ...m, decisionsText: e.target.value })}
              />
            </ResultAccordion>
            <ResultAccordion id={`${id}-result-risks`} title="Риски и требуется уточнение" summary={m.risksText?.trim() ? "Вопросы для проверки" : "Пока не заполнено"} open={openResultSection === "risks"} onToggle={() => setOpenResultSection(openResultSection === "risks" ? null : "risks")}>
              <ExpandingTextarea
                aria-label="Риски и требуется уточнение"
                value={m.risksText || ""}
                onChange={(e) => setM({ ...m, risksText: e.target.value })}
              />
            </ResultAccordion>
            <ResultAccordion id={`${id}-result-follow-up`} title="Письмо по итогам встречи" summary={m.followUp?.trim() ? "Черновик для участников" : "Пока не заполнено"} open={openResultSection === "followUp"} onToggle={() => setOpenResultSection(openResultSection === "followUp" ? null : "followUp")}>
              <ExpandingTextarea
                aria-label="Follow-up письмо"
                value={m.followUp || ""}
                onChange={(e) => setM({ ...m, followUp: e.target.value })}
              />
            </ResultAccordion>
            {Object.keys(m.analysis?.customFields || {}).length > 0 && (
              <ResultAccordion id={`${id}-result-custom-fields`} title="Поля шаблона" summary={countLabel(Object.keys(m.analysis.customFields).length, "поле", "поля", "полей")} open={openResultSection === "customFields"} onToggle={() => setOpenResultSection(openResultSection === "customFields" ? null : "customFields")}>
                <div className="custom-fields">{Object.entries(m.analysis.customFields).map(
                  ([field, value]) => (
                    <label key={field}>
                      {field}
                      <ExpandingTextarea
                        value={String(value || "")}
                        placeholder="Требуется уточнение"
                        onChange={(e) =>
                          setM({
                            ...m,
                            analysis: {
                              ...m.analysis,
                              customFields: {
                                ...m.analysis.customFields,
                                [field]: e.target.value || null,
                              },
                            },
                          })
                        }
                      />
                    </label>
                  ),
                )}</div>
              </ResultAccordion>
            )}
            <ResultAccordion id={`${id}-result-tasks`} title="Поручения" summary={countLabel(m.tasks.length, "поручение", "поручения", "поручений")} open={openResultSection === "tasks"} onToggle={() => setOpenResultSection(openResultSection === "tasks" ? null : "tasks")}>
              <div className="task-list">
                {m.tasks.length === 0 && <p className="result-accordion__empty">Поручений пока нет.</p>}
                {m.tasks.map((t: any) => (
                  <TaskEditor
                    key={t.id}
                    task={t}
                    meetingId={id}
                    hasKey={!!m.hasTranscriptionKey}
                    people={people}
                    statuses={org.taskStatuses}
                    updateTask={updateTask}
                    onComment={load}
                  />
                ))}
              </div>
            </ResultAccordion>
            </>}
          </div>
          <aside className="chat">
            <div>
              <h3>Спросить о встрече</h3>
              <p>Ответы ограничены материалами этого протокола. Осталось вопросов: {Math.max(0,(m.questionsRemaining??3)-chat.filter(x=>x.role==='assistant').length+(m.chatMessages||[]).filter((x:any)=>x.role==='assistant').length)} из 3.</p>
            </div>
            <div className="messages">
              {chat.map((x, i) => (
                <p className={x.role} key={i}>
                  {x.content}
                </p>
              ))}
            </div>
            {busy && <p className="chat-status" role="status">AI изучает материалы встречи…</p>}
            {chatError && <p className="chat-error" role="alert">{chatError}</p>}
            <ChatComposer key={id+'-'+m.activeVersionId} meetingId={id} value={message} onChange={setMessage} onSend={ask} busy={busy} hasKey={!!m.hasTranscriptionKey} onNeedKey={()=>setChatError('Для голосового ввода нужен ключ OpenAI. Добавьте его в админке.')}/>
            {/ключ/i.test(chatError)&&<AdminLink meetingId={id}/>}

          </aside>
        </div>
      )}
      {tab==='result'&&<VersionPanel key={m.activeVersionId+'-'+m.processingStage} meetingId={id} reload={()=>void load()}/>}


      {tab === "transcript" && (
        m.state === "PROCESSING" && !m.transcript?.text
          ? <section className="transcript"><h2>Расшифровка</h2><ProcessingPanel kind="transcript" startedAt={m.processingStartedAt || m.updatedAt} /></section>
          : <TranscriptView key={id} title={m.title} text={m.transcript?.text} createdAt={m.createdAt} canEdit={!!m.canEdit} onSave={async text=>{await api(`/meetings/${id}/transcript`,{method:'PUT',body:JSON.stringify({text})});setM((current:any)=>current?.id===id?({...current,transcript:{...current.transcript,text}}):current);}}/>
      )}
      {tab === "notes" && <Suspense fallback={<p role="status">Открываем конспект…</p>}><MeetingNotes key={id} meetingId={id} revision={m.updatedAt}/></Suspense>}
      {tab === 'materials' && <MeetingMaterials ref={materialsPanelRef} key={id} org={org} meeting={m} sources={sources} onChanged={load} onViewMeetings={onBack} onTranscript={()=>changeTab('transcript')}/>}
      {tab === "sources" && <section className="media-sources"><h3>Источники и синхронизация</h3><p>Каждый канал расшифрован отдельно. Сдвиг используется при сборке общей стенограммы.</p>{sources.map((source) => <article key={source.id}><label>Название источника<input value={displayFileName(source.name)} onChange={(event) => setSources(sources.map((item) => item.id === source.id ? { ...item, name: event.target.value } : item))} /></label><label>Сдвиг, секунды<input type="number" step="0.1" value={source.offsetMs / 1000} onChange={(event) => setSources(sources.map((item) => item.id === source.id ? { ...item, offsetMs: Math.round(Number(event.target.value) * 1000) } : item))} /></label><div className="source-tracks">{(source.tracks || []).map((track: any) => <label key={track.id}><input type="checkbox" checked={track.selected} onChange={(event) => setSources(sources.map((item) => item.id === source.id ? { ...item, tracks: item.tracks.map((current: any) => current.id === track.id ? { ...current, selected: event.target.checked } : current) } : item))} />{track.label}</label>)}</div><button className="outline" onClick={async () => { await api(`/meetings/${id}/media-sources/${source.id}`, { method: "PUT", body: JSON.stringify({ name: displayFileName(source.name), offsetMs: source.offsetMs, tracks: source.tracks }) }); load(); }}>Применить синхронизацию</button></article>)}</section>}

      {tab === "invite" && m.canManageInvites && (
        <Invite meetingId={id} invites={m.invites} onDone={load} />
      )}
    </section>
  );
}

function TaskEditor({
  task,
  meetingId,
  hasKey,
  people,
  statuses,
  updateTask,
  onComment,
}: {
  task: any;
  meetingId: string;
  hasKey: boolean;
  people: any[];
  statuses: any[];
  updateTask: (id: string, payload: Record<string, unknown>) => Promise<void>;
  onComment: () => void;
}) {
  const [comment,setComment]=useState(''),[commentBusy,setCommentBusy]=useState(false),[commentError,setCommentError]=useState('');
  const postingComment=useRef(false);
  const addComment=async(override?:string)=>{
    const text=(override??comment).trim();if(!text||postingComment.current)return;
    postingComment.current=true;setCommentBusy(true);setCommentError('');setComment('');
    try{await api(`/tasks/${task.id}/comments`,{method:'POST',body:JSON.stringify({body:text})});void Promise.resolve(onComment()).catch(()=>setCommentError('Комментарий отправлен. Обновите встречу, чтобы увидеть его.'));}
    catch(error){setComment(current=>appendDictation(text,current));setCommentError(error instanceof Error?error.message:'Не удалось отправить комментарий. Текст сохранён, повторите попытку.');}
    finally{postingComment.current=false;setCommentBusy(false);}
  };
  return (
    <div className="task-row" data-tour-target="meeting-task-editor">
      <button className="check">
        <Check size={14} />
      </button>
      <div>
        <input
          aria-label="Название поручения"
          defaultValue={task.title}
          onBlur={(e) =>
            e.target.value !== task.title &&
            updateTask(task.id, { title: e.target.value })
          }
        />
        <div className="task-fields">
          <select
            value={task.assigneeId || ""}
            onChange={(e) =>
              updateTask(task.id, { assigneeId: e.target.value || null })
            }
          >
            <option value="">Ответственный не определён</option>
            {people.map((person) => (
              <option value={person.id} key={person.id}>
                {person.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={task.dueDate ? task.dueDate.slice(0, 10) : ""}
            onChange={(e) =>
              updateTask(task.id, { dueDate: e.target.value || null })
            }
          />
        </div>
        {task.comments?.map((item: any) => (
          <p className="task-comment" key={item.id}>
            <b>{item.author.name}:</b> {item.body}
          </p>
        ))}
        <div className="task-comment-input"><ChatComposer key={task.id} meetingId={meetingId} contextKey={'task-comment:'+task.id} mode="comment" inputLabel={`Комментарий к поручению «${task.title}»`} value={comment} onChange={setComment} onSend={addComment} busy={commentBusy} hasKey={hasKey} onNeedKey={()=>setCommentError('Для голосового ввода нужен ключ OpenAI. Добавьте его в админке.')}/>{commentError&&<p className="task-comment-input__error" role="alert">{commentError}</p>}{/ключ/i.test(commentError)&&<AdminLink meetingId={meetingId}/>}</div>
      </div>
      <select
        className="tag"
        value={task.statusId}
        onChange={(e) => updateTask(task.id, { statusId: e.target.value })}
      >
        {statuses.map((status) => (
          <option key={status.id} value={status.id}>
            {status.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function Invite({
  meetingId,
  invites,
  onDone,
}: {
  meetingId: string;
  invites: any[];
  onDone: () => void;
}) {
  const [email, setEmail] = useState(""),
    [role, setRole] = useState("VIEWER");
  const invite = async () => {
    await api(`/meetings/${meetingId}/invites`, {
      method: "POST",
      body: JSON.stringify({ email, role }),
    });
    setEmail("");
    onDone();
  };
  return (
    <section className="invite">
      <h3>Пригласить коллегу</h3>
      <div>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@company.ru"
        />
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="VIEWER">Наблюдатель</option>
          <option value="EDITOR">Редактор</option>
        </select>
        <button className="primary" onClick={invite}>
          Отправить приглашение
        </button>
      </div>
      {invites.map((i) => (
        <p key={i.id}>
          {i.email} · {i.role} {i.revokedAt ? "· отозвано" : ""}{" "}
          {!i.revokedAt && (
            <button
              className="text-btn"
              onClick={async () => {
                await api(`/invites/${i.id}`, { method: "DELETE" });
                onDone();
              }}
            >
              Отозвать
            </button>
          )}
        </p>
      ))}
    </section>
  );
}

function Tasks({ org, calendar = false, tourPreview = false, defaultCalendarView="month" }: { org: Org; calendar?: boolean; tourPreview?: boolean; defaultCalendarView?:CalendarView }) {
  return tourPreview ? <TourTasksPreview org={org} calendar={calendar} /> : <TasksLive org={org} calendar={calendar} defaultCalendarView={defaultCalendarView} />;
}

function TasksLive({ org, calendar = false, defaultCalendarView="month" }: { org: Org; calendar?: boolean; defaultCalendarView?:CalendarView }) {
  const [tasks, setTasks] = useState<any[]>([]),
    [filter, setFilter] = useState({ department: "", assignee: "", status: "", overdue: false });
  const [draggedTask, setDraggedTask] = useState<any | null>(null);
  const [dropStatusId, setDropStatusId] = useState<string | null>(null);
  const [moveError, setMoveError] = useState("");
  const [people, setPeople] = useState<any[]>([]);
  const [editingTask, setEditingTask] = useState<any | null>(null);
  const [calendarView, setCalendarView] = useState<CalendarView>(defaultCalendarView);
  const [calendarSort, setCalendarSort] = useState<CalendarSort>("due-asc");
  const [calendarAnchor, setCalendarAnchor] = useState(() => new Date());
  const loadTasks = () => api<any[]>(`/tasks?organizationId=${org.id}${calendar ? "&calendar=1" : ""}`).then(setTasks);
  useEffect(() => { void loadTasks(); }, [org.id, calendar]);
  useEffect(() => { api<any[]>(`/organizations/${org.id}/members`).then(setPeople); }, [org.id]);
  useEffect(() => {
    if (!calendar) return;
    const savedView = localStorage.getItem(`secretary-calendar-view:${org.id}`) as CalendarView | null;
    const savedSort = localStorage.getItem(`secretary-calendar-sort:${org.id}`) as CalendarSort | null;
    const previousDefault=localStorage.getItem(`secretary-calendar-default:${org.id}`);
    setCalendarView(previousDefault===defaultCalendarView&&calendarViewOptions.some(option=>option.value===savedView)?savedView!:defaultCalendarView);
    localStorage.setItem(`secretary-calendar-default:${org.id}`,defaultCalendarView);
    setCalendarSort(["due-asc", "due-desc", "title", "status"].includes(savedSort || "") ? savedSort! : "due-asc");
  }, [calendar, org.id, defaultCalendarView]);
  const canMove = (task: any, targetStatusId: string) => {
    if (task.statusId === targetStatusId) return true;
    const current = org.taskStatuses.find((status) => status.id === task.statusId);
    const target = org.taskStatuses.find((status) => status.id === targetStatusId);
    if (!current || !target) return false;
    const allowed = current.transitions || [];
    return allowed.length === 0 || allowed.includes(target.key);
  };
  const move = async (taskId: string, statusId: string) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task || !canMove(task, statusId)) { setMoveError("Этот переход запрещён правилами доски."); return; }
    setMoveError("");
    try {
      await api(`/tasks/${taskId}`, { method: "PUT", body: JSON.stringify({ statusId }) });
      setTasks(tasks.map((item) => item.id === taskId ? { ...item, statusId, status: org.taskStatuses.find((status) => status.id === statusId) } : item));
    } catch (error) {
      setMoveError(error instanceof Error ? error.message : "Не удалось переместить поручение.");
    }
  };
  const columns = org.taskStatuses;
  const shown = tasks.filter((task) =>
    (!filter.department || task.meeting.departmentId === filter.department) &&
    (!filter.assignee || task.assigneeId === filter.assignee) &&
    (!filter.status || task.statusId === filter.status) &&
    (!filter.overdue || (task.dueDate && new Date(task.dueDate) < new Date() && task.status.key !== "DONE")),
  );
  const assignees = Array.from(new Map(tasks.filter((t) => t.assignee).map((t) => [t.assignee.id, t.assignee])).values()) as any[];
  const dueTime = (task: any) => task.dueDate ? new Date(task.dueDate).getTime() : Number.POSITIVE_INFINITY;
  const ordered = useMemo(() => [...shown].sort((a, b) => {
    if (calendarSort === "title") return a.title.localeCompare(b.title, "ru");
    if (calendarSort === "status") return (a.status?.name || "").localeCompare(b.status?.name || "", "ru");
    return calendarSort === "due-desc" ? dueTime(b) - dueTime(a) : dueTime(a) - dueTime(b);
  }), [shown, calendarSort]);
  const dateKey = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  const taskDateKey = (task: any) => task.dueDate ? dateKey(new Date(task.dueDate)) : "";
  const todayKey = dateKey(new Date());
  const startOfWeek = (value: Date) => {
    const start = new Date(value.getFullYear(), value.getMonth(), value.getDate());
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    return start;
  };
  const addDays = (value: Date, days: number) => new Date(value.getFullYear(), value.getMonth(), value.getDate() + days);
  const monthStart = new Date(calendarAnchor.getFullYear(), calendarAnchor.getMonth(), 1);
  const monthOffset = (monthStart.getDay() + 6) % 7;
  const monthCells = Array.from({ length: Math.ceil((monthOffset + new Date(calendarAnchor.getFullYear(), calendarAnchor.getMonth() + 1, 0).getDate()) / 7) * 7 }, (_, index) => addDays(monthStart, index - monthOffset));
  const calendarDays = calendarView === "month" ? monthCells : calendarView === "week" ? Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(calendarAnchor), index)) : [new Date(calendarAnchor.getFullYear(), calendarAnchor.getMonth(), calendarAnchor.getDate())];
  const periodLabel = calendarView === "month"
    ? new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(calendarAnchor)
    : calendarView === "week"
      ? `${date(calendarDays[0].toISOString())} — ${date(calendarDays[6].toISOString())}`
      : date(calendarAnchor.toISOString());
  const changeCalendarView = (next: CalendarView) => {
    setCalendarView(next);
    localStorage.setItem(`secretary-calendar-view:${org.id}`, next);
  };
  const changeCalendarSort = (next: CalendarSort) => {
    setCalendarSort(next);
    localStorage.setItem(`secretary-calendar-sort:${org.id}`, next);
  };
  const shiftCalendar = (direction: number) => setCalendarAnchor((current) => {
    const next = new Date(current);
    if (calendarView === "month") next.setMonth(next.getMonth() + direction);
    else if (calendarView === "week") next.setDate(next.getDate() + direction * 7);
    else next.setDate(next.getDate() + direction);
    return next;
  });
  const renderCalendarTask = (task: any) => <button type="button" className="calendar-task" key={task.id} title={task.title} onClick={() => setEditingTask(task)}>
    <strong>{task.title}</strong><span>{task.assignee?.name || "Не назначен"} · {task.status?.name || "Без статуса"}</span>
  </button>;
  const agendaGroups = Array.from(ordered.filter((task) => task.dueDate).reduce<Map<string, any[]>>((groups, task: any) => {
    const key = taskDateKey(task);
    groups.set(key, [...(groups.get(key) || []), task]);
    return groups;
  }, new Map<string, any[]>()).entries()).sort(([left], [right]) => calendarSort === "due-desc" ? right.localeCompare(left) : left.localeCompare(right));
  const unscheduled = ordered.filter((task) => !task.dueDate);
  return (
    <section className="tasks">
      <header data-tour-target={calendar ? "tasks-calendar" : undefined} className={calendar ? "tasks__header tasks__header--calendar" : "tasks__header"}>
        <div><h1>{calendar ? "Календарь поручений" : "Доска поручений"}</h1><p>Сроки, статусы и ответственность сохраняются в организации.</p></div>
        {calendar && <CollectionViewToggle value={calendarView} onChange={changeCalendarView} options={calendarViewOptions} label="Представление календаря поручений" />}
      </header>
      <div className="task-filters">
        <select value={filter.department} onChange={(e) => setFilter({ ...filter, department: e.target.value })}><option value="">Все отделы</option>{org.departments.map((d) => <option value={d.id} key={d.id}>{d.name}</option>)}</select>
        <select value={filter.assignee} onChange={(e) => setFilter({ ...filter, assignee: e.target.value })}><option value="">Все исполнители</option>{assignees.map((person) => <option value={person.id} key={person.id}>{person.name}</option>)}</select>
        <select value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}><option value="">Все статусы</option>{columns.map((status) => <option value={status.id} key={status.id}>{status.name}</option>)}</select>
        <label><input type="checkbox" checked={filter.overdue} onChange={(e) => setFilter({ ...filter, overdue: e.target.checked })} />Только просроченные</label>
      </div>
      {calendar && <div className="calendar-controls">
        <div className="calendar-controls__period"><button className="outline" type="button" onClick={() => shiftCalendar(-1)} aria-label="Предыдущий период">←</button><strong>{periodLabel}</strong><button className="outline" type="button" onClick={() => setCalendarAnchor(new Date())}>Сегодня</button><button className="outline" type="button" onClick={() => shiftCalendar(1)} aria-label="Следующий период">→</button></div>
        <label className="calendar-controls__sort">Сортировка<select value={calendarSort} onChange={(event) => changeCalendarSort(event.target.value as CalendarSort)}><option value="due-asc">Ближайшие сначала</option><option value="due-desc">Дальние сначала</option><option value="title">По названию</option><option value="status">По статусу</option></select></label>
      </div>}
      {moveError && <p className="board-message error" role="alert">{moveError}</p>}
      {calendar ? calendarView === "agenda" ? (
        <div className="calendar-agenda">
          {unscheduled.length > 0 && <section><h2>Без срока</h2>{unscheduled.map((task) => <button type="button" className="calendar-agenda__task" key={task.id} onClick={() => setEditingTask(task)}><time>—</time><div><strong>{task.title}</strong><span>{task.assignee?.name || "Не назначен"} · {task.meeting.title}</span></div><b>{task.status?.name || "Без статуса"}</b></button>)}</section>}
          {agendaGroups.map(([key, items]) => <section key={key}><h2>{date(`${key}T12:00:00`)}</h2>{items.map((task) => <button type="button" className="calendar-agenda__task" key={task.id} onClick={() => setEditingTask(task)}><time>{date(task.dueDate)}</time><div><strong>{task.title}</strong><span>{task.assignee?.name || "Не назначен"} · {task.meeting.title}</span></div><b>{task.status?.name || "Без статуса"}</b></button>)}</section>)}
          {!ordered.length && <p className="calendar-empty">По выбранным фильтрам поручений нет.</p>}
        </div>
      ) : (
        <>
          {unscheduled.length > 0 && <section className="calendar-unscheduled"><h2>Без срока</h2><div>{unscheduled.map(renderCalendarTask)}</div></section>}
          <div className={`calendar-grid calendar-grid--${calendarView}`}>
            {calendarView !== "day" && ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => <b className="calendar-grid__weekday" key={day}>{day}</b>)}
            {calendarDays.map((day) => {
              const key = dateKey(day);
              const inCurrentMonth = day.getMonth() === calendarAnchor.getMonth();
              const dayTasks = ordered.filter((task) => taskDateKey(task) === key);
              return <section className={`calendar-day${key === todayKey ? " calendar-day--today" : ""}${calendarView === "month" && !inCurrentMonth ? " calendar-day--outside" : ""}`} key={key}><header><time>{new Intl.DateTimeFormat("ru-RU", { weekday: calendarView === "day" ? "long" : undefined, day: "numeric", month: calendarView === "day" ? "long" : undefined }).format(day)}</time><span>{dayTasks.length || ""}</span></header>{dayTasks.map(renderCalendarTask)}{!dayTasks.length && <p>Нет поручений</p>}</section>;
            })}
          </div>
        </>
      ) : (
        <div className="board">
          {columns.map((c, index) => (
            <div
              className={`column${dropStatusId === c.id ? " is-drop-target" : ""}`}
              key={c.id}
              data-tour-target={index === 0 ? "tasks-board" : undefined}
              onDragOver={(event) => {
                if (draggedTask && canMove(draggedTask, c.id)) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDropStatusId(c.id);
                }
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropStatusId(null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                const taskId = event.dataTransfer.getData("text/task-id") || draggedTask?.id;
                if (taskId && draggedTask && canMove(draggedTask, c.id)) move(taskId, c.id);
                setDraggedTask(null);
                setDropStatusId(null);
              }}
            >
              <h3>
                {c.name}
                <span>{shown.filter((t) => t.statusId === c.id).length}</span>
              </h3>
              {shown
                .filter((t) => t.statusId === c.id)
                .map((t) => (
                  <article
                    className={`task-card${draggedTask?.id === t.id ? " is-dragging" : ""}`}
                    key={t.id}
                    draggable
                    onDragStart={(event) => {
                      setDraggedTask(t);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/task-id", t.id);
                    }}
                    onDragEnd={() => { setDraggedTask(null); setDropStatusId(null); }}
                  >
                    <b>{t.title}</b>
                    <p>
                      {t.description || t.evidence || "Описание не добавлено"}
                    </p>
                    <footer>
                      <span>{t.assignee?.name || "Нужен исполнитель"}</span>
                      <time>{date(t.dueDate)}</time>
                    </footer>
                    <select
                      aria-label={`Статус: ${t.title}`}
                      value={t.statusId}
                      onChange={(e) => move(t.id, e.target.value)}
                    >
                      {columns.map((status) => {
                        const available = canMove(t, status.id);
                        return <option key={status.id} value={status.id} disabled={!available}>
                          {status.name}{available || status.id === t.statusId ? "" : " — недоступно"}
                        </option>
                      })}
                    </select>
                  </article>
                ))}
            </div>
          ))}
        </div>
      )}
      {editingTask && <CalendarTaskEditor task={editingTask} people={people} statuses={columns} canMove={canMove} onClose={() => setEditingTask(null)} onSaved={() => { setEditingTask(null); void loadTasks(); }} />}
    </section>
  );
}

function CalendarTaskEditor({ task, people, statuses, canMove, onClose, onSaved }: { task: any; people: any[]; statuses: any[]; canMove: (task: any, statusId: string) => boolean; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState({ title: task.title || "", description: task.description || "", assigneeId: task.assigneeId || "", dueDate: task.dueDate ? task.dueDate.slice(0, 10) : "", statusId: task.statusId, needsClarification: Boolean(task.needsClarification) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [busy, onClose]);
  const save = async () => {
    if (!draft.title.trim()) { setError("Укажите название поручения."); return; }
    setBusy(true); setError("");
    try {
      await api(`/tasks/${task.id}`, { method: "PUT", body: JSON.stringify({ title: draft.title.trim(), description: draft.description.trim() || null, assigneeId: draft.assigneeId || null, dueDate: draft.dueDate || null, statusId: draft.statusId, needsClarification: draft.needsClarification }) });
      onSaved();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось сохранить поручение."); }
    finally { setBusy(false); }
  };
  return <div className="publication-modal task-editor-modal" role="dialog" aria-modal="true" aria-labelledby="task-editor-title" onClick={() => !busy && onClose()}>
    <div onClick={(event) => event.stopPropagation()}>
      <button className="modal-close" type="button" aria-label="Закрыть" disabled={busy} onClick={onClose}><X size={18} /></button>
      <small>ПОРУЧЕНИЕ</small><h3 id="task-editor-title">Настроить поручение</h3>
      <p className="task-editor-modal__source">Из встречи: {task.meeting?.title || "—"}</p>
      <label>Название<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
      <label>Описание<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Что нужно сделать и какой результат ожидается" /></label>
      <div className="task-editor-modal__grid"><label>Ответственный<select value={draft.assigneeId} onChange={(event) => setDraft({ ...draft, assigneeId: event.target.value })}><option value="">Не назначен</option>{people.map((person) => <option value={person.id} key={person.id}>{person.name}</option>)}</select></label><label>Срок<input type="date" value={draft.dueDate} onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })} /></label></div>
      <label>Статус<select value={draft.statusId} onChange={(event) => setDraft({ ...draft, statusId: event.target.value })}>{statuses.map((status) => <option key={status.id} value={status.id} disabled={status.id !== task.statusId && !canMove(task, status.id)}>{status.name}{status.id !== task.statusId && !canMove(task, status.id) ? " — недоступно" : ""}</option>)}</select></label>
      <label className="task-editor-modal__checkbox"><input type="checkbox" checked={draft.needsClarification} onChange={(event) => setDraft({ ...draft, needsClarification: event.target.checked })} />Требует уточнения</label>
      {error && <p className="meeting-confirm__error" role="alert">{error}</p>}
      <footer><button className="outline" type="button" disabled={busy} onClick={onClose}>Отмена</button><button className="primary" type="button" disabled={busy} onClick={save}>{busy ? "Сохраняем…" : "Сохранить"}</button></footer>
    </div>
  </div>;
}

function Notifications({ tourPreview = false }: { tourPreview?: boolean }) {
  return tourPreview ? <TourNotificationsPreview /> : <NotificationsLive />;
}

function NotificationsLive() {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => {
    api<any[]>("/notifications").then(setItems);
  }, []);
  const unreadCount = items.filter((item) => !item.readAt).length;
  const formatMoment = (value: string) => new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  return (
    <section className="notices" data-tour-target="notifications">
      <header className="notices__header">
        <div><span className="eyebrow">ЦЕНТР ВНИМАНИЯ</span><h1>Уведомления</h1><p>{unreadCount ? `Непрочитанных: ${unreadCount}.` : "Все уведомления просмотрены."}</p></div>
        {unreadCount > 0 && <button className="outline" onClick={() => api("/notifications/read", { method: "POST" }).then(() => setItems(items.map((item) => ({ ...item, readAt: new Date().toISOString() }))))}><Check size={15} />Прочитать всё</button>}
      </header>
      {items.length ? <div className="notices__feed">
        {items.map((item) => <article className={item.readAt ? "" : "unread"} key={item.id}>
          <div className="notices__icon"><Bell size={17} /></div>
          <div className="notices__content"><header><strong>{item.title}</strong>{!item.readAt && <span>Новое</span>}</header><p>{item.body}</p><time dateTime={item.createdAt}>{formatMoment(item.createdAt)}</time></div>
        </article>)}
      </div> : <div className="notices__empty"><Bell size={26} /><h2>Здесь будет спокойно</h2><p>Новые поручения, приглашения и напоминания появятся в этой ленте.</p></div>}
    </section>
  );
}

const tourPreviewTasks = [
  { title: "Согласовать план запуска", assignee: "Наталья Семёнова", due: "06 нояб.", status: "В работе", column: "В работе", description: "Сверить этапы, ответственных и дату следующего созвона." },
  { title: "Подготовить краткое резюме", assignee: "Алексей Морозов", due: "05 нояб.", status: "Черновик", column: "Черновик", description: "Собрать выводы встречи в письмо для команды." },
  { title: "Проверить материалы встречи", assignee: "Наталья Семёнова", due: "08 нояб.", status: "Готово", column: "Готово", description: "Уточнить открытые вопросы по записи." },
];

function TourMeetingPreview({ taskEditor = false }: { taskEditor?: boolean }) {
  const firstTask = tourPreviewTasks[0];
  return <section className="detail tour-preview" aria-label="Пример готовой встречи">
    <button className="back" type="button">← Все встречи</button>
    <header className="detail-head detail-head--meeting">
      <div><p>Общий · Рабочая встреча</p><h1>План запуска проекта</h1></div>
      <div className="detail-head__actions"><button className="outline" type="button"><Pencil size={15} /> Переименовать</button><button className="outline" type="button"><Plus size={15} /> Добавить материалы</button><button className="primary" type="button">Сохранить изменения</button></div>
      <div className="detail-head__status"><span className="state ready">Готово</span></div>
    </header>
    <div className="tabs" data-tour-target="meeting-results">
      <button className="active" type="button">Результат</button><button type="button">Расшифровка</button><button type="button">Материалы</button>
    </div>
    <div className="result-layout">
      <div className="results">
        <section className="result-accordion open"><div className="result-accordion__trigger"><span><strong>Резюме</strong><small>Краткое содержание встречи</small></span><ChevronDown size={17} /></div><div className="result-accordion__content"><p className="tour-preview__copy">Команда согласовала этапы запуска, сроки подготовки материалов и формат еженедельного статуса.</p></div></section>
        <section className="result-accordion"><div className="result-accordion__trigger"><span><strong>Решения</strong><small>2 решения</small></span><ChevronDown size={17} /></div></section>
        <section className="result-accordion"><div className="result-accordion__trigger"><span><strong>Риски и требуется уточнение</strong><small>1 вопрос для проверки</small></span><ChevronDown size={17} /></div></section>
        <section className={`result-accordion ${taskEditor ? "open" : ""}`}>
          <div className="result-accordion__trigger"><span><strong>Поручения</strong><small>3 поручения</small></span><ChevronDown size={17} /></div>
          {taskEditor && <div className="result-accordion__content"><div className="task-list"><div className="task-row" data-tour-target="meeting-task-editor">
            <button className="check" type="button"><Check size={14} /></button>
            <div><input aria-label="Название поручения" defaultValue={firstTask.title} readOnly /><div className="task-fields"><select aria-label="Ответственный" defaultValue="natalia"><option value="natalia">Наталья Семёнова</option></select><input aria-label="Срок" type="date" defaultValue="2026-11-06" readOnly /></div><p className="task-comment"><b>Алексей:</b> добавить подтверждённую дату запуска</p><div className="comment-entry"><input aria-label="Комментарий" placeholder="Добавить комментарий" /><button type="button" aria-label="Отправить комментарий"><Send size={12} /></button></div></div>
            <select className="tag" aria-label="Статус поручения" defaultValue="work"><option value="work">В работе</option></select>
          </div></div></div>}
        </section>
      </div>
      <aside className="chat"><div><h3>Спросить о встрече</h3><p>Ответы ограничены материалами этого протокола.</p></div><div className="messages"><p className="user">Что нужно сделать до пятницы?</p><p className="assistant">Согласовать план запуска и подготовить краткое резюме.</p></div><div className="ask"><textarea aria-label="Вопрос о встрече" placeholder="Например, какой срок у задачи?" /><button type="button" aria-label="Отправить вопрос"><Send size={16} /></button></div></aside>
    </div>
  </section>;
}

function TourTaskCard({ task }: { task: typeof tourPreviewTasks[number] }) {
  return <article className="task-card"><b>{task.title}</b><p>{task.description}</p><footer><span>{task.assignee}</span><time>{task.due}</time></footer><select aria-label={`Статус: ${task.title}`} defaultValue={task.status}><option value={task.status}>{task.status}</option></select></article>;
}

function TourTasksPreview({ org, calendar }: { org: Org; calendar: boolean }) {
  const columns = ["Черновик", "В работе", "Готово"];
  return <section className="tasks tour-preview" aria-label={calendar ? "Пример календаря поручений" : "Пример доски поручений"}>
    <header data-tour-target={calendar ? "tasks-calendar" : undefined} className={calendar ? "tasks__header tasks__header--calendar" : "tasks__header"}>
      <div><h1>{calendar ? "Календарь поручений" : "Доска поручений"}</h1><p>{calendar ? "Пример сроков и задач: ваши поручения будут отображаться так же." : "Пример распределения поручений по статусам."}</p></div>
      {calendar && <div className="collection-view-toggle" role="group" aria-label="Представление календаря поручений"><button className="active" type="button">Месяц</button><button type="button">Неделя</button><button type="button">День</button><button type="button">Список</button></div>}
    </header>
    <div className="task-filters"><select aria-label="Отдел" defaultValue="all"><option value="all">Все отделы</option><option>{org.departments[0]?.name || "Общий"}</option></select><select aria-label="Исполнитель" defaultValue="all"><option value="all">Все исполнители</option><option>Наталья Семёнова</option></select><select aria-label="Статус" defaultValue="all"><option value="all">Все статусы</option><option>В работе</option></select></div>
    {calendar ? <><div className="calendar-controls"><div className="calendar-controls__period"><button className="outline" type="button">←</button><strong>Ноябрь 2026</strong><button className="outline" type="button">Сегодня</button><button className="outline" type="button">→</button></div></div><section className="calendar-unscheduled"><h2>Без срока</h2><div><button className="calendar-task" type="button"><strong>Подготовить краткое резюме</strong><span>Алексей Морозов · Черновик</span></button></div></section><div className="calendar-grid"><b className="calendar-grid__weekday">Пн</b><b className="calendar-grid__weekday">Вт</b><b className="calendar-grid__weekday">Ср</b><b className="calendar-grid__weekday">Чт</b><b className="calendar-grid__weekday">Пт</b><b className="calendar-grid__weekday">Сб</b><b className="calendar-grid__weekday">Вс</b>{[3, 4, 5, 6, 7, 8, 9].map((day) => <section className={`calendar-day${day === 6 ? " calendar-day--today" : ""}`} key={day}><header><time>{day}</time></header>{day === 6 && <button className="calendar-task" type="button"><strong>Согласовать план запуска</strong><span>Наталья Семёнова · В работе</span></button>}</section>)}</div></> : <div className="board">{columns.map((column, index) => <div className="column" key={column} data-tour-target={index === 0 ? "tasks-board" : undefined}><h3>{column}<span>{tourPreviewTasks.filter((task) => task.column === column).length}</span></h3>{tourPreviewTasks.filter((task) => task.column === column).map((task) => <TourTaskCard key={task.title} task={task} />)}</div>)}</div>}
  </section>;
}

function TourNotificationsPreview() {
  const items = [
    ["Вам назначено поручение", "Согласовать план запуска · срок 6 ноября", "сейчас"],
    ["Изменился срок поручения", "Подготовить краткое резюме · новая дата 5 ноября", "10 минут назад"],
    ["Встреча обработана", "План запуска проекта · доступны резюме и поручения", "сегодня, 10:32"],
  ];
  return <section className="notices tour-preview" data-tour-target="notifications" aria-label="Пример уведомлений"><header className="notices__header"><div><span className="eyebrow">ЦЕНТР ВНИМАНИЯ</span><h1>Уведомления</h1><p>Непрочитанных: 3.</p></div><button className="outline" type="button"><Check size={15} />Прочитать всё</button></header><div className="notices__feed">{items.map(([title, body, moment]) => <article className="unread" key={title}><div className="notices__icon"><Bell size={17} /></div><div className="notices__content"><header><strong>{title}</strong><span>Новое</span></header><p>{body}</p><time>{moment}</time></div></article>)}</div></section>;
}

function AdminGate({ org, onBack, onOrganizationChanged, tourSignal, demoMode }: { org: Org; onBack: () => void; onOrganizationChanged: () => Promise<void>; tourSignal: number; demoMode: boolean }) {
  const [pass, setPass] = useState("");
  const [passVisible, setPassVisible] = useState(false);
  const [ok, setOk] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setChecking(true);
    api<{ allowed: boolean }>(`/admin/access?organizationId=${org.id}`).then((result) => {
      if (active) { setOk(result.allowed); setError(result.allowed ? "" : "У вас нет прав администратора этой организации."); }
    }).catch(() => { if (active && !demoMode) setError("У вас нет прав администратора этой организации."); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [org.id, demoMode]);
  const unlock = async () => {
    setError("");
    try {
      const result = await api<{ token: string }>("/auth/demo-admin-session", { method: "POST", body: JSON.stringify({ password: pass }) });
      sessions.saveDemo(result.token);
      const access = await api<{ allowed: boolean }>(`/admin/access?organizationId=${org.id}`);
      if (!access.allowed) throw new Error("Доступ к этой организации не разрешён.");
      setOk(true);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Не удалось войти в админку."); }
  };
  if (ok) return <Admin org={org} onBack={onBack} onOrganizationChanged={onOrganizationChanged} tourSignal={tourSignal} />;
  return (
    <section className="secure-gate" aria-labelledby="admin-gate-title">
      <button className="back secure-gate__back" onClick={onBack}>
        ← К рабочему пространству
      </button>
      <div className="secure-gate__card">
        <div className="secure-gate__mark" aria-hidden="true">
          <Lock size={19} />
        </div>
        <h1 id="admin-gate-title">Администрирование</h1>
        <p>
          Настройка шаблонов, правил обработки, интеграции OpenAI и почтовой
          доставки для организации «{org.name}».
        </p>
        {demoMode && <p className="secure-gate__demo">Демо-режим включён · пароль для входа: <b>1234</b></p>}
        {checking && <p>Проверяем доступ…</p>}
        {!demoMode && !checking && <p>Для администрирования нужна роль владельца или администратора организации.</p>}
        {demoMode && <>
        <label className="secure-gate__field">
          <span>Пароль доступа</span>
          <span className="secure-gate__password-input">
            <input
              type={passVisible ? "text" : "password"}
              value={pass}
              placeholder="Введите пароль"
              autoComplete="current-password"
              onChange={(e) => setPass(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void unlock(); }}
            />
            {pass && <button type="button" className="secure-gate__password-action secure-gate__password-action--clear" aria-label="Очистить пароль" title="Очистить пароль" onClick={() => setPass("")}><X size={15} /></button>}
            <button type="button" className="secure-gate__password-action" aria-label={passVisible ? "Скрыть пароль" : "Показать пароль"} title={passVisible ? "Скрыть пароль" : "Показать пароль"} onClick={() => setPassVisible(!passVisible)}>{passVisible ? <EyeOff size={16} /> : <Eye size={16} />}</button>
          </span>
        </label>
        <button
          className="primary secure-gate__submit"
          onClick={() => void unlock()}
        >
          Войти в админ-панель
        </button>
        </>}
        {error && <p className="error secure-gate__error" role="alert">{error}</p>}
      </div>
    </section>
  );
}
function Admin({ org, onBack, onOrganizationChanged, tourSignal }: { org: Org; onBack: () => void; onOrganizationChanged: () => Promise<void>; tourSignal: number }) {
  const [data, setData] = useState<any>(null),
    [newTpl, setNewTpl] = useState({
      name: "",
      description: "",
      instructions: "",
      fields: "",
    }),
    [editingTemplateId, setEditingTemplateId] = useState<string | null>(null),
    [saving, setSaving] = useState(false),
    [tourStep, setTourStep] = useState<number | null>(null),
    [openSection, setOpenSection] = useState<string>(() => ["cloud","instructions"].includes(new URLSearchParams(window.location.search).get("section")||"") ? new URLSearchParams(window.location.search).get("section")! : "integrations");
  const tourStorageKey = `secretary-admin-tour:${org.id}:v1`;
  const load = () =>
    api<any>(`/admin/templates?organizationId=${org.id}`).then(setData);
  useEffect(() => {
    load();
  }, [org.id]);
  useEffect(() => {
    if (data && openSection === "integrations" && new URLSearchParams(window.location.search).get("section") === "integrations")
      window.requestAnimationFrame(() => document.querySelector('[data-tour-target="integrations"]')?.scrollIntoView({ block: "start", behavior: "smooth" }));
  }, [data, openSection]);
  useEffect(() => {
    if (data && !localStorage.getItem(tourStorageKey)) setTourStep(0);
  }, [data, tourStorageKey]);
  useEffect(() => { if (tourSignal) setTourStep(0); }, [tourSignal]);
  const create = async () => {
    setSaving(true);
    try {
      await api(
        editingTemplateId
          ? `/admin/templates/${editingTemplateId}`
          : "/admin/templates",
        {
          method: editingTemplateId ? "PUT" : "POST",
          body: JSON.stringify({
            ...(editingTemplateId ? {} : { organizationId: org.id }),
            ...newTpl,
            fields: newTpl.fields
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean),
          }),
        },
      );
      setNewTpl({ name: "", description: "", instructions: "", fields: "" });
      setEditingTemplateId(null);
      load();
    } finally {
      setSaving(false);
    }
  };
  if (!data) return <div className="loading">Открываем администрирование…</div>;
  return (
    <section className={`admin ${tourStep !== null ? "is-touring" : ""}`}>
      <button className="back" onClick={onBack}>
        ← Вернуться в продукт
      </button>
      <header data-tour-target="intro">
        <p>АДМИНИСТРИРОВАНИЕ ОРГАНИЗАЦИИ</p>
        <h1>Управление агентом</h1>
      </header>
      <div className="admin-layout">
      <nav className="admin-layout__nav" aria-label="Разделы управления">
        <span>НАСТРОЙКИ АГЕНТА</span>
        <button className={openSection === "integrations" ? "active" : ""} onClick={() => setOpenSection("integrations")}>Главная и ключи</button>
        <button className={openSection === "cloud" ? "active" : ""} onClick={() => setOpenSection("cloud")}>Облачные папки</button>
        <button className={openSection === "instructions" ? "active" : ""} onClick={() => setOpenSection("instructions")}>Инструкции</button>
        <button className={openSection === "templates" ? "active" : ""} onClick={() => setOpenSection("templates")}>Шаблоны встреч</button>
        <button className={openSection === "retention" ? "active" : ""} onClick={() => setOpenSection("retention")}>Аудио и хранение</button>
        <button className={openSection === "board" ? "active" : ""} onClick={() => setOpenSection("board")}>Доска поручений</button>
        <button className={openSection === "departments" ? "active" : ""} onClick={() => setOpenSection("departments")}>Отделы</button>
        <button className={openSection === "members" ? "active" : ""} onClick={() => setOpenSection("members")}>Команда и роли</button>
      </nav>
      <div className="admin-layout__content">
      {openSection === "instructions" && <AdminInstructions key={org.id} orgId={org.id}/>}
      {openSection==='cloud'&&<CloudFolders orgId={org.id}/>}
      <AccordionSection title="Шаблоны встреч" summary="Структура AI-результата и пользовательские сценарии" open={openSection === "templates"} onToggle={() => setOpenSection("templates")} tourTarget="templates">
      <div className="template-guide" aria-label="Как работать с шаблонами встреч">
        <strong>Как пользоваться шаблонами</strong>
        <ol>
          <li>Выберите шаблон слева для редактирования или создайте новый справа.</li>
          <li>Укажите, что AI должен учитывать, и перечислите дополнительные поля результата через запятую — например, «Бюджет, следующий шаг».</li>
          <li>Сохраните шаблон. При создании встречи выберите его в поле «Шаблон»: по нему будут обработаны заметки или запись.</li>
        </ol>
      </div>
      <div className="admin-grid">
        <div className="template-list">
          {data.templates.map((t: any) => (
            <article
              key={t.id}
              onClick={() => {
                setEditingTemplateId(t.id);
                setNewTpl({
                  name: t.name,
                  description: t.description,
                  instructions: t.instructions,
                  fields: (t.fields || []).join(", "),
                });
              }}
            >
              <small>{t.fields.length} поля</small>
              <h3>{t.name}</h3>
              <p>{t.description}</p>
            </article>
          ))}
        </div>
        <div className="template-editor">
          <h2>
            {editingTemplateId
              ? "Редактирование шаблона"
              : "Новый пользовательский шаблон"}
          </h2>
          <label>
            Название
            <input
              value={newTpl.name}
              onChange={(e) => setNewTpl({ ...newTpl, name: e.target.value })}
            />
          </label>
          <label>
            Короткое описание
            <input
              value={newTpl.description}
              onChange={(e) =>
                setNewTpl({ ...newTpl, description: e.target.value })
              }
            />
          </label>
          <label>
            Инструкции для AI
            <textarea
              value={newTpl.instructions}
              onChange={(e) =>
                setNewTpl({ ...newTpl, instructions: e.target.value })
              }
            />
          </label>
          <label>
            Поля результата через запятую
            <input
              value={newTpl.fields}
              onChange={(e) => setNewTpl({ ...newTpl, fields: e.target.value })}
            />
          </label>
          <button
            className="primary"
            disabled={saving || !newTpl.name}
            onClick={create}
          >
            <Plus size={16} />
            {editingTemplateId ? "Сохранить шаблон" : "Создать шаблон"}
          </button>
          {editingTemplateId && (
            <button
              className="text-btn"
              onClick={() => {
                setEditingTemplateId(null);
                setNewTpl({
                  name: "",
                  description: "",
                  instructions: "",
                  fields: "",
                });
              }}
            >
              Создать новый вместо редактирования
            </button>
          )}
        </div>
      </div>
      </AccordionSection>
      <AccordionSection title="Политика хранения аудио" summary={`Сейчас: ${data.retention?.kind === "MANUAL" ? "до ручного удаления" : data.retention?.kind === "AFTER_TRANSCRIPTION" ? "удаление после расшифровки" : `удаление через ${data.retention?.days || 30} дней`}`} open={openSection === "retention"} onToggle={() => setOpenSection("retention")} tourTarget="retention">
      <section className="policy">
        <h2>Политика хранения аудио</h2>
        <p>
          По умолчанию: удаление через {data.retention?.days || 30} дней.
          Задайте политику организации в этой панели.
        </p>
        <select
          value={data.retention?.kind || "DAYS"}
          onChange={async (e) => {
            await api(`/admin/retention/${org.id}`, {
              method: "PUT",
              body: JSON.stringify({
                kind: e.target.value,
                days: data.retention?.days || 30,
              }),
            });
            load();
          }}
        >
          <option value="DAYS">Удалять через заданный срок</option>
          <option value="AFTER_TRANSCRIPTION">Удалять после расшифровки</option>
          <option value="MANUAL">Хранить до ручного удаления</option>
        </select>
        {data.retention?.kind === "DAYS" && (
          <label className="retention-days">
            Срок хранения, дней
            <input
              type="number"
              min="1"
              defaultValue={data.retention?.days || 30}
              onBlur={async (e) => {
                const days = Number(e.target.value);
                if (!Number.isInteger(days) || days < 1) return;
                await api(`/admin/retention/${org.id}`, {
                  method: "PUT",
                  body: JSON.stringify({ kind: "DAYS", days }),
                });
                load();
              }}
            />
          </label>
        )}
      </section>
      </AccordionSection>
      <AccordionSection title="Статусы доски" summary={`${data.statuses.length} колонок и правила переходов`} open={openSection === "board"} onToggle={() => setOpenSection("board")} tourTarget="board">
      <section className="policy board-settings">
        <h2>Статусы доски</h2>
        <p>
          Переименуйте колонки и отметьте, куда задачу можно переместить из
          каждого статуса. Изменения сохраняются сразу.
        </p>
        {data.statuses.map((status: any, index: number) => (
          <article className="status-editor" key={status.id}>
            <div className="status-editor__top">
              <div className="status-order" aria-label={`Порядок статуса ${status.name}`}>
                <button
                  className="icon-button"
                  title="Переместить выше"
                  aria-label="Переместить выше"
                  disabled={!index}
                  onClick={async () => {
                    const previous = data.statuses[index - 1];
                    if (!previous) return;
                    await Promise.all([
                      api(`/admin/statuses/${status.id}`, { method: "PUT", body: JSON.stringify({ name: status.name, position: previous.position, transitions: status.transitions || [] }) }),
                      api(`/admin/statuses/${previous.id}`, { method: "PUT", body: JSON.stringify({ name: previous.name, position: status.position, transitions: previous.transitions || [] }) }),
                    ]);
                    load();
                  }}
                ><ChevronUp size={15} /></button>
                <span>{index + 1}</span>
                <button
                  className="icon-button"
                  title="Переместить ниже"
                  aria-label="Переместить ниже"
                  disabled={index === data.statuses.length - 1}
                  onClick={async () => {
                    const next = data.statuses[index + 1];
                    if (!next) return;
                    await Promise.all([
                      api(`/admin/statuses/${status.id}`, { method: "PUT", body: JSON.stringify({ name: status.name, position: next.position, transitions: status.transitions || [] }) }),
                      api(`/admin/statuses/${next.id}`, { method: "PUT", body: JSON.stringify({ name: next.name, position: status.position, transitions: next.transitions || [] }) }),
                    ]);
                    load();
                  }}
                ><ChevronDown size={15} /></button>
              </div>
              <label className="status-editor__name">
                <span>Название статуса</span>
                <input
                  defaultValue={status.name}
                  onBlur={async (e) => {
                    if (e.target.value && e.target.value !== status.name) {
                      await api(`/admin/statuses/${status.id}`, { method: "PUT", body: JSON.stringify({ name: e.target.value, position: status.position, transitions: status.transitions || [] }) });
                      load();
                    }
                  }}
                />
              </label>
              <small className="status-editor__key">{status.key}</small>
            </div>
            <fieldset className="status-editor__transitions">
              <legend>Можно переместить задачу в</legend>
              <div>
                {data.statuses.filter((target: any) => target.id !== status.id).map((target: any) => {
                  const enabled = (status.transitions || []).includes(target.key);
                  return <label key={target.id} className={enabled ? "selected" : ""}>
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={async () => {
                        const transitions = enabled
                          ? (status.transitions || []).filter((key: string) => key !== target.key)
                          : [...(status.transitions || []), target.key];
                        await api(`/admin/statuses/${status.id}`, { method: "PUT", body: JSON.stringify({ name: status.name, position: status.position, transitions }) });
                        load();
                      }}
                    />
                    <span>{target.name}</span>
                  </label>;
                })}
              </div>
            </fieldset>
          </article>
        ))}
      </section>
      </AccordionSection>
      <AccordionSection title="Главная и ключи" summary="OpenAI текущего пространства, модели и email" open={openSection === "integrations"} onToggle={() => setOpenSection("integrations")} tourTarget="integrations"><AdminIntegrations organizationId={org.id} organizationName={org.name} /></AccordionSection>
      <AccordionSection title="Отделы" summary={`${org.departments.length} отделов в организации`} open={openSection === "departments"} onToggle={() => setOpenSection("departments")} tourTarget="departments"><AdminDepartments org={org} onOrganizationChanged={onOrganizationChanged} /></AccordionSection>
      <AccordionSection title="Команда и роли" summary="Доступ сотрудников и распределение по отделам" open={openSection === "members"} onToggle={() => setOpenSection("members")} tourTarget="members"><AdminMembers org={org} /></AccordionSection>
      </div>
      </div>
      {tourStep !== null && (
        <AdminTour
          step={tourStep}
          onStep={setTourStep}
          onClose={() => {
            localStorage.setItem(tourStorageKey, "1");
            setTourStep(null);
          }}
        />
      )}
    </section>
  );
}

const adminTourSteps = [
  { target: "intro", title: "Панель управления", text: "Здесь настраивается только выбранная организация. Доступ к данным других организаций из этой панели исключён." },
  { target: "templates", title: "Шаблоны встреч", text: "Выберите шаблон слева для редактирования или заполните форму справа, чтобы создать собственную структуру результата AI." },
  { target: "retention", title: "Аудио после расшифровки", text: "Выберите срок хранения записи. Изменение применяется к новым файлам организации." },
  { target: "board", title: "Статусы задач", text: "Меняйте названия колонок, порядок стрелками и разрешённые переходы чекбоксами. Сохранение происходит сразу." },
  { target: "integrations", title: "AI и email", text: "Подключите ключ OpenAI для анализа и расшифровки, затем настройте SMTP для приглашений, назначений и напоминаний." },
  { target: "departments", title: "Отделы", text: "Добавляйте отделы здесь. Они будут доступны при создании встреч и назначении коллег." },
  { target: "members", title: "Коллеги и роли", text: "Введите email уже зарегистрированного сотрудника, выберите роль и отдел. Гость видит данные, участник может работать с ними." },
];

function AccordionSection({ title, summary, open, onToggle, children, tourTarget }: { title: string; summary: string; open: boolean; onToggle: () => void; children: React.ReactNode; tourTarget?: string }) {
  return <section className={`accordion-section ${open ? "open" : ""}`} data-tour-target={tourTarget}>
    <button className="accordion-section__trigger" onClick={onToggle} aria-expanded={open}>
      <span><strong>{title}</strong><small>{summary}</small></span>
      <ChevronDown size={18} />
    </button>
    {open && <div className="accordion-section__content">{children}</div>}
  </section>;
}

function AdminTour({ step, onStep, onClose }: { step: number; onStep: (step: number) => void; onClose: () => void }) {
  const current = adminTourSteps[step];
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    const target = document.querySelector<HTMLElement>(`[data-tour-target="${current.target}"], [data-tour-fallback~="${current.target}"]`);
    if (!target) return;
    target.classList.add("tour-highlight");
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    const update = () => setRect(target.getBoundingClientRect());
    const timer = window.setTimeout(update, 260);
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.clearTimeout(timer);
      target.classList.remove("tour-highlight");
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [current.target]);
  const last = step === adminTourSteps.length - 1;
  return (
    <div className="admin-tour" role="dialog" aria-modal="true" aria-label="Инструкция по админ-панели">
      {rect && <div className="admin-tour__spotlight" style={{ top: Math.max(8, rect.top - 8), left: Math.max(8, rect.left - 8), width: rect.width + 16, height: rect.height + 16 }} />}
      <section className="admin-tour__card">
        <div className="admin-tour__progress" aria-label={`Шаг ${step + 1} из ${adminTourSteps.length}`}>
          {adminTourSteps.map((_, index) => <i key={index} className={index <= step ? "active" : ""} />)}
        </div>
        <h2>{current.title}</h2>
        <p>{current.text}</p>
        <div className="admin-tour__actions">
          <button className="text-btn" onClick={onClose}>Пропустить инструкцию</button>
          <div>
            {step > 0 && <button className="outline" onClick={() => onStep(step - 1)}>Назад</button>}
            <button className="primary" onClick={() => last ? onClose() : onStep(step + 1)}>{last ? "Готово" : "Далее"}</button>
          </div>
        </div>
      </section>
    </div>
  );
}

const workspaceTourSteps: { target: string; eyebrow: string; title: string; text: string }[] = [
  {
    target: "meeting-create",
    eyebrow: "БЫСТРЫЙ СТАРТ",
    title: "Начните с новой встречи",
    text: "Нажмите «Новая встреча», чтобы получить карточку для материалов. В ней можно указать контекст, добавить запись или оставить заметки — результат останется в списке встреч.",
  },
  {
    target: "meeting-title",
    eyebrow: "1 · КАРТОЧКА ВСТРЕЧИ",
    title: "Назовите встречу и выберите шаблон",
    text: "Введите понятное название: его увидят коллеги в списке и в поручениях. Рядом выберите отдел и шаблон — он определяет, какие разделы AI подготовит в результате.",
  },
  {
    target: "meeting-materials",
    eyebrow: "2 · ДОБАВИТЬ МАТЕРИАЛЫ",
    title: "Загрузите или перетащите аудио и видео",
    text: "Нажмите эту область, выберите файл на устройстве или просто перетащите его сюда. Можно приложить аудио или видео; видео будет подготовлено на сервере, а исходный файл не передаётся в AI.",
  },
  {
    target: "meeting-recording",
    eyebrow: "ИЛИ · ЗАПИСАТЬ СРАЗУ",
    title: "Запишите встречу как в диктофоне",
    text: "Нажмите «Записать встречу» на телефоне или компьютере и разрешите доступ к микрофону. После остановки запись автоматически станет материалом этой карточки; при необходимости можно добавить ещё файлы.",
  },
  {
    target: "meeting-analyze",
    eyebrow: "3 · ЗАПУСТИТЬ АНАЛИЗ",
    title: "Отправьте материалы на обработку",
    text: "Когда добавлены запись или заметки, нажмите «Анализировать материалы». Карточка появится в списке сразу, а обработка продолжится в фоне с индикатором и временем ожидания.",
  },
  {
    target: "meeting-results",
    eyebrow: "4 · ПРОВЕРИТЬ ИТОГ",
    title: "Готовая встреча уже открыта",
    text: "Сейчас ничего искать и нажимать в карточке не нужно: я уже открыл обработанную встречу. Над блоком ниже видны вкладки «Результат», «Расшифровка» и «Материалы». Нажмите «Далее», чтобы увидеть, как настраивать поручения.",
  },
  {
    target: "meeting-task-editor",
    eyebrow: "5 · НАЗНАЧИТЬ ПОРУЧЕНИЕ",
    title: "Поля поручения уже открыты",
    text: "Ничего искать и раскрывать не нужно: ниже подсвечена первая карточка поручения. В ней выберите зарегистрированного коллегу, при необходимости укажите срок, добавьте комментарий и измените статус — например, «Черновик» или «В работе». Нажмите «Далее», чтобы перейти к доске поручений.",
  },
  {
    target: "tasks-board",
    eyebrow: "6 · ДОСКА ПОРУЧЕНИЙ",
    title: "Ведите работу на доске",
    text: "Здесь поручения сгруппированы по статусам. Перетащите карточку между колонками или измените статус в самой карточке. Фильтры сверху помогают сосредоточиться на отделе, исполнителе или просроченных задачах.",
  },
  {
    target: "side-calendar",
    eyebrow: "7 · КАЛЕНДАРЬ",
    title: "Откройте календарь поручений",
    text: "Пункт «Календарь» находится в левом меню. Он открывает сроки всех поручений и задачи без даты. Нажмите «Далее» — я покажу сами режимы календаря.",
  },
  {
    target: "tasks-calendar",
    eyebrow: "8 · РЕЖИМЫ КАЛЕНДАРЯ",
    title: "Планируйте сроки в удобном виде",
    text: "В календаре можно переключать месяц, неделю, день и список. Поручения без срока находятся сверху. Нажмите любую задачу, чтобы задать исполнителя, дату, статус и комментарий.",
  },
  {
    target: "side-notifications",
    eyebrow: "9 · УВЕДОМЛЕНИЯ",
    title: "Откройте уведомления",
    text: "Пункт «Уведомления» находится в левом меню. Здесь появляются новые назначения, приглашения и напоминания. Нажмите «Далее» — я открою ленту уведомлений.",
  },
  {
    target: "notifications",
    eyebrow: "10 · ЛЕНТА УВЕДОМЛЕНИЙ",
    title: "Не пропускайте изменения",
    text: "Уведомления собирают новые назначения, приглашения и напоминания. Их можно просмотреть в ленте или отметить все прочитанными кнопкой вверху. К значку «?» можно вернуться в любой момент.",
  },
];

function WorkspaceTour({ step, onStep, onClose }: { step: number; onStep: (step: number) => void; onClose: () => void }) {
  const current = workspaceTourSteps[step];
  const last = step === workspaceTourSteps.length - 1;
  const [rect, setRect] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    let target: HTMLElement | null = null;
    const selector = `[data-tour-target="${current.target}"]`;
    const update = () => target && setRect(target.getBoundingClientRect());
    const activate = () => {
      const nextTarget = document.querySelector<HTMLElement>(selector);
      if (!nextTarget) {
        if (!target) setRect(null);
        return;
      }
      if (target !== nextTarget) {
        target?.classList.remove("workspace-tour-highlight");
        target = nextTarget;
        target.classList.add("workspace-tour-highlight");
        target.scrollIntoView({ behavior: "auto", block: "center", inline: "nearest" });
      }
      update();
    };
    const observer = new MutationObserver(activate);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setTimeout(activate, 0);
    const followUpTimer = window.setTimeout(activate, 180);
    activate();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(followUpTimer);
      observer.disconnect();
      target?.classList.remove("workspace-tour-highlight");
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [current.target]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  const spotlight = rect ? { top: Math.max(8, rect.top - 8), left: Math.max(8, rect.left - 8), right: Math.min(window.innerWidth - 8, rect.right + 8), bottom: Math.min(window.innerHeight - 8, rect.bottom + 8) } : null;
  return <div className={`publication-modal workspace-guide workspace-tour workspace-tour--${current.target}`} role="dialog" aria-modal="true" aria-labelledby="workspace-guide-title" onClick={onClose}>
    {spotlight && <><span className="workspace-tour__shade" aria-hidden="true" style={{ inset: `0 0 ${Math.max(0, window.innerHeight - spotlight.top)}px 0` }} /><span className="workspace-tour__shade" aria-hidden="true" style={{ top: spotlight.top, left: 0, right: Math.max(0, window.innerWidth - spotlight.left), bottom: Math.max(0, window.innerHeight - spotlight.bottom) }} /><span className="workspace-tour__shade" aria-hidden="true" style={{ top: spotlight.top, left: spotlight.right, right: 0, bottom: Math.max(0, window.innerHeight - spotlight.bottom) }} /><span className="workspace-tour__shade" aria-hidden="true" style={{ top: spotlight.bottom, left: 0, right: 0, bottom: 0 }} /><span className="workspace-tour__spotlight" aria-hidden="true" style={{ top: spotlight.top, left: spotlight.left, width: spotlight.right - spotlight.left, height: spotlight.bottom - spotlight.top }} /></>}
    <section onClick={(event) => event.stopPropagation()}>
      <button className="modal-close" type="button" aria-label="Закрыть инструкцию" onClick={onClose}><X size={18} /></button>
      <div className="workspace-guide__progress" aria-label={`Шаг ${step + 1} из ${workspaceTourSteps.length}`}>
        {workspaceTourSteps.map((_, index) => <i key={index} className={index <= step ? "active" : ""} />)}
      </div>
      <small>{current.eyebrow}</small>
      <h3 id="workspace-guide-title">{current.title}</h3>
      <p>{current.text}</p>
      <footer className="workspace-guide__actions">
        <button className="text-btn" type="button" onClick={onClose}>Закрыть</button>
        <div>
          {step > 0 && <button className="outline" type="button" onClick={() => onStep(step - 1)}>Назад</button>}
          <button className="primary" type="button" onClick={() => last ? onClose() : onStep(step + 1)}>{last ? "Готово" : "Далее"}</button>
        </div>
      </footer>
    </section>
  </div>;
}

function AdminDepartments({ org, onOrganizationChanged }: { org: Org; onOrganizationChanged: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const createDepartment = async () => {
    setSaving(true);
    setMessage("");
    try {
      await api("/departments", {
        method: "POST",
        body: JSON.stringify({ organizationId: org.id, name }),
      });
      setName("");
      setAddOpen(false);
      await onOrganizationChanged();
      setMessage("Отдел добавлен. Он уже доступен в навигации и при назначении коллег.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Не удалось создать отдел");
    } finally {
      setSaving(false);
    }
  };
  const updateDepartment = async (departmentId: string) => {
    if (editingName.trim().length < 2) return;
    setSaving(true);
    setMessage("");
    try {
      await api(`/departments/${departmentId}`, {
        method: "PUT",
        body: JSON.stringify({ organizationId: org.id, name: editingName.trim() }),
      });
      setEditingId(null);
      await onOrganizationChanged();
      setMessage("Название отдела обновлено.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Не удалось обновить отдел");
    } finally {
      setSaving(false);
    }
  };
  const deleteDepartment = async (department: { id: string; name: string }) => {
    if (!window.confirm(`Удалить отдел «${department.name}»? Это возможно только если в нём нет сотрудников и встреч.`)) return;
    setSaving(true);
    setMessage("");
    try {
      await api(`/departments/${department.id}`, {
        method: "DELETE",
        body: JSON.stringify({ organizationId: org.id }),
      });
      await onOrganizationChanged();
      setMessage("Отдел удалён.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Не удалось удалить отдел");
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="departments-admin">
      <div className="departments-admin__header">
        <p>Отделы разделяют встречи, задачи и доступ сотрудников внутри организации.</p>
        <button className="outline" onClick={() => { setAddOpen((open) => !open); setEditingId(null); }}>
          <Plus size={16} /> {addOpen ? "Закрыть" : "Добавить отдел"}
        </button>
      </div>
      <div className="department-list" aria-label="Текущие отделы">
        {org.departments.map((department) => (
          <div className="department-row" key={department.id}>
            {editingId === department.id ? (
              <input
                autoFocus
                aria-label={`Новое название отдела ${department.name}`}
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") updateDepartment(department.id); if (e.key === "Escape") setEditingId(null); }}
              />
            ) : <strong>{department.name}</strong>}
            <div className="department-row__actions">
              {editingId === department.id ? <>
                <button className="icon-button" title="Сохранить название" aria-label={`Сохранить название отдела ${department.name}`} disabled={saving || editingName.trim().length < 2} onClick={() => updateDepartment(department.id)}><Check size={16} /></button>
                <button className="icon-button" title="Отменить" aria-label="Отменить редактирование" onClick={() => setEditingId(null)}><X size={16} /></button>
              </> : <>
                <button className="icon-button" title="Редактировать отдел" aria-label={`Редактировать отдел ${department.name}`} onClick={() => { setEditingId(department.id); setEditingName(department.name); setAddOpen(false); }}><Pencil size={16} /></button>
                <button className="icon-button danger" title="Удалить отдел" aria-label={`Удалить отдел ${department.name}`} disabled={saving} onClick={() => deleteDepartment(department)}><Trash2 size={16} /></button>
              </>}
            </div>
          </div>
        ))}
      </div>
      {addOpen && <div className="department-create">
        <label>
          <span>Название нового отдела</span>
          <input
            value={name}
            placeholder="Например, Маркетинг"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && name.trim().length >= 2) createDepartment(); }}
          />
        </label>
        <button className="primary" disabled={saving || name.trim().length < 2} onClick={createDepartment}>
          <Plus size={16} /> {saving ? "Добавляем…" : "Добавить отдел"}
        </button>
      </div>}
      {message && <p className={message.startsWith("Отдел") || message.startsWith("Название") ? "success" : "error"}>{message}</p>}
    </section>
  );
}

function AdminMembers({ org }: { org: Org }) {
  const [items, setItems] = useState<any[]>([]),
    [form, setForm] = useState({
      email: "",
      role: "MEMBER",
      departmentId: org.departments[0]?.id || "",
    }),
    [message, setMessage] = useState("");
  const load = () =>
    api<any[]>(`/admin/memberships?organizationId=${org.id}`).then(setItems);
  useEffect(() => {
    load();
  }, [org.id]);
  const save = async () => {
    try {
      await api("/admin/memberships", {
        method: "PUT",
        body: JSON.stringify({ organizationId: org.id, ...form }),
      });
      setMessage("Роль сохранена");
      setForm({ ...form, email: "" });
      load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Ошибка");
    }
  };
  return (
    <section className="members-admin">
      <h2>Коллеги и роли</h2>
      <p>
        Добавьте зарегистрированного сотрудника в организацию или измените его
        роль.
      </p>
      <div className="member-form">
        <input
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="email сотрудника"
        />
        <ChoiceMenu
          label="Роль сотрудника"
          value={form.role}
          onChange={(role) => setForm({ ...form, role })}
          options={["ADMIN", "DEPARTMENT_HEAD", "MEMBER", "GUEST"].map((role) => ({ value: role, label: roleName[role] }))}
        />
        <ChoiceMenu
          label="Отдел сотрудника"
          value={form.departmentId}
          onChange={(departmentId) => setForm({ ...form, departmentId })}
          options={org.departments.map((department) => ({ value: department.id, label: department.name }))}
        />
        <button className="primary" onClick={save}>
          Сохранить роль
        </button>
      </div>
      {message && (
        <p className={message === "Роль сохранена" ? "success" : "error"}>
          {message}
        </p>
      )}
      <div className="member-list">
        {items.map((item) => (
          <p key={item.id}>
            <b>{item.user.name}</b> · {item.user.email}{" "}
            <span>{roleName[item.role]}</span>{" "}
            <small>{item.department?.name || "Все отделы"}</small>
          </p>
        ))}
      </div>
    </section>
  );
}

function AdminIntegrations({ organizationId, organizationName }: { organizationId: string; organizationName:string }) {
  const [keyUsage,setKeyUsage]=useState<any>(null);
  useEffect(()=>{void api('/ai/usage?organizationId='+organizationId).then(setKeyUsage).catch(()=>setKeyUsage(null));},[organizationId]);
  const [items, setItems] = useState<any[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [openGroup, setOpenGroup] = useState<"ai" | "email" | null>(() => new URLSearchParams(window.location.search).get("section") === "integrations" ? "ai" : null);
  const load = () =>
    api<any[]>(`/admin/integrations?organizationId=${organizationId}`).then(
      setItems,
    );
  useEffect(() => {
    load();
  }, [organizationId]);
  const save = async (key: string) => {
    const item = items.find((entry) => entry.key === key);
    const isSecret = key.includes("key") || key.includes("password");
    await api(`/admin/integrations/${key}?organizationId=${organizationId}`, {
      method: "PUT",
      body: JSON.stringify({
        value: values[key] ?? (isSecret ? "" : item?.value || ""),
      }),
    });
    setValues({ ...values, [key]: "" });
    load();
    if(key==='openai_api_key'&&sessionStorage.getItem('secretary-return')){
      const saved=JSON.parse(sessionStorage.getItem('secretary-return')||'{}');
      const target=new URL(saved.url||location.pathname,location.origin);target.searchParams.delete('surface');target.searchParams.delete('section');if(saved.meetingId)target.searchParams.set('meeting',saved.meetingId);location.assign(target.href);
    }
  };
  const labels: Record<string, string> = {
    openai_api_key: "OpenAI API-ключ",
    report_image_limit:'Максимум AI-иллюстраций в отчёте',
    analysis_model: "Модель анализа",
    whisper_model: "Whisper-модель",
    smtp_host: "SMTP сервер",
    smtp_port: "SMTP порт",
    smtp_user: "SMTP логин",
    smtp_password: "SMTP пароль",
    smtp_from: "Адрес отправителя",
  };
  const descriptions: Record<string, string> = {
    openai_api_key: "Ключ организации для анализа заметок и расшифровки аудио.",
    report_image_limit:'По умолчанию 2. Для демо применяется отдельный предел из Dev-консоли.',
    analysis_model: "Формирует резюме, решения, поручения и ответы по встрече.",
    whisper_model: "Преобразует загруженные аудиозаписи в текст.",
    smtp_host: "Адрес SMTP-сервера почтового провайдера.",
    smtp_port: "Обычно 465 или 587 — уточните у почтового провайдера.",
    smtp_user: "Логин почтового ящика или SMTP-пользователь.",
    smtp_password: "Пароль приложения или SMTP-токен, а не пароль от почты.",
    smtp_from: "Адрес, от имени которого команда будет получать письма.",
  };
  const getItem = (key: string) =>
    items.find((item) => item.key === key) || { key, value: "" };
  const renderField = (key: string) => {
    const item = getItem(key);
    const isSecret = key.includes("key") || key.includes("password");
    const modelOptions =
      key === "analysis_model"
        ? analysisModelOptions
        : key === "whisper_model"
          ? transcriptionModelOptions
          : null;
    return (
      <label className="integration-field" key={key}>
        <span>{labels[key]}</span>
        <small>{descriptions[key]}</small>
        <div>
          {modelOptions ? (
            <select
              value={values[key] ?? item.value ?? modelOptions[0].id}
              onChange={(e) => setValues({ ...values, [key]: e.target.value })}
            >
              {!modelOptions.some((option) => option.id === item.value) && item.value && (
                <option value={item.value}>{item.value} — текущая модель</option>
              )}
              {modelOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label} — {option.note}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={isSecret ? "password" : key === "smtp_port" ? "number" : "text"}
              placeholder={isSecret && item.value ? "Секрет сохранён" : item.value || "Не настроено"}
              value={values[key] ?? (isSecret ? "" : item.value || "")}
              onChange={(e) => setValues({ ...values, [key]: e.target.value })}
            />
          )}
          <button
            className="outline"
            disabled={isSecret && !values[key]}
            onClick={() => save(key)}
          >
            Сохранить
          </button>
        </div>
      </label>
    );
  };
  return (
    <section className="integrations">
      <h2>Подключения организации</h2>
      <p role="status">Настройки пространства «{organizationName}». Сохранённый ключ применяется только к этому пространству.</p>
      {keyUsage?.demo&&keyUsage.platformKeyEnabled&&<p className="cloud-key-location">Сейчас демо использует ключ платформы из консоли. Поле ниже хранит собственный ключ этого пространства; он применяется при выключенной настройке «Использовать ключ платформы».</p>}
      <p>
        Настройте только те сервисы, которые нужны вашей команде. Секреты не
        отображаются после сохранения и передаются только на сервере.
      </p>
      <ol className="integration-steps">
        <li>Для AI укажите ключ OpenAI и выберите модели.</li>
        <li>Для писем заполните SMTP-данные своего почтового провайдера.</li>
        <li>Сохраняйте каждое поле отдельно — подключение начнёт работать сразу.</li>
      </ol>
      <details className="integration-group" open={openGroup === "ai"} onToggle={(event) => setOpenGroup((event.currentTarget as HTMLDetailsElement).open ? "ai" : null)}>
        <summary><span><Sparkles size={18} /><span><h3>AI-обработка встреч</h3><p>Ключ OpenAI и модели для расшифровки и протокола.</p></span></span><ChevronDown size={17} /></summary>
        <div className="integration-grid">
          {renderField("openai_api_key")}
          {renderField("analysis_model")}
          {renderField("whisper_model")}
          {renderField("report_image_limit")}
        </div>
      </details>
      <details className="integration-group" open={openGroup === "email"} onToggle={(event) => setOpenGroup((event.currentTarget as HTMLDetailsElement).open ? "email" : null)}>
        <summary><span><Mail size={18} /><span><h3>Email-уведомления</h3><p>Необязательно: SMTP для приглашений и напоминаний.</p></span></span><ChevronDown size={17} /></summary>
        <div className="integration-grid">
          {renderField("smtp_host")}
          {renderField("smtp_port")}
          {renderField("smtp_user")}
          {renderField("smtp_password")}
          {renderField("smtp_from")}
        </div>
      </details>
    </section>
  );
}

function Dev({ onBack }: { onBack: () => void }) {
  const [developerAccess,setDeveloperAccess]=useState<{mode:string;canManageDemo:boolean}>({mode:'',canManageDemo:false});
  const devAccessAttempt=useRef(0);
  const [authorized, setAuthorized] = useState(false),
    [items, setItems] = useState<any[]>([]),
    [values, setValues] = useState<Record<string, string>>({}),
    [revealed, setRevealed] = useState<Record<string, boolean>>({}),
    [cleared, setCleared] = useState<Record<string, boolean>>({}),
    [tab, setTab] = useState("keys"),
    [password, setPassword] = useState(""),
    [passwordVisible, setPasswordVisible] = useState(false),
    [error, setError] = useState(""),
    [theme, setTheme] = useState(localStorage.getItem("secretary-theme") || "light"),
    [organizations, setOrganizations] = useState<any[]>([]),
    [catalogOrgId, setCatalogOrgId] = useState(""),
    [catalog, setCatalog] = useState<{ analysis: string[]; transcription: string[]; updatedAt?: string | null }>({ analysis: [], transcription: [] }),
    [refreshingModels, setRefreshingModels] = useState(false),
    [modelError, setModelError] = useState(""),
    [verification, setVerification] = useState<Record<string, { ok: boolean; message: string }>>({}),
    [checking, setChecking] = useState<Record<string, boolean>>({}),
    [resetting, setResetting] = useState<Record<string, boolean>>({}),
    [resetStatus, setResetStatus] = useState<Record<string, { ok: boolean; message: string }>>({}),
    [demoMode, setDemoMode] = useState(false);
  const [fontScale, setFontScale] = useState(() => Number(localStorage.getItem("secretary-font-scale") || 100));
  const [fontMenuOpen, setFontMenuOpen] = useState(false);
  const publicDemoReadOnly = developerAccess.mode==='demo' || (demoMode && !developerAccess.canManageDemo && !["localhost", "127.0.0.1"].includes(window.location.hostname));
  const [confirmWorkspaceSignIn, setConfirmWorkspaceSignIn] = useState(false);
  const catalogOrganizations = modelCatalogOrganizations(organizations);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("secretary-theme", theme);
  }, [theme]);
  useEffect(() => {
    const safeScale = [90, 100, 115, 130].includes(fontScale) ? fontScale : 100;
    document.documentElement.style.setProperty("--interface-scale", String(safeScale / 100));
    localStorage.setItem("secretary-font-scale", String(safeScale));
  }, [fontScale]);
  useEffect(() => {
    const refreshDemoMode = () => {
      api<{ enabled: boolean }>("/demo-mode").then((state) => setDemoMode(state.enabled)).catch(() => undefined);
    };
    refreshDemoMode();
    const timer = window.setInterval(refreshDemoMode, 10_000);
    window.addEventListener("focus", refreshDemoMode);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refreshDemoMode); };
  }, []);
  const load = (passwordOverride?:string) => {
    const attempt=devAccessAttempt.current;
    return Promise.all([dev<any[]>("/developer/settings",{},passwordOverride),dev<{mode:string;canManageDemo:boolean}>('/developer/access',{},passwordOverride)])
      .then(([x,access]) => {
        if(attempt!==devAccessAttempt.current)return;
        setItems(x);
        setDeveloperAccess(access);
        setAuthorized(true);
      })
      .catch((e) => {
        if(attempt!==devAccessAttempt.current)return;
        sessionStorage.removeItem("secretary-dev-password");
        api<{ enabled: boolean }>("/demo-mode").then((state) => setDemoMode(state.enabled)).catch(() => undefined);
        setError(e.message);
      });
  };
  useEffect(()=>{
    if(!sessions.workingToken()||sessionStorage.getItem('secretary-dev-password')==='1234')return;
    let active=true;
    const attempt=devAccessAttempt.current;
    dev<{mode:string;canManageDemo:boolean}>('/developer/access',{},'').then(access=>{
      if(active&&attempt===devAccessAttempt.current&&access.mode==='owner'){
        sessionStorage.removeItem('secretary-dev-password');
        void load('');
      }
    }).catch(()=>undefined);
    return()=>{active=false;};
  },[]);
  const unlock = () => {
    devAccessAttempt.current++;
    setError("");
    if (!password) {
      setError("Введите пароль Dev-консоли.");
      return;
    }
    sessionStorage.setItem("secretary-dev-password", password);
    load();
  };
  useEffect(() => {
    if (authorized) load();
  }, [authorized]);
  useEffect(() => {
    if (!authorized) return;
    dev<any[]>("/developer/organizations").then((orgs) => {
      setOrganizations(orgs);
      const workingOrgs = modelCatalogOrganizations(orgs);
      setCatalogOrgId((current) =>
        workingOrgs.some((organization) => organization.id === current) ? current : workingOrgs[0]?.id || "",
      );
    });
  }, [authorized]);
  useEffect(() => {
    if (!catalogOrgId) return;
    dev<{ analysis: string[]; transcription: string[]; updatedAt?: string | null }>(
      `/developer/model-catalog?organizationId=${catalogOrgId}`,
    ).then(setCatalog);
  }, [catalogOrgId]);
  if (!authorized)
    return (
      <section className="secure-gate secure-gate--developer" aria-labelledby="dev-gate-title">
        <button className="back secure-gate__back" onClick={onBack}>
          ← К рабочему пространству
        </button>
        <div className="secure-gate__card">
          <div className="secure-gate__mark" aria-hidden="true">
            <Lock size={19} />
          </div>
          <h1 id="dev-gate-title">Dev-консоль</h1>
          <p>
            Закрытая среда для технической конфигурации, аудита, лимитов и
            диагностики платформы.
          </p>
          {demoMode && <div className="secure-gate__demo-note" role="note">
            <div className="secure-gate__demo-heading"><span>Учебный доступ</span><b>1234</b></div>
            <p>Демо-режим включён. Можно войти с учебным кодом или сохранённым паролем разработчика.</p>
          </div>}
          <label className="secure-gate__field">
            <span>Пароль доступа</span>
            <span className="secure-gate__password-input">
              <input
                type={passwordVisible ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setError("");
                  setPassword(e.target.value);
                }}
                placeholder="Введите пароль"
                autoComplete="current-password"
                onKeyDown={(e) => e.key === "Enter" && unlock()}
              />
              {password && <button type="button" className="secure-gate__password-action secure-gate__password-action--clear" aria-label="Очистить пароль" title="Очистить пароль" onClick={() => { setPassword(""); setError(""); }}><X size={15} /></button>}
              <button type="button" className="secure-gate__password-action" aria-label={passwordVisible ? "Скрыть пароль" : "Показать пароль"} title={passwordVisible ? "Скрыть пароль" : "Показать пароль"} onClick={() => setPasswordVisible(!passwordVisible)}>{passwordVisible ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </span>
          </label>
          <button className="primary secure-gate__submit" onClick={unlock}>
            Войти в Dev-консоль
          </button>
          {error && !error.startsWith("Вход временно заблокирован") && <p className="error secure-gate__error" role="alert">{error}</p>}
          <p className="secure-gate__account-note">Для рабочего аккаунта используется отдельный пароль.</p>
          <a className="secure-gate__owner-login" href={developerOwnerLoginUrl()}>Войти владельцу по email и паролю <ArrowUpRight size={15}/></a>
        </div>
      </section>
    );
  const save = async (key: string) => {
    await dev(`/developer/settings/${key}`, {
      method: "PUT",
      body: JSON.stringify({
        value: key === "developer_openai_api_key"
          ? values[key] ?? ""
          : values[key] ?? items.find((item) => item.key === key)?.value ?? "",
      }),
    });
    setValues((current) => { const next = { ...current }; delete next[key]; return next; });
    setRevealed({ ...revealed, [key]: false });
    setCleared({ ...cleared, [key]: false });
    if (key === "developer_openai_api_key") {
      setVerification({});
      setModelError("");
    }
    load();
  };
  const resetDefault = async (key: string, defaultValue: string) => {
    setResetting((current) => ({ ...current, [key]: true }));
    setResetStatus((current) => { const next = { ...current }; delete next[key]; return next; });
    try {
      await dev(`/developer/settings/${key}`, {
        method: "PUT",
        body: JSON.stringify({ value: defaultValue }),
      });
      setValues((current) => { const next = { ...current }; delete next[key]; return next; });
      setVerification((current) => { const next = { ...current }; delete next[key]; return next; });
      await load();
      setResetStatus((current) => ({ ...current, [key]: { ok: true, message: "Значение по умолчанию восстановлено." } }));
    } catch (e) {
      setResetStatus((current) => ({ ...current, [key]: { ok: false, message: e instanceof Error ? e.message : "Не удалось восстановить настройку." } }));
    } finally {
      setResetting((current) => ({ ...current, [key]: false }));
    }
  };
  const toggleSecret = (key: string) => {
    setRevealed({ ...revealed, [key]: !revealed[key] });
  };
  const clearSecret = (key: string) => {
    const hasDraft = Boolean(values[key]);
    setValues({ ...values, [key]: "" });
    setCleared({ ...cleared, [key]: !hasDraft && Boolean(items.find((item) => item.key === key)?.value) });
    setRevealed({ ...revealed, [key]: false });
  };
  const refreshModelCatalog = async () => {
    if (!catalogOrgId) return;
    setRefreshingModels(true);
    setModelError("");
    try {
      const next = await dev<{ analysis: string[]; transcription: string[]; updatedAt?: string }>(
        "/developer/model-catalog/refresh",
        { method: "POST", body: JSON.stringify({ organizationId: catalogOrgId }) },
      );
      setCatalog(next);
    } catch (e) {
      setModelError(e instanceof Error ? e.message : "Не удалось обновить модели");
    } finally {
      setRefreshingModels(false);
    }
  };
  const verifySetting = async (key: string, fallbackValue: string) => {
    if (!catalogOrgId) return;
    setChecking({ ...checking, [key]: true });
    setVerification({ ...verification, [key]: undefined as never });
    try {
      const result = await dev<{ ok: true; message: string }>(`/developer/settings/${key}/verify`, {
        method: "POST",
        body: JSON.stringify({ organizationId: catalogOrgId, value: values[key] ?? fallbackValue }),
      });
      setVerification({ ...verification, [key]: { ok: true, message: result.message } });
    } catch (e) {
      setVerification({ ...verification, [key]: { ok: false, message: e instanceof Error ? e.message : "Проверка не пройдена" } });
    } finally {
      setChecking({ ...checking, [key]: false });
    }
  };
  const developerKey = items.find((item) => item.key === "developer_openai_api_key");
  return (
    <main className="dev-surface">
      <header className="dev-surface__bar">
        <div className="dev-surface__navigation"><button className="back" onClick={onBack}>
          ← К рабочему пространству
        </button>
        <a className="back" href={developerOwnerLoginUrl()}>Войти владельцу по email и паролю</a></div>
        <div className="dev-surface__identity">
          <span>СтеноГРАФ</span>
          <b>DEV CONSOLE</b>
        </div>
        <div className="dev-surface__actions">
          <div className="font-control">
            <button
              className="dev-surface__theme"
              onClick={() => setFontMenuOpen(!fontMenuOpen)}
              title="Размер текста"
              aria-label="Настроить размер текста"
              aria-expanded={fontMenuOpen}
            >
              <Type size={17} />
            </button>
            {fontMenuOpen && (
              <div className="font-control__menu" role="dialog" aria-label="Размер текста">
                <div><strong>Размер текста</strong><span>{fontScale}%</span></div>
                <div className="font-control__choices">
                  {[90, 100, 115, 130].map((scale) => (
                    <button key={scale} className={fontScale === scale ? "selected" : ""} onClick={() => setFontScale(scale)}>{scale}%</button>
                  ))}
                </div>
                <button className="font-control__reset" onClick={() => setFontScale(100)} disabled={fontScale === 100}>
                  <RotateCcw size={14} /> По умолчанию
                </button>
              </div>
            )}
          </div>
          <button
            className="dev-surface__theme"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            title={theme === "light" ? "Включить тёмную тему" : "Включить светлую тему"}
            aria-label={theme === "light" ? "Включить тёмную тему" : "Включить светлую тему"}
          >
            {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
          </button>
        </div>
      </header>
      <section className="dev">
      {developerAccess.mode==='demo' && <aside className="dev-demo-banner" role="status"><Lock size={20} aria-hidden="true"/><div><strong>Демо-режим консоли</strong><p>Учебный вход по коду 1234. Управление демо-режимом и ключом платформы доступно только владельцу.</p><a href={developerOwnerLoginUrl()}>Войти владельцу по email и паролю <ArrowUpRight size={14}/></a></div></aside>}
      {developerAccess.mode==='owner' && <p className="dev-owner-session"><CheckCircle2 size={16} aria-hidden="true"/> Рабочий доступ владельца</p>}
      <p className="dev-owner-session" role="status">Контур приложения: <strong>{demoMode?'Демо':'Рабочий'}</strong></p>
      <header>
        <h1>Провайдеры и секреты</h1>
      </header>
      <section className="model-catalog" aria-label="Обновление списка моделей">
        <div>
          <strong>Каталог моделей OpenAI</strong>
          <span>
            {catalog.updatedAt
              ? `Проверен ${date(catalog.updatedAt)}`
              : "Ещё не обновлялся"}
          </span>
        </div>
        <div className="model-catalog__organization">
          <select
            aria-label="Организация для обновления моделей"
            value={catalogOrgId}
            onChange={(e) => {
              if (e.target.value === "__workspace_sign_in__") setConfirmWorkspaceSignIn(true);
              else setCatalogOrgId(e.target.value);
            }}
          >
            {!catalogOrganizations.length && <option value="">Нет рабочих организаций</option>}
            {catalogOrganizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}{organization.isCurrentDemo ? " · текущий браузер" : ""}
              </option>
            ))}
            <option value="__workspace_sign_in__">Рабочее пространство — войти</option>
          </select>
          <button
            type="button"
            className="model-help"
            aria-label="Как выбрать организацию для обновления моделей"
            data-tooltip="Выберите организацию для обновления моделей. «Рабочее пространство — войти» откроет подтверждение перехода к входу по email и паролю аккаунта. Демо других посетителей скрыты. Для моделей используется ключ организации, а при его отсутствии — ключ разработчика."
          >
            <Info size={15} />
          </button>
        </div>
        <button
          className="outline model-catalog__refresh"
          onClick={refreshModelCatalog}
          disabled={refreshingModels || !catalogOrgId}
        >
          <RefreshCw size={15} className={refreshingModels ? "spin" : ""} />
          {refreshingModels ? "Обновляем…" : "Ресканировать модели"}
        </button>
        {modelError && <p className="error">{modelError}</p>}
        {confirmWorkspaceSignIn && <WorkspaceSignInDialog onCancel={() => setConfirmWorkspaceSignIn(false)} onConfirm={() => {
          sessionStorage.removeItem("secretary-dev-password");
          window.location.assign(developerOwnerLoginUrl());
        }}/>}
      </section>
      <nav className="tabs">
        <button className={tab==='cloud'?'active':''} onClick={()=>setTab('cloud')}>Облака и демо-лимиты</button>
        <button
          className={tab === "keys" ? "active" : ""}
          onClick={() => setTab("keys")}
        >
          Секреты API
        </button>
        <button
          className={tab === "logs" ? "active" : ""}
          onClick={() => setTab("logs")}
        >
          Журнал аудита
        </button>
        <button
          className={tab === "tester" ? "active" : ""}
          onClick={() => setTab("tester")}
        >
          API-тестер
        </button>
        <button
          className={tab === "orgs" ? "active" : ""}
          onClick={() => setTab("orgs")}
        >
          Организации
        </button>
        <button
          className={tab === "publication" ? "active" : ""}
          onClick={() => setTab("publication")}
        >
          Публикация
        </button>
        <button className={tab === "removal" ? "active" : ""} onClick={() => setTab("removal")}>Удаление с сервера</button>
        <button className={tab === "transfer" ? "active" : ""} onClick={() => setTab("transfer")}>Перенос данных</button>
        {developerAccess.canManageDemo && <button className={tab === "security" ? "active" : ""} onClick={() => setTab("security")}>Безопасность</button>}
      </nav>
      {tab === "keys" && (
        <div className="secrets">
          <section className="model-catalog__key developer-key-section" aria-label="Ключ разработчика OpenAI">
            <DeveloperKeyHeading />
            <div className="secret-input"><input disabled={publicDemoReadOnly} type={revealed.developer_openai_api_key ? "text" : "password"} value={values.developer_openai_api_key ?? ""} placeholder={developerKey?.value ? "Ключ сохранён" : "Вставьте ключ разработчика"} onChange={(e) => { setValues({ ...values, developer_openai_api_key: e.target.value }); setCleared({ ...cleared, developer_openai_api_key: false }); }} />{!publicDemoReadOnly && values.developer_openai_api_key && <button className="secret-action" type="button" onClick={() => toggleSecret("developer_openai_api_key")} title={revealed.developer_openai_api_key ? "Скрыть введённый ключ" : "Показать введённый ключ"} aria-label={revealed.developer_openai_api_key ? "Скрыть введённый ключ" : "Показать введённый ключ"}>{revealed.developer_openai_api_key ? <EyeOff size={16} /> : <Eye size={16} />}</button>}{!publicDemoReadOnly && (developerKey?.value || values.developer_openai_api_key) && <button className="secret-action secret-action--clear" type="button" onClick={() => clearSecret("developer_openai_api_key")} title={values.developer_openai_api_key ? "Очистить введённый ключ" : "Удалить сохранённый ключ"} aria-label={values.developer_openai_api_key ? "Очистить введённый ключ" : "Удалить сохранённый ключ"}><X size={16} /></button>}</div>
            <button className="primary" disabled={publicDemoReadOnly || (!values.developer_openai_api_key && !cleared.developer_openai_api_key)} onClick={() => save("developer_openai_api_key")}>{cleared.developer_openai_api_key ? "Удалить ключ" : "Сохранить ключ"}</button>
          </section>
          <DeveloperCloud compact/>
          {items.filter((x) => ["analysis_model", "whisper_model", "system_prompt"].includes(x.key)).sort((a, b) => ["analysis_model", "whisper_model", "system_prompt"].indexOf(a.key) - ["analysis_model", "whisper_model", "system_prompt"].indexOf(b.key)).map((x) => {
            const isSecret = x.key.includes("key") || x.key.includes("password");
            const modelOptions =
              x.key === "analysis_model"
                ? [
                    ...analysisModelOptions,
                    ...catalog.analysis
                      .filter((id) => !analysisModelOptions.some((option) => option.id === id))
                      .map((id) => ({ id, label: id, note: "Доступно с ключом организации" })),
                  ]
                : x.key === "whisper_model"
                  ? [
                      ...transcriptionModelOptions,
                      ...catalog.transcription
                        .filter((id) => !transcriptionModelOptions.some((option) => option.id === id))
                        .map((id) => ({ id, label: id, note: "Доступно с ключом организации" })),
                    ]
                  : null;
            const info = modelSettingInfo[x.key];
            return <article key={x.key}>
              <div className="setting-heading">
                <h3>{info?.title || x.key.replaceAll("_", " ")}</h3>
                {info && (
                  <button
                    type="button"
                    className="model-help"
                    aria-label={`Что такое «${info.title}»`}
                    data-tooltip={info.text}
                  >
                    <Info size={15} />
                  </button>
                )}
                <button
                  type="button"
                  className="setting-reset"
                  title={x.key === "system_prompt" ? "Восстановить инструкцию по умолчанию" : "Восстановить модель по умолчанию"}
                  aria-label={x.key === "system_prompt" ? "Восстановить инструкцию по умолчанию" : "Восстановить модель по умолчанию"}
                  disabled={resetting[x.key]}
                  onClick={() => resetDefault(x.key, x.defaultValue)}
                >
                  <RotateCcw size={16} className={resetting[x.key] ? "spin" : ""} />
                </button>
              </div>
              <div>
                {x.key === "system_prompt" ? (
                  <textarea
                    value={values[x.key] ?? x.value ?? ""}
                    placeholder="Системная инструкция"
                    onChange={(e) =>
                      setValues({ ...values, [x.key]: e.target.value })
                    }
                  />
                ) : modelOptions ? (
                  <select
                    aria-label={info?.title}
                    value={values[x.key] ?? x.value ?? modelOptions[0].id}
                    onChange={(e) =>
                      setValues({ ...values, [x.key]: e.target.value })
                    }
                  >
                    {!modelOptions.some((option) => option.id === x.value) && x.value && (
                      <option value={x.value}>{x.value} — подключённая модель</option>
                    )}
                    {modelOptions.map((option) => (
                      <option value={option.id} key={option.id}>
                        {option.label} — {option.note}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="secret-input">
                    <input
                      type={isSecret && !revealed[x.key] ? "password" : "text"}
                      value={values[x.key] ?? ""}
                      placeholder={
                        isSecret ? "Введите новый API-ключ" : "Значение"
                      }
                      onChange={(e) => {
                        setValues({ ...values, [x.key]: e.target.value });
                        setCleared({ ...cleared, [x.key]: false });
                      }}
                    />
                    {isSecret && x.value && (
                      <button
                        className="secret-action"
                        type="button"
                        onClick={() => toggleSecret(x.key)}
                        title={revealed[x.key] ? "Скрыть значение" : "Показать значение"}
                        aria-label={revealed[x.key] ? "Скрыть значение" : "Показать значение"}
                      >
                        {revealed[x.key] ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    )}
                    {isSecret && (x.value || values[x.key]) && (
                      <button
                        className="secret-action secret-action--clear"
                        type="button"
                        onClick={() => clearSecret(x.key)}
                        title="Очистить значение"
                        aria-label="Очистить значение"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                )}
                <button className="primary" onClick={() => save(x.key)}>
                  Сохранить
                </button>
                <button
                  className="outline verify-button"
                  onClick={() => verifySetting(x.key, x.value || "")}
                  disabled={checking[x.key] || !catalogOrgId}
                  title="Проверить доступность настройки"
                >
                  {checking[x.key] ? <RefreshCw size={15} className="spin" /> : <CheckCircle2 size={15} />}
                  Проверить
                </button>
              </div>
              {resetStatus[x.key] && <p className={`setting-reset-status${resetStatus[x.key].ok ? "" : " setting-reset-status--error"}`} role="status">{resetStatus[x.key].message}</p>}
              {verification[x.key] && (
                <p className={verification[x.key].ok ? "verify-result success" : "verify-result error"}>
                  {verification[x.key].ok ? <CheckCircle2 size={14} /> : <X size={14} />}
                  {verification[x.key].message}
                </p>
              )}
            </article>;
          })}
        </div>
      )}
      {tab === 'cloud' && <DeveloperCloud/>}
      {tab === "logs" && <Logs />}
      {tab === "tester" && <ApiTester />}
      {tab === "orgs" && <DeveloperOrganizations readOnlyDemo={publicDemoReadOnly} />}
      {tab === "publication" && <PublicationProfiles readOnlyDemo={demoMode && !["localhost", "127.0.0.1"].includes(window.location.hostname)} />}
      {tab === "removal" && <ServerRemoval readOnlyDemo={publicDemoReadOnly} />}
      {tab === "transfer" && <KnowledgeTransfer organizations={catalogOrganizations} readOnlyDemo={!developerAccess.canManageDemo} />}
      {tab === "security" && developerAccess.canManageDemo && <DeveloperSecurity demoMode={demoMode} onDemoModeChange={setDemoMode} />}
      </section>
    </main>
  );
}
function DeveloperKeyHeading() {
  return <div className="developer-key-heading">
    <strong>Ключ разработчика OpenAI</strong>
    <details className="developer-key-info">
      <summary aria-label="О ключе разработчика OpenAI" title="О ключе разработчика OpenAI"><Info size={15} /></summary>
      <p>Используется для диагностики и каталога моделей, а также для обработки встреч только в активном демо-пространстве. Для обычных организаций по-прежнему нужен их собственный ключ OpenAI.</p>
    </details>
  </div>;
}
function Logs() {
  type AuditFilters = { q: string; organizationId: string; action: string; from: string; to: string };
  type AuditPage = { items: any[]; total: number; page: number; pageSize: number; actions: string[]; organizations: { id: string; name: string }[] };
  const emptyFilters: AuditFilters = { q: "", organizationId: "", action: "", from: "", to: "" };
  const [filters, setFilters] = useState<AuditFilters>(emptyFilters);
  const [applied, setApplied] = useState<AuditFilters>(emptyFilters);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<AuditPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const query = (values: AuditFilters) => new URLSearchParams(Object.entries(values).filter(([, value]) => value)).toString();
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    dev<AuditPage>(`/developer/logs?${query(applied)}&page=${page}`)
      .then((data) => { if (active) setResult(data); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Не удалось загрузить журнал."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [applied, page]);
  const exportFiltered = async () => {
    setExporting(true);
    setError("");
    try {
      const response = await fetch(`${API}/developer/logs/export?${query(applied)}`, {
        headers: { "x-dev-password": sessionStorage.getItem("secretary-dev-password") || "" },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Не удалось скачать журнал.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `stenograf-audit-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось скачать журнал.");
    } finally { setExporting(false); }
  };
  const groups = (result?.items || []).reduce<Record<string, any[]>>((byDay, item) => {
    const day = new Date(item.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
    (byDay[day] ||= []).push(item);
    return byDay;
  }, {});
  return (
    <section className="logs">
      <header className="logs__heading"><div><h2>Журнал аудита</h2><p>Фильтруйте события по организации, действию и дате. CSV содержит все записи, подходящие под фильтр.</p></div><button className="outline" type="button" disabled={exporting || !result?.total} onClick={exportFiltered}><FileText size={15} />{exporting ? "Готовим файл…" : "Скачать CSV"}</button></header>
      <form className="logs__filters" onSubmit={(event) => { event.preventDefault(); setPage(1); setApplied({ ...filters }); }}>
        <label>Поиск<input value={filters.q} placeholder="Действие, объект или исполнитель" onChange={(event) => setFilters({ ...filters, q: event.target.value })} /></label>
        <label>Организация<select value={filters.organizationId} onChange={(event) => setFilters({ ...filters, organizationId: event.target.value })}><option value="">Все организации</option><option value="system">Системные события</option>{result?.organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select></label>
        <label>Действие<select value={filters.action} onChange={(event) => setFilters({ ...filters, action: event.target.value })}><option value="">Все действия</option>{result?.actions.map((action) => <option key={action} value={action}>{action}</option>)}</select></label>
        <label>С даты<input type="date" value={filters.from} max={filters.to || undefined} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /></label>
        <label>По дату<input type="date" value={filters.to} min={filters.from || undefined} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /></label>
        <div className="logs__filter-actions"><button type="submit" className="primary">Показать</button><button type="button" className="outline" onClick={() => { setFilters(emptyFilters); setApplied(emptyFilters); setPage(1); }}>Сбросить</button></div>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="logs__summary" aria-live="polite">{loading ? "Загружаем события…" : `Найдено: ${result?.total ?? 0} · Страница ${page} из ${Math.max(1, Math.ceil((result?.total || 0) / (result?.pageSize || 25)))}`}</div>
      {!loading && !error && !result?.items.length && <p className="logs__empty">По выбранным условиям событий нет.</p>}
      {!loading && Object.entries(groups).map(([day, items], index) => <details className="logs__day" key={`${page}-${day}`} open={index === 0}><summary><span>{day}</span><small>{items.length} событий на этой странице</small><ChevronDown size={16} /></summary><div className="logs__entries">{items.map((item) => <article key={item.id}><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time><div><strong>{item.action}</strong><span>{item.entity}{item.entityId ? ` · ${item.entityId}` : ""}</span></div><span>{item.organization?.name || "система"}</span><span>{item.actor?.name || item.actor?.email || "система"}</span></article>)}</div></details>)}
      <nav className="logs__pagination" aria-label="Страницы журнала"><button className="outline" disabled={loading || page <= 1} onClick={() => setPage(page - 1)}>← Назад</button><span>{page} / {Math.max(1, Math.ceil((result?.total || 0) / (result?.pageSize || 25)))}</span><button className="outline" disabled={loading || page >= Math.ceil((result?.total || 0) / (result?.pageSize || 25))} onClick={() => setPage(page + 1)}>Далее →</button></nav>
    </section>
  );
}
function ApiTester() {
  const [route, setRoute] = useState("/health"),
    [result, setResult] = useState(""),
    [error, setError] = useState("");
  const run = async () => {
    setError("");
    try {
      const response = await dev<any>("/developer/api-tester", {
        method: "POST",
        body: JSON.stringify({ method: "GET", route }),
      });
      setResult(JSON.stringify(response, null, 2));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    }
  };
  return (
    <section className="tester">
      <h2>API-тестер</h2>
      <p>
        Безопасная диагностика доступных служебных маршрутов без передачи
        пользовательских данных.
      </p>
      <div>
        <select value={route} onChange={(e) => setRoute(e.target.value)}>
          <option>/health</option>
          <option>/developer/logs</option>
        </select>
        <button className="primary" onClick={run}>
          Выполнить GET
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <pre className="code">
        {result || "Результат запроса появится здесь."}
      </pre>
    </section>
  );
}

type DemoFeatures = { publicAccess: boolean; adminAccess: boolean; fullAccess: boolean; meetings: boolean; tasks: boolean; calendar: boolean; notifications: boolean; analysis: boolean; chat: boolean };
type DemoConfig = { enabled: boolean; features: DemoFeatures; calendarView?:CalendarView };
const defaultDemoFeatures: DemoFeatures = { publicAccess: true, adminAccess: true, fullAccess: true, meetings: true, tasks: true, calendar: true, notifications: true, analysis: true, chat: true };
const demoFeatureLabels: { key: keyof DemoFeatures; label: string; hint: string }[] = [
  { key: "publicAccess", label: "Главная страница без входа", hint: "Посетитель сразу попадает в отдельное демо-пространство." },
  { key: "adminAccess", label: "Демо-админка", hint: "Вход без аккаунта по коду 1234." },
  { key: "fullAccess", label: "Полный доступ", hint: "Без продуктовых лимитов и квот." },
  { key: "meetings", label: "Встречи и материалы", hint: "Создание, загрузка и просмотр встреч." },
  { key: "tasks", label: "Поручения", hint: "Доска и изменение задач." },
  { key: "calendar", label: "Календарь", hint: "Просмотр поручений по датам." },
  { key: "notifications", label: "Уведомления", hint: "Напоминания в рабочем пространстве." },
  { key: "analysis", label: "AI-анализ", hint: "Обработка текста, аудио и видео." },
  { key: "chat", label: "Диалог по встрече", hint: "Вопросы к материалам встречи." },
];
function DeveloperSecurity({ demoMode, onDemoModeChange }: { demoMode: boolean; onDemoModeChange: (enabled: boolean) => void }) {
  const [meetingLimit,setMeetingLimit]=useState<string|null>(null);
  const [savingMeetingLimit,setSavingMeetingLimit]=useState(false);
  const [meetingLimitMessage,setMeetingLimitMessage]=useState('');
  const saveMeetingLimit=async()=>{if(meetingLimit===null)return;setSavingMeetingLimit(true);setMeetingLimitMessage('');try{await dev('/developer/multimodal',{method:'PUT',body:JSON.stringify({demo_meeting_limit:meetingLimit})});setMeetingLimitMessage('Количество встреч сохранено.');}catch(e){setMeetingLimitMessage(e instanceof Error?e.message:'Не удалось сохранить.');}finally{setSavingMeetingLimit(false);}};
  const [platformKeyEnabled, setPlatformKeyEnabled] = useState<boolean | null>(null);
  const [savingPlatformKey, setSavingPlatformKey] = useState(false);
  const [platformKeyError, setPlatformKeyError] = useState("");
  useEffect(() => {
    dev<any>("/developer/multimodal").then((data) => {setPlatformKeyEnabled(data.config.useDeveloperKey);setMeetingLimit(String(data.config.limit));})
      .catch(() => setPlatformKeyError("Не удалось загрузить настройку ключа платформы. Обновите страницу."));
  }, []);
  const togglePlatformKey = async () => {
    if (platformKeyEnabled === null) return;
    setSavingPlatformKey(true); setPlatformKeyError("");
    try {
      await dev("/developer/multimodal", { method: "PUT", body: JSON.stringify({ demo_use_developer_key: String(!platformKeyEnabled) }) });
      setPlatformKeyEnabled(!platformKeyEnabled);
    } catch (error) { setPlatformKeyError(error instanceof Error ? error.message : "Не удалось сохранить настройку."); }
    finally { setSavingPlatformKey(false); }
  };
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [changingDemoMode, setChangingDemoMode] = useState(false);
  const [demoConfig, setDemoConfig] = useState<DemoConfig>({ enabled: demoMode, features: defaultDemoFeatures });
  const [savedDemoConfig, setSavedDemoConfig] = useState<DemoConfig | null>(null);
  const [demoModeError, setDemoModeError] = useState("");
  const [needsDemoAuth, setNeedsDemoAuth] = useState(false);
  const [demoAuthPassword, setDemoAuthPassword] = useState("");
  const [pendingDemoConfig, setPendingDemoConfig] = useState<DemoConfig | null>(null);
  useEffect(() => {
    dev<DemoConfig>("/developer/demo-mode").then((config) => {
      setDemoConfig(config);
      setSavedDemoConfig(config);
      onDemoModeChange(config.enabled);
    }).catch((error) => setDemoModeError(error instanceof Error ? error.message : "Не удалось загрузить настройки."));
  }, []);
  const save = async () => {
    setMessage("");
    if (newPassword.length < 12) return setMessage("Новый пароль должен содержать минимум 12 символов.");
    if (newPassword !== repeatPassword) return setMessage("Повтор нового пароля не совпадает.");
    setSaving(true);
    try {
      await dev("/developer/security/password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) });
      sessionStorage.setItem("secretary-dev-password", newPassword);
      setCurrentPassword(""); setNewPassword(""); setRepeatPassword("");
      setMessage("Пароль изменён. Эта сессия обновлена; старый пароль больше не действует.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось изменить пароль."); }
    finally { setSaving(false); }
  };
  const passwordField = (id: string, label: string, value: string, setValue: (value: string) => void, autoComplete: string) => <label>{label}<span className="password-control"><input type={visible[id] ? "text" : "password"} autoComplete={autoComplete} value={value} onChange={(e) => setValue(e.target.value)} /><button type="button" className="password-control__button" onClick={() => setVisible({ ...visible, [id]: !visible[id] })} aria-label={visible[id] ? `Скрыть: ${label}` : `Показать: ${label}`} title={visible[id] ? "Скрыть пароль" : "Показать пароль"}>{visible[id] ? <EyeOff size={16} /> : <Eye size={16} />}</button><button type="button" className="password-control__button" onClick={() => setValue("")} disabled={!value} aria-label={`Очистить: ${label}`} title="Очистить поле"><X size={16} /></button></span></label>;
  const saveDemoMode = async (nextConfig: DemoConfig, passwordOverride?: string) => {
    setChangingDemoMode(true);
    setDemoModeError("");
    setMessage("");
    try {
      const result = await dev<DemoConfig>("/developer/demo-mode", { method: "PUT", body: JSON.stringify(nextConfig) }, passwordOverride);
      if (passwordOverride) sessionStorage.setItem("secretary-dev-password", passwordOverride);
      onDemoModeChange(result.enabled);
      setDemoConfig(result);
      setSavedDemoConfig(result);
      setNeedsDemoAuth(false);
      setPendingDemoConfig(null);
      setDemoAuthPassword("");
      setMessage(result.enabled ? "Демо-режим сохранён и включён." : "Демо-режим сохранён и выключен.");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Не удалось изменить демо-режим.";
      setPendingDemoConfig(nextConfig);
      if (savedDemoConfig) setDemoConfig(savedDemoConfig);
      if (reason.includes("Неверный пароль Dev-консоли")) {
        sessionStorage.removeItem("secretary-dev-password");
        setNeedsDemoAuth(true);
        setDemoModeError("Сохранённый пароль Dev-консоли больше не подходит. Введите действующий пароль, чтобы изменить режим.");
      } else setDemoModeError(reason);
    }
    finally { setChangingDemoMode(false); }
  };
  const demoChanged = savedDemoConfig && JSON.stringify(demoConfig) !== JSON.stringify(savedDemoConfig);
  return <section className="developer-security">
    <section className="demo-settings" aria-labelledby="demo-mode-title">
      <header><Lock size={20} /><div><h2 id="demo-mode-title">Демо-режим</h2><p>Публичное тестовое пространство и возможности посетителей. Переключатели сохраняются сразу.</p></div></header>
      <div className="demo-mode"><div><h3>{savedDemoConfig?.enabled ? "Демо-режим включён" : "Демо-режим выключен"}</h3><p>{changingDemoMode ? "Сохраняем настройку на сервере…" : "При выключении действует обычный вход."}</p></div><button type="button" className={`demo-mode__switch ${demoConfig.enabled ? "is-on" : ""}`} role="switch" aria-checked={demoConfig.enabled} aria-label="Демо-режим" disabled={changingDemoMode || !savedDemoConfig} onClick={() => { const next = { ...demoConfig, enabled: !demoConfig.enabled }; void saveDemoMode(next); }}><span aria-hidden="true" /></button></div>
      <div className="demo-mode"><div><h3>Использовать ключ платформы</h3><p>В демо используется ключ OpenAI из раздела «Секреты API» этой консоли. Когда выключено — ключ из админки демо-пространства.</p>{savingPlatformKey && <p role="status">Сохраняем…</p>}</div><button type="button" className={`demo-mode__switch ${platformKeyEnabled ? "is-on" : ""}`} role="switch" aria-checked={platformKeyEnabled === true} aria-label="Использовать ключ платформы" disabled={savingPlatformKey || platformKeyEnabled === null || !savedDemoConfig} onClick={() => void togglePlatformKey()}><span aria-hidden="true" /></button></div>
      {platformKeyError && <p className="error" role="alert">{platformKeyError}</p>}
      <div className="demo-mode demo-meeting-capacity"><div><h3>Количество встреч в демо-режиме</h3><p>Лимит добавленных встреч на демо-пространство браузера. Учебные примеры не учитываются; удаление встречи освобождает место. Расшифровка, иллюстрации и повторный анализ не расходуют дополнительные встречи. 0 — без ограничений.</p><label>Количество встреч<input type="number" min="0" max="2147483647" step="1" value={meetingLimit??''} disabled={meetingLimit===null||savingMeetingLimit} onChange={e=>{setMeetingLimit(e.target.value);setMeetingLimitMessage('');}}/></label><button type="button" className="outline" disabled={meetingLimit===null||savingMeetingLimit||!/^\d+$/.test(meetingLimit)} onClick={()=>void saveMeetingLimit()}>{savingMeetingLimit?'Сохраняем…':'Сохранить количество'}</button>{meetingLimitMessage&&<p role="status">{meetingLimitMessage}</p>}</div></div>
      <div className="demo-feature-list">{demoFeatureLabels.map(({ key, label, hint }) => <div className="demo-mode" key={key}><div><h3>{label}</h3><p>{key==='fullAccess'?'Без продуктовых ограничений. Лимит добавленных демо-встреч задаётся отдельно выше.':hint}</p>{key==='calendar'&&<div className="demo-calendar-default"><span>Схема по умолчанию</span><div className="collection-view-toggle" role="group" aria-label="Схема календаря по умолчанию">{calendarViewOptions.map(option=><button type="button" key={option.value} aria-pressed={(demoConfig.calendarView||'month')===option.value} className={(demoConfig.calendarView||'month')===option.value?'active':''} disabled={changingDemoMode||!savedDemoConfig} onClick={()=>void saveDemoMode({...demoConfig,calendarView:option.value})}>{option.label}</button>)}</div></div>}</div><button type="button" className={`demo-mode__switch ${demoConfig.features[key] ? "is-on" : ""}`} role="switch" aria-checked={demoConfig.features[key]} aria-label={label} disabled={changingDemoMode || !savedDemoConfig} onClick={() => { const next = { ...demoConfig, features: { ...demoConfig.features, [key]: !demoConfig.features[key] } }; void saveDemoMode(next); }}><span aria-hidden="true" /></button></div>)}</div>
      <div className="demo-settings__actions"><button type="button" className="primary" disabled={(!demoChanged && !pendingDemoConfig) || changingDemoMode} onClick={() => void saveDemoMode(pendingDemoConfig ?? demoConfig)}>{changingDemoMode ? "Сохраняем…" : "Повторить сохранение"}</button><span>{pendingDemoConfig ? "Изменение не сохранено на сервере" : demoChanged ? "Настройка ещё не сохранена" : "Настройки сохранены на сервере"}</span></div>
      {demoModeError && <p className="error" role="alert">{demoModeError}</p>}
      {needsDemoAuth && <form className="demo-mode__auth" onSubmit={(event) => { event.preventDefault(); if (demoAuthPassword) void saveDemoMode(pendingDemoConfig ?? demoConfig, demoAuthPassword); }}>{passwordField("demoAuth", "Действующий пароль Dev-консоли", demoAuthPassword, setDemoAuthPassword, "current-password")}<button type="submit" className="outline" disabled={changingDemoMode || !demoAuthPassword}>Подтвердить сохранение</button></form>}
    </section>
    <header><Lock size={20} /><div><h2>Пароль Dev-консоли</h2><p>Пароль сохраняется только в виде защищённого хеша.</p></div></header>
    <div className="security-form">{passwordField("current", "Текущий пароль", currentPassword, setCurrentPassword, "current-password")}{passwordField("new", "Новый пароль", newPassword, setNewPassword, "new-password")}{passwordField("repeat", "Повторите новый пароль", repeatPassword, setRepeatPassword, "new-password")}<button className="primary" disabled={saving || !currentPassword || !newPassword || !repeatPassword} onClick={save}>{saving ? "Сохраняем…" : "Изменить пароль"}</button></div>{message && <p className={message.startsWith("Пароль изменён") || message.startsWith("Демо-режим") ? "success" : "error"}>{message}</p>}
  </section>;
}

const emptyPublicationProfile = {
  name: "",
  publicUrl: "",
  environment: "production",
  host: "",
  sshUser: "deploy",
  sshPort: "22",
  installPath: "/opt/stenograf",
  healthPath: "/health",
  secret: "",
  clearSecret: false,
};

function PublicationProfiles({ readOnlyDemo }: { readOnlyDemo: boolean }) {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ ...emptyPublicationProfile });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [plan, setPlan] = useState<any>(null);
  const [releaseStatus, setReleaseStatus] = useState<any>(null);
  const [planning, setPlanning] = useState(false);
  const [preflight, setPreflight] = useState<any>(null);
  const [preflighting, setPreflighting] = useState(false);
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [releaseMode, setReleaseMode] = useState("standard");
  const [confirmRetention, setConfirmRetention] = useState(true);
  const [releaseDialogError, setReleaseDialogError] = useState("");
  const [releasing, setReleasing] = useState(false);
  const [confirmRollback, setConfirmRollback] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [deleting, setDeleting] = useState<any | null>(null);
  const load = async () => {
    const next = await dev<any[]>("/developer/publication/profiles");
    setProfiles(next);
    const nextId = selectedId || next[0]?.id || "";
    setSelectedId(nextId);
    if (nextId) setReleaseStatus(await dev(`/developer/publication/profiles/${nextId}/status`));
  };
  useEffect(() => { load().catch((error) => setMessage(error.message)); }, []);
  useEffect(() => {
    if (!selectedId) return;
    const refresh = async () => setReleaseStatus(await dev(`/developer/publication/profiles/${selectedId}/status`));
    const timer = window.setInterval(() => refresh().catch(() => {}), releaseStatus?.release?.status === "running" ? 1600 : 10000);
    const onVisible = () => { if (!document.hidden) refresh().catch(() => {}); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [selectedId, releaseStatus?.release?.status]);
  const selected = profiles.find((profile) => profile.id === selectedId);
  const disk = preflight?.output.match(/^\/dev\/\S+\s+(\S+)\s+(\S+)\s+(\S+)\s+(\d+)%\s+\/$/m);
  const availableDisk = disk?.[3];
  const diskTotal = disk?.[1];
  const diskUsed = disk?.[2];
  const diskPercent = Number(disk?.[4] || 0);
  const publicRouteMissing = preflight?.output.includes("PUBLIC HTTPS HEALTH\n404");
  const links = selected ? [
    { label: "Рабочее пространство", url: selected.publicUrl },
    { label: "Админ-панель", url: `${selected.publicUrl.replace(/\/$/, "")}/adminvk` },
    { label: "Dev-консоль", url: `${selected.publicUrl.replace(/\/$/, "")}/dev` },
  ] : [];
  const startEdit = (profile = selected) => {
    setMessage(""); setFieldErrors({}); setPlan(null); setPreflight(null);
    setDraft(profile ? {
      ...emptyPublicationProfile,
      ...profile,
      sshPort: String(profile.sshPort),
      secret: "",
      clearSecret: false,
    } : { ...emptyPublicationProfile });
    setEditing(true);
  };
  const startNew = () => {
    setSelectedId("");
    startEdit(null);
  };
  const validate = () => {
    const errors: Record<string, string> = {};
    if (draft.name.trim().length < 2) errors.name = "Введите понятное имя профиля.";
    try {
      const url = new URL(draft.publicUrl);
      if (url.protocol !== "https:" || /(^localhost$|^127\.|^10\.|^192\.168\.)/.test(url.hostname)) errors.publicUrl = "Нужен публичный HTTPS-адрес.";
    } catch { errors.publicUrl = "Укажите полный публичный HTTPS-адрес."; }
    if (!draft.host.trim() || /(^localhost$|^127\.|^10\.|^192\.168\.)/.test(draft.host)) errors.host = "Укажите публичный хост или IP.";
    if (!/^[a-z_][a-z0-9_-]*$/i.test(draft.sshUser)) errors.sshUser = "Проверьте SSH-пользователя.";
    if (!/^\d+$/.test(draft.sshPort) || Number(draft.sshPort) < 1 || Number(draft.sshPort) > 65535) errors.sshPort = "Порт: от 1 до 65535.";
    if (!draft.installPath.startsWith("/")) errors.installPath = "Путь начинается с /.";
    if (!draft.healthPath.startsWith("/")) errors.healthPath = "Путь начинается с /.";
    if (!selected && !draft.secret.trim()) errors.secret = "Добавьте SSH-пароль или ключ для защищённого хранения.";
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>(".publication-field.invalid input, .publication-field.invalid select")?.focus());
      return false;
    }
    return true;
  };
  const save = async () => {
    if (!validate()) return;
    setSaving(true); setMessage("");
    try {
      const payload = { ...draft, sshPort: Number(draft.sshPort) };
      const saved = await dev<any>(selected && selected.id === selectedId ? `/developer/publication/profiles/${selectedId}` : "/developer/publication/profiles", {
        method: selected && selected.id === selectedId ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      await load();
      setSelectedId(saved.id);
      setEditing(false);
      setDraft({ ...emptyPublicationProfile });
      setMessage("Профиль сохранён. Секрет не возвращается в интерфейс.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить профиль.");
    } finally { setSaving(false); }
  };
  const preparePlan = async () => {
    if (!selectedId) return;
    setPlanning(true); setMessage(""); setPlan(null);
    try {
      setPlan(await dev(`/developer/publication/profiles/${selectedId}/plan`, { method: "POST", body: JSON.stringify({mode:releaseMode,confirmRetention}) }));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось подготовить план."); }
    finally { setPlanning(false); }
  };
  const runPreflight = async () => {
    if (!selectedId) return;
    setPreflighting(true); setMessage(""); setPreflight(null);
    try {
      setPreflight(await dev(`/developer/publication/profiles/${selectedId}/preflight`, { method: "POST" }));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось выполнить предзапуск VPS."); }
    finally { setPreflighting(false); }
  };
  const openBlockingFields = () => {
    if (!selected) return;
    const errors: Record<string, string> = {};
    if (!selected.secretSaved) errors.secret = "Для выпуска нужен сохранённый SSH-секрет.";
    setDraft({ ...emptyPublicationProfile, ...selected, sshPort: String(selected.sshPort), secret: "", clearSecret: false });
    setFieldErrors(errors);
    setMessage(Object.keys(errors).length ? "Исправьте отмеченные настройки и повторите подготовку выпуска." : "Профиль заполнен. Подготовьте план и подтвердите выпуск." );
    setEditing(true);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(".publication-field.invalid input, .publication-field.invalid select")?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };
  const startRelease = async () => {
    if (!selectedId) return;
    setReleasing(true); setReleaseDialogError(""); setMessage("");
    try {
      await dev(`/developer/publication/profiles/${selectedId}/release`, { method: "POST", body: JSON.stringify({mode:releaseMode,confirmDowntime:releaseMode==='economy',confirmRetention}) });
      setConfirmRelease(false);
      setReleaseStatus((current: any) => ({ ...current, release: { status: "running", stage: "archive", startedAt: new Date().toISOString() } }));
      dev(`/developer/publication/profiles/${selectedId}/status`).then(setReleaseStatus).catch(() => {});
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Не удалось запустить выпуск.";
      if (reason === "Выпуск уже выполняется.") {
        setConfirmRelease(false);
        dev(`/developer/publication/profiles/${selectedId}/status`).then(setReleaseStatus).catch(() => setMessage(reason));
      } else setReleaseDialogError(reason);
    }
    finally { setReleasing(false); }
  };
  const startRollback = async () => {
    if (!selectedId) return;
    setRollingBack(true); setMessage("");
    try {
      await dev(`/developer/publication/profiles/${selectedId}/rollback`, { method: "POST" });
      setConfirmRollback(false);
      setReleaseStatus(await dev(`/developer/publication/profiles/${selectedId}/status`));
      setPlan(null);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось запустить откат."); }
    finally { setRollingBack(false); }
  };
  const remove = async () => {
    if (!deleting) return;
    try {
      await dev(`/developer/publication/profiles/${deleting.id}`, { method: "DELETE" });
      setDeleting(null); setSelectedId(""); setPlan(null); await load();
      setMessage("Профиль удалён.");
    } catch (error) { setDeleting(null); setMessage(error instanceof Error ? error.message : "Не удалось удалить профиль."); }
  };
  return (
    <section className="publication-profiles" aria-labelledby="publication-title">
      <header>
        <div>
          <h2 id="publication-title">Публикация агента</h2>
          <p>Подготовьте изолированный план релиза. Внешний сервер не меняется без отдельного разрешения.</p>
        </div>
        <Rocket size={22} aria-hidden="true" />
      </header>
      {readOnlyDemo && <p className="publication-notice">В публичном демо-режиме изменение профилей и выпуск отключены. Публикуйте из локальной защищённой Dev-консоли.</p>}
      <div className="publication-picker">
        <label>Профиль выпуска
          <select value={selectedId} onChange={async (event) => { const id = event.target.value; setSelectedId(id); setEditing(false); setPlan(null); setPreflight(null); setMessage(""); setReleaseStatus(id ? await dev(`/developer/publication/profiles/${id}/status`) : null); }}>
            <option value="">Выберите профиль</option>
            {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name} · {profile.environment === "production" ? "production" : "staging"}</option>)}
          </select>
        </label>
        <button className="icon-button" disabled={!selected || readOnlyDemo} onClick={() => startEdit()} title="Редактировать профиль" aria-label="Редактировать профиль"><Pencil size={16} /></button>
        <button className="icon-button danger" disabled={!selected || readOnlyDemo} onClick={() => setDeleting(selected)} title="Удалить профиль" aria-label="Удалить профиль"><Trash2 size={16} /></button>
        <button className="outline" disabled={readOnlyDemo} onClick={startNew}><Plus size={16} /> Новый профиль</button>
      </div>
      {editing && <section className="publication-editor" aria-label="Параметры профиля публикации">
        <div className="publication-editor__head"><h3>{selected ? "Редактирование профиля" : "Новый профиль"}</h3><button className="text-btn" onClick={() => setEditing(false)}>Скрыть параметры</button></div>
        <div className="publication-grid">
          <PublicationField label="Название профиля" hint="Отображается только в Dev-консоли." error={fieldErrors.name}><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Production · основной контур" /></PublicationField>
          <PublicationField label="Среда" hint="Production — рабочий контур, staging — безопасная проверка." error={fieldErrors.environment}><select value={draft.environment} onChange={(e) => setDraft({ ...draft, environment: e.target.value })}><option value="production">Production</option><option value="staging">Staging</option></select></PublicationField>
          <PublicationField label="Публичный HTTPS-адрес" hint="Адрес, который будет проверен после будущей публикации." error={fieldErrors.publicUrl}><input value={draft.publicUrl} onChange={(e) => setDraft({ ...draft, publicUrl: e.target.value })} placeholder="https://app.example.com" /></PublicationField>
          <PublicationField label="Хост или публичный IP" hint="Не принимаются localhost и приватные диапазоны." error={fieldErrors.host}><input value={draft.host} onChange={(e) => setDraft({ ...draft, host: e.target.value })} placeholder="203.0.113.10" /></PublicationField>
          <PublicationField label="SSH-пользователь" hint="Только имя пользователя, без команд." error={fieldErrors.sshUser}><input value={draft.sshUser} onChange={(e) => setDraft({ ...draft, sshUser: e.target.value })} /></PublicationField>
          <PublicationField label="SSH-порт" hint="Обычно 22." error={fieldErrors.sshPort}><input inputMode="numeric" value={draft.sshPort} onChange={(e) => setDraft({ ...draft, sshPort: e.target.value })} /></PublicationField>
          <PublicationField label="Путь установки" hint="Отдельный каталог приложения на сервере." error={fieldErrors.installPath}><input value={draft.installPath} onChange={(e) => setDraft({ ...draft, installPath: e.target.value })} /></PublicationField>
          <PublicationField label="Health-check" hint="Маршрут проверки готовности API после миграций." error={fieldErrors.healthPath}><input value={draft.healthPath} onChange={(e) => setDraft({ ...draft, healthPath: e.target.value })} /></PublicationField>
          <PublicationField label="SSH-пароль или приватный ключ" hint="Шифруется на сервере, не возвращается в браузер." error={fieldErrors.secret}><input type="password" value={draft.secret} placeholder={selected?.secretSaved ? "Секрет сохранён — введите только для замены" : "Введите пароль или ключ"} onChange={(e) => setDraft({ ...draft, secret: e.target.value, clearSecret: false })} />{selected?.secretSaved && <label className="publication-clear"><input type="checkbox" checked={draft.clearSecret} onChange={(e) => setDraft({ ...draft, clearSecret: e.target.checked, secret: "" })} /> Очистить сохранённый секрет</label>}</PublicationField>
        </div>
        <div className="publication-editor__actions"><button className="outline" onClick={() => setEditing(false)}>Отмена</button><button className="primary" disabled={saving} onClick={save}>{saving ? "Сохраняем…" : "Сохранить профиль"}</button></div>
      </section>}
      {selected && !editing && <section className="publication-summary">
        <Server size={18} /><div><strong>{selected.name}</strong><span>{selected.publicUrl} · {selected.environment}</span></div><span className={selected.secretSaved ? "publication-secret saved" : "publication-secret"}>{selected.secretSaved ? "Секрет сохранён" : readOnlyDemo ? "SSH-доступ — в локальной консоли" : "Нужен SSH-секрет"}</span>
      </section>}
      {selected && !editing && <section className="publication-overview" aria-label="Состав и состояние выпуска">
        <dl><div><dt>Состав выпуска</dt><dd>Frontend (Vite/Nginx) · API (Express) · PostgreSQL</dd></div><div><dt>Миграции</dt><dd>Prisma db push · без удаления данных</dd></div><div><dt>Изоляция</dt><dd>Отдельный Compose-проект в {selected.installPath}; соседние приложения не перезапускаются.</dd></div><div><dt>Снимок версии</dt><dd>{(plan?.local || releaseStatus?.local) ? <><code>{(plan?.local || releaseStatus.local).hash.slice(0, 12)}</code><span>· {(plan?.local || releaseStatus.local).files} файлов · {((plan?.local || releaseStatus.local).bytes / 1024).toFixed(1)} КБ · {releaseStatus?.comparison === "synchronized" ? "сервер синхронизирован" : releaseStatus?.comparison === "changed" ? "локальный состав изменён" : "сервер пока не сравнен"}</span></> : releaseStatus?.mode === "server-read-only" ? "Проверяется в локальной Dev-консоли." : "Снимок ещё не сформирован."}</dd></div><div><dt>Проверка VPS</dt><dd><button className="outline" title={readOnlyDemo ? "Проверка VPS доступна в локальной Dev-консоли" : preflighting ? "Идёт проверка VPS" : !selected.secretSaved ? "Сначала сохраните SSH-пароль или приватный ключ в профиле" : "Проверить VPS без изменений на сервере"} disabled={preflighting || !selected.secretSaved || readOnlyDemo} onClick={runPreflight}>{preflighting ? "Проверяем…" : "Проверить VPS"}</button><span>{readOnlyDemo ? "Проверка и публикация доступны в локальной защищённой Dev-консоли." : selected.secretSaved ? "Read-only: доступ, Docker, Nginx, место и health-check." : "Сначала добавьте SSH-пароль или приватный ключ через карандаш профиля."}</span></dd></div>{links.map((link) => <div key={link.label}><dt>{link.label}</dt><dd><a href={link.url} target="_blank" rel="noreferrer">{link.url}</a><button className="outline publication-address-action" onClick={() => navigator.clipboard?.writeText(link.url)}><Copy size={14} />Копировать</button><a className="outline publication-address-action" href={link.url} target="_blank" rel="noreferrer"><ExternalLink size={14} />Открыть</a></dd></div>)}</dl>
        {preflight && <section className="preflight-result"><p className={publicRouteMissing ? "publication-notice" : "success"}>{publicRouteMissing ? <Info size={16} /> : <CheckCircle2 size={16} />}{publicRouteMissing ? `VPS готов${availableDisk ? `: свободно ${availableDisk}` : ""}; публичный адрес приложения ещё не подключён.` : `Предзапуск VPS завершён${availableDisk ? `: свободно ${availableDisk}` : ""}. Docker, Nginx и health-check проверены.`}</p>{diskTotal && <div className="vps-disk" aria-label={`Диск VPS: занято ${diskUsed} из ${diskTotal}, свободно ${availableDisk}`}><div className="vps-disk__ring" style={{ "--disk-percent": `${diskPercent}%` } as React.CSSProperties}><strong>{diskPercent}%</strong><span>занято</span></div><div><strong>{diskUsed} занято</strong><span>из {diskTotal} всего</span><span>Свободно {availableDisk}</span><time>Проверено {new Date(preflight.checkedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</time></div></div>}<details><summary>Технические подробности для разработчика</summary><pre>{preflight.output}</pre></details></section>}
      </section>}
      {selected && !editing && !readOnlyDemo && <section className="release-plan">
        <div><h3>Подготовка выпуска</h3><p>Проверка не меняет сервер. Передача файлов и запуск требуют отдельного подтверждения.</p></div>
        <label className="release-mode">Режим обновления<select value={releaseMode} disabled={planning || releaseStatus?.release?.status === 'running'} onChange={event=>{setReleaseMode(event.target.value);setPlan(null);setReleaseDialogError('');}}><option value="standard">Обычный — сборка до переключения</option><option value="economy">С остановкой — экономия места</option></select></label>
        <label className="cloud-check"><input type="checkbox" checked={confirmRetention} disabled={planning || releaseStatus?.release?.status === 'running'} onChange={event=>{setConfirmRetention(event.target.checked);setPlan(null);}}/>После успеха оставить один архив кода и два дампа БД</label>
        <p className="release-mode-note">{releaseMode==='economy'?'Web и API остановятся; их старые контейнеры и свободные образы удалятся до сборки новой версии. Сайт будет недоступен до её успешного запуска. При ошибке потребуется повторить выпуск или восстановить архив.':'Старая версия продолжает работать во время сборки. При переключении возможен краткий перерыв; свободные старые образы удаляются после проверки новой версии.'} База, записи и секреты сохраняются. {confirmRetention?"После успешного выпуска остаются один архив кода и два дампа БД.":"Все прежние резервные копии сохраняются."} Общий кеш Docker не очищается. Для передачи архива, резервных копий и сборки всё равно нужно свободное место.</p>
        <button className="primary" disabled={planning} onClick={preparePlan}>{planning ? <RefreshCw className="spin" size={16} /> : <CheckCircle2 size={16} />}{planning ? "Проверяем…" : "Подготовить выпуск"}</button>
        {releaseStatus?.release && <ReleaseProgress release={releaseStatus.release} />}
        {releaseStatus?.release?.status === "succeeded" && releaseStatus.release.previousServer?.verifiedManifest && releaseStatus.release.rollbackHash && <div className="publication-rollback"><span>Предыдущий проверенный архив доступен. Данные БД сохраняются; откат заблокируется при изменённой схеме.</span><button className="outline" onClick={() => setConfirmRollback(true)}>Откатить версию</button></div>}
        {plan && <div className="release-plan__result">
          <p className={plan.status === "preflight_completed" ? "success" : "publication-notice"}>{plan.status === "preflight_completed" ? <CheckCircle2 size={16} /> : <Info size={16} />}{plan.note}</p>
          {plan.preflight && <section className="preflight-result"><p>{plan.preflight.output.includes("PUBLIC HTTPS HEALTH\n404") ? "VPS готов, но публичный адрес приложения ещё не подключён." : "Предзапуск VPS завершён."}</p><details><summary>Технические подробности для разработчика</summary><pre>{plan.preflight.output}</pre></details></section>}
          {plan.local && <p className="release-snapshot">Локальный снимок: {plan.local.hash.slice(0, 12)}… · {plan.local.files} файлов · {(plan.local.bytes / 1024).toFixed(1)} КБ</p>}<ol>{plan.stages.map((stage: any) => <li key={stage.name}><strong>{stage.name}</strong><span>{stage.detail}</span></li>)}</ol><div className="release-targets">{links.map((link) => <div className="release-target" key={link.label}><span>{link.label}: {link.url}</span><button className="icon-button" title={`Копировать: ${link.label}`} onClick={() => navigator.clipboard?.writeText(link.url)}><Copy size={15} /></button><a className="icon-button" href={link.url} target="_blank" rel="noreferrer" title={`Открыть: ${link.label}`}><ExternalLink size={15} /></a></div>)}</div><button className="primary" disabled={releaseStatus?.release?.status === "running"} onClick={() => { if (!selected.secretSaved) openBlockingFields(); else { setReleaseDialogError(""); setConfirmRelease(true); } }}>{!selected.secretSaved ? "Исправить настройки выпуска" : releaseStatus?.release?.status === "running" ? "Выпуск выполняется" : "Опубликовать"}</button></div>}
      </section>}
      {message && <p className={message.includes("сохран") || message.includes("удалён") ? "success" : "error"}>{message}</p>}
      {deleting && <div className="publication-modal" role="dialog" aria-modal="true" aria-labelledby="delete-profile-title"><div><h3 id="delete-profile-title">Удалить профиль «{deleting.name}»?</h3><p>Будут удалены параметры выпуска и зашифрованный SSH-секрет. Уже развёрнутые сервисы не изменятся.</p><footer><button className="outline" autoFocus onClick={() => setDeleting(null)}>Отмена</button><button className="danger-button" onClick={remove}><Trash2 size={16} />Удалить профиль</button></footer></div></div>}
      {confirmRelease && selected && <div className="publication-modal" role="dialog" aria-modal="true" aria-labelledby="release-confirm-title"><div><button className="modal-close" disabled={releasing} onClick={() => setConfirmRelease(false)} aria-label="Закрыть"><X size={18} /></button><small>ФАКТИЧЕСКИЙ ВЫПУСК</small><h3 id="release-confirm-title">Опубликовать «{selected.name}»?</h3><p>{releaseMode==='economy'?'С остановкой: после создания резервных копий web/API и их свободные старые образы будут удалены до сборки. Пауза продлится до успешного запуска. При ошибке сайт останется недоступен до повторного выпуска или восстановления.':'Обычный режим: сборка выполняется до переключения приложения. При переключении возможен краткий перерыв.'} База, записи и секреты сохраняются; соседние приложения не перезапускаются. {confirmRetention?"После успешной проверки будут удалены старые автоматически созданные копии: останутся один архив кода и два последних дампа БД.":"Все прежние резервные копии сохраняются."} Общий кеш Docker сохраняется.</p>{releaseDialogError && <p className="publication-modal__error" role="alert">{releaseDialogError}</p>}<footer><button className="outline" autoFocus disabled={releasing} onClick={() => setConfirmRelease(false)}>Отмена</button><button className="primary" disabled={releasing} onClick={startRelease}><Rocket size={16} />{releasing ? "Запускаем…" : releaseMode==='economy' ? "Остановить и обновить" : "Запустить выпуск"}</button></footer></div></div>}
      {confirmRollback && selected && <div className="publication-modal" role="dialog" aria-modal="true" aria-labelledby="rollback-confirm-title"><div><button className="modal-close" onClick={() => setConfirmRollback(false)} aria-label="Закрыть"><X size={18} /></button><small>ОТКАТ ВЕРСИИ</small><h3 id="rollback-confirm-title">Вернуть предыдущую версию «{selected.name}»?</h3><p>Worker проверит архив и совместимость схемы БД, затем восстановит файлы и контейнеры только этого приложения. Данные БД не откатываются.</p><footer><button className="outline" autoFocus onClick={() => setConfirmRollback(false)}>Отмена</button><button className="primary" disabled={rollingBack} onClick={startRollback}>{rollingBack ? "Запускаем…" : "Подтвердить откат"}</button></footer></div></div>}
    </section>
  );
}

function ReleaseProgress({ release }: { release: any }) {
  const stages = release.action === "rollback" ? [{ key: "archive", label: "Архив", detail: "Проверяем копию" }, { key: "transfer", label: "Передача", detail: "Архив на VPS" }, { key: "deploy", label: "Восстановление", detail: "Файлы и Docker" }, { key: "verify", label: "Проверка", detail: "Health-check" }] : [{ key: "archive", label: "Архив", detail: "Собираем выпуск" }, { key: "transfer", label: "Передача", detail: "Отправляем на VPS" }, { key: "deploy", label: "Развёртывание", detail: "Docker и схема БД" }, { key: "verify", label: "Проверка", detail: "Health-check" }];
  const current = Math.max(0, stages.findIndex((stage) => stage.key === release.stage));
  const success = release.status === "succeeded";
  const failed = release.status === "failed";
  const setupNeeded = failed && release.action !== "rollback" && release.error?.includes("missing $install/.env");
  const title = release.action === "rollback" ? (success ? "Откат завершён" : failed ? "Откат остановлен" : "Откат выполняется") : (success ? "Выпуск завершён" : setupNeeded ? "На VPS не хватает файла конфигурации" : failed ? "Выпуск остановлен" : "Выпуск выполняется");
  const description = success
    ? "Снимок сервера и публичный health-check подтверждены."
    : setupNeeded
      ? "Профиль выпуска сохранён; локальная версия продолжает работать отдельно от VPS."
      : failed
        ? "Этап остановлен; причина и безопасный журнал доступны ниже."
        : "Статус обновляется автоматически.";
  return <section className={`release-progress release-progress--${release.status}${setupNeeded ? " release-progress--setup-needed" : ""}`} aria-live="polite"><header><p className={success ? "success" : setupNeeded ? "publication-notice" : failed ? "error" : "publication-notice"}>{success ? <CheckCircle2 size={16} /> : setupNeeded ? <Info size={16} /> : failed ? <X size={16} /> : <RefreshCw className="spin" size={16} />}{title}<span>{description}</span></p></header><div className="release-progress__stages">{stages.map((stage, index) => <div key={stage.key} className={`${success || index < current ? "done" : ""} ${!success && (!failed || setupNeeded) && index === current ? "active" : ""} ${failed && !setupNeeded && index === current ? "failed" : ""}`}><b>{success || index < current ? <Check size={14} /> : index + 1}</b><strong>{stage.label}</strong><span>{stage.detail}</span></div>)}</div>{release.error && <p className={`release-progress__error${setupNeeded ? " release-progress__setup-note" : ""}`}>{setupNeeded ? "В каталоге приложения на VPS нет .env. Архив релиза специально не содержит секретов, поэтому его создают и хранят на сервере отдельно. Compose намеренно не запускался; локальная версия не затронута." : "Выпуск не завершился. Откройте безопасный журнал для технической причины."}</p>}{release.finishedAt && <p className="release-progress__last">{setupNeeded ? "Последняя проверка публикации" : "Последний выпуск"}: {setupNeeded ? "на VPS не найден .env" : title.toLowerCase()} · {new Date(release.finishedAt).toLocaleString("ru-RU")}</p>}{release.log && <details><summary>Безопасный журнал последнего действия</summary><pre>{release.log}</pre></details>}</section>;
}

function PublicationField({ label, hint, error, children }: { label: string; hint: string; error?: string; children: React.ReactNode }) {
  return <label className={`publication-field${error ? " invalid" : ""}`}><span>{label}<button type="button" className="model-help" data-tooltip={hint} aria-label={`Подсказка: ${label}`}><Info size={14} /></button></span>{children}{error && <small>{error}</small>}</label>;
}

function DeveloperOrganizations({ readOnlyDemo }: { readOnlyDemo: boolean }) {
  const [orgs, setOrgs] = useState<any[]>([]),
    [drafts, setDrafts] = useState<Record<string, any>>({}),
    [newOrg, setNewOrg] = useState({ name: "", ownerEmail: "" }),
    [creatingOrgOpen, setCreatingOrgOpen] = useState(false),
    [creating, setCreating] = useState(false),
    [editingId, setEditingId] = useState<string | null>(null),
    [savingId, setSavingId] = useState<string | null>(null),
    [deletingOrg, setDeletingOrg] = useState<any | null>(null),
    [deleteName, setDeleteName] = useState(""),
    [deleting, setDeleting] = useState(false),
    [deleteError, setDeleteError] = useState(""),
    [message, setMessage] = useState(""),
    [messageError, setMessageError] = useState(false);
  const load = () => dev<any[]>("/developer/organizations").then(setOrgs);
  const saveOrganization = async (org: any) => {
    setSavingId(org.id);
    setMessage("");
    try {
      await dev(`/developer/organizations/${org.id}`, {
        method: "PUT",
        body: JSON.stringify(drafts[org.id]),
      });
      await load();
      setEditingId(null);
      setMessage("Изменения организации сохранены.");
      setMessageError(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить организацию.");
      setMessageError(true);
    } finally { setSavingId(null); }
  };
  const removeOrganization = async () => {
    if (!deletingOrg || deleteName !== deletingOrg.name) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await dev(`/developer/organizations/${deletingOrg.id}`, {
        method: "DELETE",
        body: JSON.stringify({ confirmName: deleteName }),
      });
      await load();
      setDeletingOrg(null);
      setDeleteName("");
      setMessage("Организация удалена.");
      setMessageError(false);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Не удалось удалить организацию.");
    } finally { setDeleting(false); }
  };
  useEffect(() => {
    load();
  }, []);
  return (
    <section className="org-inspector">
      <div className="org-inspector__title">
        <div className="org-inspector__title-copy">
          <h2>Организации и лимиты</h2>
          <details className="developer-key-info">
            <summary aria-label="О списке организаций" title="О списке организаций"><Info size={14} aria-hidden="true" /></summary>
            <p>Здесь видны все организации системы. В рабочем пространстве пользователь видит только организации, к которым ему предоставлен доступ.</p>
          </details>
        </div>
        {!readOnlyDemo && <button type="button" className={creatingOrgOpen ? "outline" : "primary"} aria-expanded={creatingOrgOpen} aria-controls="org-create-form" onClick={() => setCreatingOrgOpen((open) => !open)}>{creatingOrgOpen ? <X size={16} /> : <Plus size={16} />}{creatingOrgOpen ? "Закрыть форму" : "Создать организацию"}</button>}
      </div>
      {readOnlyDemo && <p className="publication-notice">В публичной демо-версии изменение и удаление организаций отключено. Управляйте ими в локальной защищённой Dev-консоли.</p>}
      {!readOnlyDemo && creatingOrgOpen && <form id="org-create-form" className="org-create" onSubmit={async (e) => {
        e.preventDefault();
        setCreating(true);
        setMessage("");
        try {
          await dev("/developer/organizations", { method: "POST", body: JSON.stringify(newOrg) });
          setNewOrg({ name: "", ownerEmail: "" });
          setCreatingOrgOpen(false);
          setMessage("Организация создана: владелец уже назначен, базовый отдел и статусы готовы.");
          setMessageError(false);
          load();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Не удалось создать организацию");
          setMessageError(true);
        } finally { setCreating(false); }
      }}>
        <div className="org-create__intro">
          <div className="org-create__heading">
            <h3>Новая организация</h3>
            <details className="developer-key-info">
              <summary aria-label="Как создаётся организация" title="Как создаётся организация"><Info size={14} aria-hidden="true" /></summary>
              <p>Создаётся с отделом «Общий», доской и политикой хранения. Укажите email уже зарегистрированного владельца.</p>
            </details>
          </div>
        </div>
        <label><span>Название</span><input required minLength={2} value={newOrg.name} placeholder="Название организации" onChange={(e) => setNewOrg({ ...newOrg, name: e.target.value })} /></label>
        <label><span>Email владельца</span><input required type="email" value={newOrg.ownerEmail} placeholder="owner@company.ru" onChange={(e) => setNewOrg({ ...newOrg, ownerEmail: e.target.value })} /></label>
        <div className="org-create__actions"><button className="primary" disabled={creating}><Plus size={16} />{creating ? "Создаём…" : "Добавить организацию"}</button></div>
      </form>}
      {message && <p className={messageError ? "error" : "success"} role="status">{message}</p>}
      {orgs.map((org) => (
        <article key={org.id}>
          <div className="org-inspector__heading">
            <h3>{org.name}</h3>
            {!readOnlyDemo && <div className="org-inspector__actions">
              <button type="button" className="icon-button" title={`Редактировать ${org.name}`} aria-label={`Редактировать ${org.name}`} onClick={() => {
                setEditingId(org.id);
                setDrafts((current) => ({ ...current, [org.id]: { name: org.name, meetingLimit: org.meetingLimit ?? 0 } }));
                setMessage("");
              }}><Pencil size={16} /></button>
              <button type="button" className="icon-button danger" title={`Удалить ${org.name}`} aria-label={`Удалить ${org.name}`} onClick={() => {
                setDeletingOrg(org);
                setDeleteName("");
                setDeleteError("");
              }}><Trash2 size={16} /></button>
            </div>}
          </div>
          <p>
            {org.departments.length} отделов · {org.memberships.length}{" "}
            участников · {org.meetings.length} встреч
          </p>
          <small>
            {org.memberships.map((m: any) => m.user.email).join(" · ")}
          </small>
          {editingId === org.id ? <form className="org-controls" onSubmit={(event) => { event.preventDefault(); saveOrganization(org); }}>
            <label>Название<input required minLength={2} value={drafts[org.id]?.name ?? ""} onChange={(event) => setDrafts((current) => ({ ...current, [org.id]: { ...current[org.id], name: event.target.value } }))} /></label>
            <label>Лимит встреч (0 — без лимита)<input required type="number" min="0" value={drafts[org.id]?.meetingLimit ?? 0} onChange={(event) => setDrafts((current) => ({ ...current, [org.id]: { ...current[org.id], meetingLimit: Number(event.target.value) } }))} /></label>
            <div className="org-controls__actions"><button type="button" className="outline" onClick={() => setEditingId(null)}>Отмена</button><button type="submit" className="primary" disabled={savingId === org.id}>{savingId === org.id ? "Сохраняем…" : "Сохранить"}</button></div>
          </form> : <p className="org-inspector__limit">Лимит встреч: {org.meetingLimit ? org.meetingLimit : "без лимита"}</p>}
        </article>
      ))}
      {deletingOrg && <div className="publication-modal meeting-confirm" role="dialog" aria-modal="true" aria-labelledby="delete-organization-title" onClick={() => !deleting && setDeletingOrg(null)}><div onClick={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" aria-label="Закрыть" disabled={deleting} onClick={() => setDeletingOrg(null)}><X size={18} /></button>
        <small>ПОДТВЕРЖДЕНИЕ УДАЛЕНИЯ</small>
        <h3 id="delete-organization-title">Удалить «{deletingOrg.name}»?</h3>
        <p>Будут безвозвратно удалены {deletingOrg.departments.length} отделов, {deletingOrg.meetings.length} встреч, их файлы, протоколы, поручения и настройки организации. Аккаунты участников сохранятся.</p>
        <label className="org-delete-confirm">Введите название организации<input autoFocus value={deleteName} onChange={(event) => setDeleteName(event.target.value)} autoComplete="off" /></label>
        {deleteError && <p className="meeting-confirm__error" role="alert">{deleteError}</p>}
        <footer><button type="button" className="outline" disabled={deleting} onClick={() => setDeletingOrg(null)}>Отмена</button><button type="button" className="danger-button" disabled={deleting || deleteName !== deletingOrg.name} onClick={removeOrganization}><Trash2 size={15} />{deleting ? "Удаляем…" : "Удалить организацию"}</button></footer>
      </div></div>}
    </section>
  );
}

function App() {
  const [passwordResetTicket]=useState(()=>new URLSearchParams(location.hash.slice(1)).get('local-reset')||'');
  useEffect(()=>{
    const currentUrl=new URL(location.href),legacy=currentUrl.searchParams.get('surface');
    if(legacy==='admin'||legacy==='dev'){
      const target=new URL(surfaceUrl(legacy));
      currentUrl.searchParams.forEach((value,key)=>{if(key!=='surface')target.searchParams.set(key,value);});
      history.replaceState(null,'',target);
    }
  },[]);
  const [user, setUser] = useState<User | null>(null),
    [memberships, setMemberships] = useState<Membership[]>([]),
    [current, setCurrent] = useState<Membership | null>(null),
    [view, setView] = useState(() =>
      surfaceForPath(window.location.pathname,import.meta.env.BASE_URL) === "admin" || new URLSearchParams(window.location.search).get("surface") === "admin" ||
      window.location.hostname.startsWith("admin.")
        ? "admin"
        : surfaceForPath(window.location.pathname,import.meta.env.BASE_URL) === "dev" || new URLSearchParams(window.location.search).get("surface") ===
              "dev" || window.location.hostname.startsWith("dev.")
          ? "dev"
          : "meetings",
    ),
    [meetings, setMeetings] = useState<Meeting[]>([]),
    [meetingListView, setMeetingListView] = useState<MeetingListView>("brief"),
    [expandedMeeting, setExpandedMeeting] = useState<string | null>(null),
    [departmentFilter, setDepartmentFilter] = useState(""),
    [selected, setSelected] = useState<string | null>(()=>new URLSearchParams(location.search).get('meeting')),
    [deletingMeeting, setDeletingMeeting] = useState<Meeting | null>(null),
    [deleteMeetingBusy, setDeleteMeetingBusy] = useState(false),
    [deleteMeetingError, setDeleteMeetingError] = useState(""),
    [processingNotice, setProcessingNotice] = useState(""),
    [create, setCreate] = useState(false),
    [loading, setLoading] = useState(true),
    [adminTourSignal, setAdminTourSignal] = useState(0),
    [workspaceTourStep, setWorkspaceTourStep] = useState<number | null>(null),
    [demoMode, setDemoMode] = useState(false);
  const [demoConfig, setDemoConfig] = useState<DemoConfig>({ enabled: false, features: defaultDemoFeatures });
  const [demoKeyUsage, setDemoKeyUsage] = useState<any>(null);
  const load = async (finishLoading = true) => {
    const requestedToken=token();
    try {
      const x = await api<{ user: User; organizations: Membership[] }>(
        "/auth/me",
      );
      if(token()!==requestedToken)return false;
      setUser(x.user);
      setMemberships(x.organizations);
      setCurrent((c) => x.organizations.find(item=>item.organization.id===c?.organization.id) || x.organizations[0] || null);
      return x;
    } catch {
      if(token()===requestedToken){sessions.clearActive();setUser(null);setMemberships([]);setCurrent(null);}
      return false;
    } finally {
      if (finishLoading) setLoading(false);
    }
  };
  useEffect(() => {
    let checking = false;
    const syncAccess = async (initial = false) => {
      if (checking) return;
      checking = true;
      try {
        const demo = await api<DemoConfig>("/demo-mode");
        setDemoMode(demo.enabled);
        setDemoConfig(demo);
        // The console has its own owner authentication; its catalog selection
        // must never choose the public app's working organization.
        if(view==='dev')return;
        const query=new URLSearchParams(location.search);
        const accountSignIn=query.get('login')==='1'&&(!demo.enabled||query.get('returnTo')==='dev');
        if(accountSignIn){
          sessions.select('work');
          if(initial)sessions.clearWork();
          setUser(null);setMemberships([]);setCurrent(null);
          return;
        }
        const nextContour=demo.enabled?'demo':'work';
        const switched=sessions.contour()!==nextContour;
        sessions.select(nextContour);
        if(switched&&!initial){setLoading(true);setSelected(null);setCreate(false);}
        const restored=token()?await load(false):false;
        if(shouldStartPublicDemo({enabled:demo.enabled,publicAccess:demo.features.publicAccess,restored:!!restored,explicitLogin:false})){
          const session=await api<{token:string}>('/auth/demo-session',{method:'POST'});
          sessions.saveDemo(session.token);
          await load(false);
        }else if(!restored){setUser(null);setMemberships([]);setCurrent(null);}

      } catch {
        // Ошибка загрузки не должна оставлять экран запуска навсегда.
      } finally {
        setLoading(false);
        checking = false;
      }
    };
    const resume = () => { if (document.visibilityState === "visible") void syncAccess(); };
    void syncAccess(true);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    const modeTimer=window.setInterval(()=>void syncAccess(),10000);
    return () => {
      window.clearInterval(modeTimer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
    };
  }, []);
  useEffect(() => {
    const savedScale = Number(localStorage.getItem("secretary-font-scale") || 100);
    const safeScale = [90, 100, 115, 130].includes(savedScale) ? savedScale : 100;
    document.documentElement.style.setProperty(
      "--interface-scale",
      String(safeScale / 100),
    );
    document.documentElement.style.setProperty("--interface-width", `${10000 / safeScale}%`);
  }, []);
  useEffect(() => {
    const organizationId = current?.organization.id;
    if (!organizationId) return;
    const storageKey = `secretary-meetings-view:${organizationId}`;
    const stored = localStorage.getItem(storageKey) as MeetingListView | null;
    setMeetingListView(meetingListViewOptions.some((option) => option.value === stored) ? stored! : "brief");
  }, [current?.organization.id]);
  useEffect(() => {
    if (current && view === "meetings")
      api<Meeting[]>(
        `/meetings?organizationId=${current.organization.id}`,
      ).then(setMeetings);
  }, [current?.organization.id, view]);
  useEffect(() => {
    if (!current || view !== "meetings" || !meetings.some((meeting) => meeting.state === "PROCESSING")) return;
    const refresh = () => api<Meeting[]>(`/meetings?organizationId=${current.organization.id}`).then(setMeetings).catch(() => undefined);
    const timer = window.setInterval(refresh, 5_000);
    return () => window.clearInterval(timer);
  }, [current?.organization.id, view, meetings.some((meeting) => meeting.state === "PROCESSING")]);
  useEffect(() => {
    const organizationId = current?.organization.id;
    if (loading || view === "admin" || view === "dev" || !user || !organizationId || workspaceTourStep !== null) return;
    const storageKey = `secretary-workspace-tour:${user.id}:${organizationId}:v1`;
    if (localStorage.getItem(storageKey)) return;
    localStorage.setItem(storageKey, "1");
    setSelected(null);
    setCreate(false);
    setView("meetings");
    setWorkspaceTourStep(0);
  }, [current?.organization.id, loading, user?.id, view, workspaceTourStep]);
  useEffect(() => { setExpandedMeeting(null); }, [current?.organization.id, departmentFilter, meetingListView, selected, create, view]);
  if (passwordResetTicket) return <LocalPasswordReset ticket={passwordResetTicket}/>;
  if (loading)
    return <div className="loading">Запускаем рабочее пространство…</div>;
  if (view === "dev")
    return (
      <Dev
        onBack={() => {
          const target = new URL(import.meta.env.BASE_URL, window.location.origin);
          target.searchParams.set("surface", "app");
          window.location.assign(target.href);
        }}
      />
    );
  if (!user)
    return (
      <Login
        demoAvailable={demoConfig.enabled&&demoConfig.features.publicAccess}
        onAuth={() => { window.location.assign(surfaceUrl('app')); }}
      />
    );
  if (!current) return <WorkspaceSetup email={user.email} onCreated={()=>{setLoading(true);void load();}}/>;
  const org = current.organization;
  const changeMeetingListView = (next: MeetingListView) => {
    setMeetingListView(next);
    localStorage.setItem(`secretary-meetings-view:${org.id}`, next);
  };
  const demoFeatures = demoConfig.enabled && user.email.endsWith('@demo.stenograf.local') ? demoConfig.features : defaultDemoFeatures;
  const visibleMeetings = departmentFilter
    ? meetings.filter((meeting) => meeting.department.id === departmentFilter)
    : meetings;
  const refreshOrganizations = async () => {
    const x = await api<{ user: User; organizations: Membership[] }>("/auth/me");
    setMemberships(x.organizations);
    setCurrent((existing) => x.organizations.find((item) => item.organization.id === existing?.organization.id) || x.organizations[0] || null);
  };
  const confirmMeetingDeletion = async () => {
    if (!deletingMeeting) return;
    setDeleteMeetingBusy(true);
    setDeleteMeetingError("");
    try {
      await api(`/meetings/${deletingMeeting.id}`, { method: "DELETE" });
      setMeetings((items) => items.filter((item) => item.id !== deletingMeeting.id));
      if (selected === deletingMeeting.id) setSelected(null);
      setDeletingMeeting(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось удалить встречу.";
      if (message.includes("Дождитесь завершения обработки")) {
        void api<Meeting[]>(`/meetings?organizationId=${org.id}`).then(setMeetings);
        setDeleteMeetingError("Статус встречи обновляется. Подождите несколько секунд и повторите удаление.");
      } else setDeleteMeetingError(message);
    } finally {
      setDeleteMeetingBusy(false);
    }
  };
  const navigateToView = (nextView: string) => {
    if(nextView==='admin'||surfaceForPath(location.pathname,import.meta.env.BASE_URL)) history.replaceState(null,'',surfaceUrl(nextView==='admin'?'admin':'app'));
    setSelected(null);
    setCreate(false);
    setView(nextView);
  };
  const tourMeeting = meetings.find((meeting) => meeting.state === "READY") || meetings[0];
  const advanceWorkspaceTour = (nextStep: number) => {
    setWorkspaceTourStep(nextStep);
    if (nextStep === 0) {
      navigateToView("meetings");
    } else if (nextStep >= 1 && nextStep <= 4) {
      navigateToView("meetings");
      setCreate(true);
    } else if (nextStep === 5 || nextStep === 6) {
      setCreate(false);
      setView("meetings");
      setSelected(tourMeeting?.id || null);
    } else if (nextStep === 7) {
      navigateToView("tasks");
    } else if (nextStep === 8) {
      navigateToView("tasks");
    } else if (nextStep === 9) {
      navigateToView("calendar");
    } else if (nextStep === 10) {
      navigateToView("calendar");
    } else if (nextStep === 11) {
      navigateToView("notifications");
    }
  };
  const blockedView = (view === "meetings" && !demoFeatures.meetings) || (view === "tasks" && !demoFeatures.tasks) || (view === "calendar" && !demoFeatures.calendar) || (view === "notifications" && !demoFeatures.notifications) || (view === "admin" && !demoFeatures.adminAccess && user.email.endsWith('@demo.stenograf.local'));
  const body = blockedView ? <section className="empty"><h1>Раздел выключен в демо-режиме</h1><p>Доступные возможности задаются в Dev-консоли.</p></section> : workspaceTourStep === 5 || workspaceTourStep === 6 ? (
    <TourMeetingPreview taskEditor={workspaceTourStep === 6} />
  ) : selected ? (
    <MeetingDetail
      id={selected}
      org={org}
      tourResultSection={workspaceTourStep === 6 ? "tasks" : undefined}
      onDelete={(meeting) => { setDeleteMeetingError(""); setDeletingMeeting(meeting); }}
      onBack={() => {
        setSelected(null);
        setView("meetings");
      }}
    />
  ) : create ? (
    <MeetingCreate
      org={org}
      canCheckCloud={['OWNER','ADMIN'].includes(current.role)}
      onCancel={() => { setCreate(false); setView("meetings"); void api<Meeting[]>(`/meetings?organizationId=${org.id}`).then(setMeetings); }}
      onDone={(meetingId, processing) => {
        setCreate(false);
        setView("meetings");
        if (processing) {
          setSelected(null);
          setProcessingNotice("Запись принята. Обработка идёт в фоне — карточка покажет ход и время.");
          void api<Meeting[]>(`/meetings?organizationId=${org.id}`).then(setMeetings);
        } else {
          setProcessingNotice("");
          setSelected(meetingId);
        }
      }}
    />
  ) : view === "tasks" ? (
    <Tasks org={org} tourPreview={workspaceTourStep === 7 || workspaceTourStep === 8} />
  ) : view === "calendar" ? (
    <Tasks org={org} calendar defaultCalendarView={user.email.endsWith('@demo.stenograf.local')?(demoConfig.calendarView||'month'):'month'} tourPreview={workspaceTourStep === 9 || workspaceTourStep === 10} />
  ) : view === "notifications" ? (
    <Notifications tourPreview={workspaceTourStep === 11} />
  ) : view === "admin" ? (
    <AdminGate org={org} onBack={() => navigateToView("meetings")} onOrganizationChanged={refreshOrganizations} tourSignal={adminTourSignal} demoMode={demoMode} />
  ) : (
    <section className="meetings">
      <header className="page-head">
        <div>
          <h1>
            Верифицированные встречи
            <br />и поручения
          </h1>
          <p>История, решения и открытые обязательства вашей организации.</p>
        </div>
        <div className="page-head__actions">
          <button data-tour-target="meeting-create" className="primary" onClick={() => setCreate(true)}>
            <Plus size={16} />
            Новая встреча
          </button>
        </div>
      </header>
      {processingNotice && <p className="meetings-processing-notice" role="status">{processingNotice}</p>}
      <WorkspaceDeck
        meetings={visibleMeetings}
        onCreate={() => setCreate(true)}
        onView={navigateToView}
      />
      <Usage orgId={org.id} onUsage={setDemoKeyUsage}/>
      <MainCloudConnections orgId={org.id} canManage={['OWNER','ADMIN'].includes(current.role)}><CollectionViewToggle value={meetingListView} onChange={changeMeetingListView} options={meetingListViewOptions} label="Представление списка встреч" /></MainCloudConnections>
      {user.email.endsWith('@demo.stenograf.local')&&!['OWNER','ADMIN'].includes(current.role)&&<p><a href={surfaceUrl('admin','cloud')}>Настроить облачные папки и режим «Файл / папка — встреча»</a> · пароль демо-админки: 1234</p>}
      <div className="metrics">
        <div>
          <span>Доступные встречи</span>
          <b>{visibleMeetings.length}</b>
        </div>
        <div>
          <span>Активные поручения</span>
          <b>{visibleMeetings.reduce((a, x) => a + x.tasks.length, 0)}</b>
        </div>
        <div>
          <span>Требует уточнения</span>
          <b>{visibleMeetings.filter((x) => x.state !== "READY").length}</b>
        </div>
        <div>
          <span>Просрочено дедлайнов</span>
          <b>0</b>
        </div>
      </div>
      {demoKeyUsage?.organizationId === org.id && demoKeyUsage.demo && <div className="demo-key-notice" role="status">
        <Lock size={18} aria-hidden="true" />
        <div><strong>{demoKeyUsage.platformKeyEnabled ? "Демо-режим с использованием ключа платформы" : "Демо-доступ · свой ключ OpenAI"}</strong>
          {demoKeyUsage.platformKeyEnabled
            ? <p>{demoKeyUsage.platformKeyConfigured ? "Для AI-обработки используется ключ платформы." : "Ключ платформы пока не сохранён. Обратитесь к разработчику для настройки."}</p>
            : <p>{demoKeyUsage.hasKey ? "Используется ваш ключ OpenAI из настроек демо-пространства. " : "Для работы введите свой ключ OpenAI API в админке. "}<a href={surfaceUrl('admin','integrations')}>Открыть настройки ключа</a><span> · Пароль демо-админки: <b>1234</b></span></p>}
        </div>
      </div>}
      <div className={`meeting-list meeting-list--${meetingListView}`} data-tour-fallback="meeting-results meeting-task-editor">
        {visibleMeetings.map((x) => (
          <MeetingCard
            key={x.id}
            meeting={x}
            view={meetingListView}
            expanded={expandedMeeting === x.id}
            onToggle={() => setExpandedMeeting((id) => id === x.id ? null : x.id)}
            onOpen={x.state === "PROCESSING" ? undefined : () => setSelected(x.id)}
            onTasks={x.state === "READY" && x.tasks.length ? () => setView("tasks") : undefined}
            onDelete={current.role === "OWNER" || current.role === "ADMIN" || x.creatorId === user.id ? () => { setDeleteMeetingError(""); setDeletingMeeting(x); } : undefined}
          />
        ))}
        {!visibleMeetings.length && (
          <div className="empty">
            <BookOpen size={28} />
            <h2>Встреч пока нет</h2>
            <p>Создайте первую, добавив заметки или аудиозапись.</p>
          </div>
        )}
      </div>
    </section>
  );
  return (
    <>
      <Top user={user} org={org} onView={navigateToView} view={view} onAdminTour={() => setAdminTourSignal((signal) => signal + 1)} onSiteGuide={() => advanceWorkspaceTour(0)} onUserUpdated={setUser} demoFeatures={demoFeatures} />
      <div className={`shell${view === "admin" ? " shell--admin" : ""}`}>
        <Sidebar
          user={user}
          orgs={memberships}
          current={current}
          setOrg={(x) => {
            setCurrent(x);
            setSelected(null);
            setCreate(false);
            setDepartmentFilter("");
          }}
          departmentFilter={departmentFilter}
          setDepartmentFilter={setDepartmentFilter}
          view={view}
          setView={navigateToView}
          demoFeatures={demoFeatures}
        />
        <main>{body}</main>
      </div>
      {workspaceTourStep !== null && <WorkspaceTour step={workspaceTourStep} onStep={advanceWorkspaceTour} onClose={() => { setWorkspaceTourStep(null); navigateToView("meetings"); }} />}
      {deletingMeeting && <ConfirmDelete title={`Удалить встречу «${deletingMeeting.title}»?`} description="Встреча, её файлы, расшифровка, протокол и связанные поручения будут удалены без возможности восстановления." busy={deleteMeetingBusy} error={deleteMeetingError} onCancel={() => setDeletingMeeting(null)} onConfirm={confirmMeetingDeletion} />}
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
