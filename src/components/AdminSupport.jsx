import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/index.js';
import { rub } from '../store/cart.jsx';
import { useAction } from '../lib/useAction.js';
import { useToast } from '../store/toast.jsx';
import ChatThread from './ChatThread.jsx';
import { STATUS, DELIVERY, PAYMENT } from '../pages/Orders.jsx';

const ROLE = { buyer: 'Покупатель', seller: 'Продавец', admin: 'Админ' };
const ago = (d) => new Date(d).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// Поддержка в админке: список обращений → переписка с человеком
export default function AdminSupport() {
  const { id } = useParams();
  const nav = useNavigate();
  const [list, setList] = useState(null), [f, setF] = useState('open');
  const loadList = useCallback(() => api.adminSupportThreads().then(setList), []);
  useEffect(() => { loadList(); const t = setInterval(() => document.visibilityState === 'visible' && loadList(), 15000); return () => clearInterval(t); }, [loadList]);
  if (id) return <Thread id={id} info={(list || []).find((t) => t.id === id)} onBack={() => { nav('/admin/s/support'); loadList(); }} />;
  if (list === null) return <p className="lead">Загрузка… Если список не появляется — выполните последний SQL.</p>;
  const shown = list.filter((t) => f === 'all' || t.status === f);
  return <>
    <div className="chips">{[['open', 'Открытые'], ['closed', 'Решённые'], ['all', 'Все']].map(([v, l]) => <button key={v} type="button" className={'chip' + (f === v ? ' on' : '')} onClick={() => setF(v)}>{l}{v === 'open' ? ` · ${list.filter((t) => t.status === 'open').length}` : ''}</button>)}</div>
    {shown.length ? <div className="menu">{shown.map((t) => (
      <button key={t.id} type="button" className="menu-item press thread-row" onClick={() => nav('/admin/s/support/' + t.id)}>
        <span className="grow">
          <strong className="block">{t.name || t.email || 'Без имени'} <small className="muted">· {ROLE[t.role] || ''}{t.boutique ? ' «' + t.boutique + '»' : ''}</small></strong>
          <small className="muted">{t.last_preview}</small>
        </span>
        <span className="thread-side"><small className="muted">{ago(t.last_message_at)}</small>{t.admin_unread > 0 && <i className="pill-count">{t.admin_unread}</i>}</span>
      </button>
    ))}</div> : <p className="muted">{f === 'open' ? 'Открытых обращений нет.' : 'Пусто.'}</p>}
  </>;
}

function Thread({ id, info, onBack }) {
  const [msgs, setMsgs] = useState(null), [text, setText] = useState(''), [err, setErr] = useState(''), [order, setOrder] = useState(null), [closed, setClosed] = useState(info?.status === 'closed');
  const [busy, run] = useAction(300); const toast = useToast();
  const load = useCallback(async () => { setMsgs(await api.adminSupportMessages(id)); api.supportRead(id); }, [id]);
  useEffect(() => { load(); const t = setInterval(() => document.visibilityState === 'visible' && load(), 8000); return () => clearInterval(t); }, [load]);
  useEffect(() => { if (info) setClosed(info.status === 'closed'); }, [info]);
  const send = (e) => { e?.preventDefault(); return run(async () => {
    setErr(''); const r = await api.supportReply(id, text);
    if (r) { setErr(r); return; } setText(''); await load();
  }); };
  const setStatus = (c) => run(async () => { if (await api.supportSetStatus(id, c)) { setClosed(c); toast(c ? 'Обращение закрыто' : 'Обращение открыто'); } });
  return <>
    <button type="button" className="link-muted" onClick={onBack}>← Все обращения</button>
    {info && <div className="bcard"><strong>{info.name || 'Без имени'} · {ROLE[info.role] || ''}</strong><span className="small">{info.email}{info.boutique ? ' · бутик «' + info.boutique + '»' : ''}</span></div>}
    {msgs === null ? <p className="lead">Загрузка…</p> : <ChatThread messages={msgs} me="admin" orderLabel={(o) => '№ ' + o.slice(0, 8)} onOrder={(o) => api.adminOrder(o).then(setOrder)} />}
    {order && (
      <div className="bcard order-card">
        <strong>Заказ № {order.id.slice(0, 8)} · {STATUS[order.status]}</strong>
        <span className="small">{order.boutique?.name} · {DELIVERY[order.delivery] || ''}{order.delivery === 'courier' ? ' · ' + (PAYMENT[order.payment] || '') : ''} · {new Date(order.created_at).toLocaleString('ru-RU')}</span>
        <ul className="order-items">{(order.items || []).map((i, n) => <li key={n}><span>{i.title}{i.size ? ', ' + i.size : ''} × {i.qty}</span><b>{rub(i.price_rub * i.qty)}</b></li>)}</ul>
        <span className="small">{[order.phone, order.address].filter(Boolean).join(' · ') || 'Контакт удалён после закрытия заказа'}</span>
        <div className="order-foot"><span>Итого</span><b className="price">{rub(order.total_rub)}</b></div>
        <button type="button" className="link-muted" onClick={() => setOrder(null)}>Скрыть заказ</button>
      </div>
    )}
    <form className="chat-form" onSubmit={send}>
      <div className="chat-input">
        <textarea aria-label="Ответ" rows={2} maxLength={2000} placeholder="Ответ пользователю…" value={text} onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="btn btn-primary press" disabled={!!busy || !text.trim()}>Ответить</button>
      </div>
      {err && <p className="msg" role="alert">{err}</p>}
    </form>
    <button type="button" className="btn btn-secondary press" disabled={!!busy} onClick={() => setStatus(!closed)}>{closed ? 'Открыть снова' : 'Вопрос решён — закрыть'}</button>
  </>;
}
