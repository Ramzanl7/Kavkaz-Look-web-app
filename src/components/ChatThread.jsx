import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api/index.js';

const hm = (d) => new Date(d).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
const dayKey = (d) => new Date(d).toDateString();
function dayLabel(d) {
  const x = new Date(d), today = new Date(), y = new Date(Date.now() - 864e5);
  if (x.toDateString() === today.toDateString()) return 'Сегодня';
  if (x.toDateString() === y.toDateString()) return 'Вчера';
  return x.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', ...(x.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) });
}

// Чат поддержки: включаем «режим чата» — без узора на фоне, чтобы ничто не мешало читать
export function useChatMode() {
  useEffect(() => {
    document.documentElement.classList.add('chat-mode');
    return () => document.documentElement.classList.remove('chat-mode');
  }, []);
}

// Лента сообщений. me — чьи сообщения справа: 'user' или 'admin'. readAt — когда собеседник последний раз читал (для ✓✓).
// renderOrder(id) — карточка прикреплённого заказа.
export default function ChatThread({ messages, me, readAt, renderOrder }) {
  const end = useRef(null);
  const [urls, setUrls] = useState({}), [view, setView] = useState(null);
  const count = messages.length;
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [count]);
  const paths = messages.map((m) => m.image_path).filter(Boolean).join(',');
  useEffect(() => { if (paths) api.supportImageUrls(paths.split(',')).then((u) => setUrls((x) => ({ ...x, ...u }))); }, [paths]);
  let lastDay = '';
  return (
    <div className="chat" role="log" aria-live="polite">
      {messages.map((m) => {
        const day = dayKey(m.created_at), sep = day !== lastDay; lastDay = day;
        const mine = m.author === me;
        const read = mine && readAt && new Date(readAt) >= new Date(m.created_at);
        return (
          <div key={m.id} className="chat-row">
            {sep && <div className="chat-day"><span>{dayLabel(m.created_at)}</span></div>}
            <div className={'bubble' + (mine ? ' mine' : '')}>
              {!mine && <span className="bubble-who">{m.author === 'admin' ? 'Поддержка' : 'Пользователь'}</span>}
              {m.image_path && (urls[m.image_path]
                ? <button type="button" className="bubble-img" onClick={() => setView(urls[m.image_path])}><img src={urls[m.image_path]} alt="Фото" loading="lazy" /></button>
                : <span className="bubble-img skeleton" />)}
              {m.order_id && renderOrder?.(m.order_id)}
              {m.body && <p>{m.body}</p>}
              <span className="bubble-meta"><time>{hm(m.created_at)}</time>{mine && <i className={'tick' + (read ? ' read' : '')} aria-label={read ? 'Прочитано' : 'Отправлено'}>{read ? '✓✓' : '✓'}</i>}</span>
            </div>
          </div>
        );
      })}
      <div ref={end} className="chat-end" />
      {view && createPortal(<div className="img-view" role="dialog" aria-label="Фото" onClick={() => setView(null)}><img src={view} alt="" /><button type="button" className="img-close" aria-label="Закрыть">×</button></div>, document.body)}
    </div>
  );
}

// Поле ввода: текст, фото и прикреплённый заказ. orders — что можно прикрепить; quick — быстрые ответы над полем.
export function ChatComposer({ onSend, orders = [], quick = [], placeholder = 'Сообщение…', orderTitle }) {
  const [text, setText] = useState(''), [file, setFile] = useState(null), [preview, setPreview] = useState(null), [order, setOrder] = useState(''), [sheet, setSheet] = useState(false), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const ta = useRef(null), inp = useRef(null);
  useEffect(() => { const el = ta.current; if (el) { el.style.height = 'auto'; el.style.height = Math.min(140, el.scrollHeight) + 'px'; } }, [text]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const pickFile = (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; setFile(f); setPreview(URL.createObjectURL(f)); setSheet(false); };
  const send = async (body = text) => {
    if (busy || (!body.trim() && !file)) return;
    setBusy(true); setErr('');
    const e = await onSend({ text: body, file, orderId: order });
    setBusy(false);
    if (e) { setErr(e); return; }
    setText(''); setFile(null); setPreview(null); setOrder('');
  };
  const o = orders.find((x) => x.id === order);
  return (
    <div className="composer">
      {quick.length > 0 && !text && !file && <div className="quick">{quick.map((q) => <button key={q} type="button" className="quick-chip press" disabled={busy} onClick={() => setText(q)}>{q}</button>)}</div>}
      {(file || o) && (
        <div className="attach-row">
          {file && <span className="attach-chip"><img src={preview} alt="" /> Фото<button type="button" aria-label="Убрать фото" onClick={() => { setFile(null); setPreview(null); }}>×</button></span>}
          {o && <span className="attach-chip">📦 {orderTitle(o)}<button type="button" aria-label="Открепить заказ" onClick={() => setOrder('')}>×</button></span>}
        </div>
      )}
      <form className="composer-row" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <button type="button" className="composer-btn" aria-label="Прикрепить" onClick={() => setSheet(true)}>📎</button>
        <textarea ref={ta} rows={1} maxLength={2000} placeholder={placeholder} aria-label="Сообщение" value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) { e.preventDefault(); send(); } }} />
        <button type="submit" className="composer-send" aria-label="Отправить" disabled={busy || (!text.trim() && !file)}>{busy ? '…' : '➤'}</button>
      </form>
      {err && <p className="msg" role="alert">{err}</p>}
      <input ref={inp} type="file" accept="image/*" hidden onChange={pickFile} />
      {sheet && createPortal(
        <div className="sheet-bg" onClick={() => setSheet(false)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label="Прикрепить" onClick={(e) => e.stopPropagation()}>
            <h2>Прикрепить</h2>
            <button type="button" className="btn btn-secondary press" onClick={() => inp.current?.click()}>📷 Фото или скриншот</button>
            {orders.length > 0 && <>
              <p className="muted small">Или выберите заказ, о котором вопрос:</p>
              <div className="attach-orders">{orders.map((x) => (
                <button key={x.id} type="button" className={'attach-order press' + (x.id === order ? ' on' : '')} onClick={() => { setOrder(x.id); setSheet(false); }}>{orderTitle(x)}</button>
              ))}</div>
            </>}
          </div>
        </div>, document.body)}
    </div>
  );
}
