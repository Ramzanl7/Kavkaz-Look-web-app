import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/index.js';
import { rub } from '../store/cart.jsx';
import { useAction } from '../lib/useAction.js';
import { useToast } from '../store/toast.jsx';
import ChatThread, { ChatComposer, useChatMode } from './ChatThread.jsx';
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

const TEMPLATES = [
  'Здравствуйте! Сейчас проверим и ответим.',
  'Связались с бутиком — заказ уже в работе.',
  'Пришлите, пожалуйста, фото товара и чека.',
  'Оформите возврат через бутик — мы предупредили их.',
  'Спасибо, что написали! Если будут вопросы — пишите.',
];

// Карточка прикреплённого заказа: состав и сумма подгружаются по требованию
function OrderMini({ id }) {
  const [o, setO] = useState(undefined), [open, setOpen] = useState(false);
  useEffect(() => { api.adminOrder(id).then(setO); }, [id]);
  return (
    <button type="button" className="bubble-order" onClick={() => setOpen(!open)}>
      <b>📦 Заказ № {id.slice(0, 8)}{o ? ' · ' + STATUS[o.status] : ''}</b>
      {o && <span>{o.boutique?.name} · {rub(o.total_rub)}{o.delivery ? ' · ' + (DELIVERY[o.delivery] || '') : ''}</span>}
      {open && o && <>
        {(o.items || []).map((i, n) => <span key={n}>{i.title}{i.size ? ', ' + i.size : ''} × {i.qty} — {rub(i.price_rub * i.qty)}</span>)}
        <span>{o.delivery === 'courier' ? (PAYMENT[o.payment] || '') + ' · ' : ''}{[o.phone, o.address].filter(Boolean).join(' · ') || 'Контакт удалён после закрытия'}</span>
      </>}
    </button>
  );
}

function Thread({ id, info, onBack }) {
  useChatMode();
  const [msgs, setMsgs] = useState(null), [t, setT] = useState(null), [orders, setOrders] = useState(null), [showOrders, setShowOrders] = useState(false);
  const [busy, run] = useAction(300); const toast = useToast();
  const load = useCallback(async () => {
    const [m, th] = await Promise.all([api.adminSupportMessages(id), api.adminSupportThread(id)]);
    setMsgs(m); setT(th); api.supportRead(id);
  }, [id]);
  useEffect(() => { load(); const iv = setInterval(() => document.visibilityState === 'visible' && load(), 5000); return () => clearInterval(iv); }, [load]);
  useEffect(() => { if (t?.user_id && orders === null) api.adminUserOrders(t.user_id).then(setOrders); }, [t, orders]);
  const closed = t?.status === 'closed';
  const send = async ({ text, file }) => { const e = await api.supportReply(id, text, file); if (!e) await load(); return e; };
  const setStatus = (c) => run(async () => { if (await api.supportSetStatus(id, c)) { toast(c ? 'Обращение закрыто' : 'Обращение открыто'); load(); } });
  return (
    <div className="chat-screen admin-chat">
      <header className="chat-head">
        <span className="chat-ava" aria-hidden="true">{(info?.name || info?.email || '?').slice(0, 1).toUpperCase()}</span>
        <span className="grow"><strong>{info?.name || info?.email || 'Пользователь'}</strong><small>{[ROLE[info?.role], info?.boutique && '«' + info.boutique + '»', info?.email].filter(Boolean).join(' · ')}</small></span>
        <button type="button" className={'chat-status' + (closed ? '' : ' open')} disabled={!!busy} onClick={() => setStatus(!closed)}>{closed ? 'Открыть' : 'Решено ✓'}</button>
      </header>
      <button type="button" className="chat-orders-toggle" onClick={() => setShowOrders(!showOrders)}>{showOrders ? 'Скрыть заказы' : `Заказы этого человека${orders ? ' · ' + orders.length : ''}`}</button>
      {showOrders && <div className="chat-orders">{orders?.length ? orders.map((o) => (
        <div key={o.id} className="chat-order"><b>№ {o.id.slice(0, 8)} · {STATUS[o.status]} · {rub(o.total_rub)}</b><span>{o.boutique} · {DELIVERY[o.delivery] || ''} · {new Date(o.created_at).toLocaleDateString('ru-RU')}</span><span className="muted">{o.items}</span></div>
      )) : <p className="muted small">Заказов нет.</p>}</div>}
      <div className="chat-body">
        {msgs === null ? <p className="chat-note">Загрузка…</p> : <ChatThread messages={msgs} me="admin" readAt={t?.user_read_at} renderOrder={(oid) => <OrderMini id={oid} />} />}
      </div>
      <ChatComposer onSend={send} quick={TEMPLATES} placeholder="Ответ пользователю…" orderTitle={() => ''} />
    </div>
  );
}
