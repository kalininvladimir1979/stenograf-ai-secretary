const appBase = import.meta.env.BASE_URL.replace(/\/$/, "");
export const API =
  import.meta.env.VITE_API_URL ||
  (window.location.hostname === "localhost" ? "http://localhost:3002" : `${appBase}/api`);
export const token = () => localStorage.getItem("secretary-token") || "";
export const demoBrowser = () => {
  let id=localStorage.getItem('secretary-demo-browser');
  if(!id){id=crypto.randomUUID();localStorage.setItem('secretary-demo-browser',id);}return id;
};
const headers = (extra: HeadersInit = {}) => ({
  "Content-Type": "application/json",
  "x-demo-browser": demoBrowser(),
  ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
  ...extra,
});
export async function api<T>(path: string, init: RequestInit = {}) {
  let r: Response;
  try {
    r = await fetch(API + path, {
      ...init,
      headers: headers(init.headers),
    });
  } catch {
    throw new Error("Сервис временно недоступен. Проверьте подключение и повторите попытку.");
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Ошибка запроса");
  return data as T;
}
export async function audio(path: string, file: File) {
  const form = new FormData();
  form.append("audio", file);
  let r: Response;
  try {
    r = await fetch(API + path, {
      method: "POST",
      headers: { 'x-demo-browser':demoBrowser(), ...(token() ? { Authorization: `Bearer ${token()}` } : {}) },
      body: form,
    });
  } catch {
    throw new Error("Сервис загрузки временно недоступен. Повторите попытку.");
  }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Не удалось загрузить аудио");
  return d;
}
export async function video(path: string, file: File) {
  const form = new FormData();
  form.append("video", file);
  let r: Response;
  try {
    r = await fetch(API + path, {
      method: "POST",
      headers: { 'x-demo-browser':demoBrowser(), ...(token() ? { Authorization: `Bearer ${token()}` } : {}) },
      body: form,
    });
  } catch {
    throw new Error("Сервис подготовки видео временно недоступен. Повторите попытку.");
  }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Не удалось подготовить видео");
  return d;
}
export async function uploadAvatar(file: File) {
  const form = new FormData();
  form.append("avatar", file);
  let response: Response;
  try {
    response = await fetch(API + "/profile/avatar", {
      method: "POST",
      headers: { 'x-demo-browser':demoBrowser(), ...(token() ? { Authorization: `Bearer ${token()}` } : {}) },
      body: form,
    });
  } catch {
    throw new Error("Сервис загрузки временно недоступен. Повторите попытку.");
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Не удалось загрузить аватар.");
  return result;
}
export async function dev<T>(path: string, init: RequestInit = {}, passwordOverride?: string) {
  const devPassword = passwordOverride ?? sessionStorage.getItem("secretary-dev-password") ?? "";
  // Older installations redirected this host permanently. A fresh GET URL also
  // bypasses redirect entries retained by a browser profile after cookie removal.
  const requestUrl = new URL(API + path, window.location.href);
  if (!init.method || init.method.toUpperCase() === "GET") {
    requestUrl.searchParams.set("_dev_request", crypto.randomUUID());
  }
  let r: Response;
  try {
    r = await fetch(requestUrl.href, {
      ...init,
      cache: "no-store",
      // Developer credentials must never be forwarded to a different endpoint.
      redirect: "error",
      headers: headers({
        ...(devPassword ? { "x-dev-password": devPassword } : {}),
        ...init.headers,
      }),
    });
  } catch {
    throw new Error("Не удалось соединиться с Dev API. Проверьте подключение или блокировку запроса браузером. Перенаправления API запрещены.");
  }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || (r.status >= 500 ? `Dev API временно недоступен (HTTP ${r.status}). Повторите попытку.` : `Запрос Dev API отклонён (HTTP ${r.status}).`));
  return d as T;
}
