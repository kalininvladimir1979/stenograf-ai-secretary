import {useEffect, useState} from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {RefreshCw} from 'lucide-react';
import {API, token, demoBrowser} from './api';

export default function MeetingNotes({meetingId, revision}: {meetingId: string; revision?: string}) {
  const [refresh, setRefresh] = useState(0);
  const [markdown, setMarkdown] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setMarkdown('');
    (async () => {
      try {
        const response = await fetch(`${API}/meetings/${meetingId}/export?format=md`, {
          signal: controller.signal,
          headers: {'x-demo-browser': demoBrowser(), ...(token() ? {Authorization: `Bearer ${token()}`} : {})},
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || 'Не удалось открыть конспект. Повторите попытку.');
        }
        const text = await response.text();
        if (!controller.signal.aborted) setMarkdown(text);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Не удалось открыть конспект.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [meetingId, revision, refresh]);

  return <section className="meeting-notes" aria-label="Конспект встречи" aria-busy={loading}>
    <header className="meeting-notes__toolbar">
      <p>Содержимое Markdown-экспорта. Изменения появятся здесь после сохранения встречи.</p>
      <button type="button" className="outline" disabled={loading} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={14} aria-hidden="true"/>Обновить</button>
    </header>
    {loading ? <p className="meeting-notes__notice" role="status">Открываем конспект…</p>
      : error ? <p className="meeting-notes__notice" role="alert">{error}</p>
      : !markdown.trim() ? <p className="meeting-notes__notice">Конспект пока пуст. Добавьте материалы встречи и выполните анализ.</p>
      : <article className="meeting-notes__document">
          <Markdown remarkPlugins={[remarkGfm]} skipHtml components={{
            h1: ({children}) => <h2 className="meeting-notes__title">{children}</h2>,
            h2: ({children}) => <h3>{children === 'Follow-up' ? 'Письмо по итогам встречи' : children}</h3>,
            h3: ({children}) => <h4>{children}</h4>,
            a: ({href, children}) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
            img: ({alt}) => <span>{alt || 'Изображение'}</span>,
            table: ({children}) => <div className="meeting-notes__table"><table>{children}</table></div>,
          }}>{markdown}</Markdown>
        </article>}
  </section>;
}
