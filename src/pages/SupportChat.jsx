import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api/index.js';
import { rub } from '../store/cart.jsx';
import ChatThread, { ChatComposer, useChatMode } from '../components/ChatThread.jsx';
import { STATUS } from './Orders.jsx';

const TOPICS = ['Где мой заказ?', 'Хочу обменять или вернуть товар', 'Проблема с оплатой', 'Вопрос по товару', 'Не приходит код или не могу войти', 'Хочу продавать в Kavkaz Look'];
const orderTitle = (o) => `${o.items?.[0]?.title || 'Заказ'}${o.items?.length > 1 ? ' и ещё ' + (o.items.length - 1) : ''} · ${rub(o.total_rub)}`;

// Чат с поддержкой: как мессенджер — фото, заказ, отметки «прочитано», без отвлекающего фона
export default function SupportChat() {
  useChatMode();
  const { user, role } = useAuth();
  const [data, setData] = useState(undefined), [orders, setOrders] = useState([]), [hours, setHours] = useState('');
  const load = useCallback(async () => {
    const d = await api.supportThread();
    setData(d);
    if (d?.thread?.user_unread) api.supportRead();
  }, []);
  useEffect(() => { load(); api.getSupportContacts().then((c) => setHours(c?.hours || '')); }, [load]);
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 5000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    if (!user) return;
    (async () => {
      const mine = (await api.listMyOrders(user.id)) || [];
      let shop = [];
      if (role === 'seller') { const b = await api.getMyBoutique(user.id); if (b) shop = (await api.listSellerOrders(b.id)) || []; }
      setOrders([...mine, ...shop].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 30));
    })();
  }, [user, role]);
  const send = async ({ text, file, orderId }) => { const e = await api.supportSend(text, orderId, file); if (!e) await load(); return e; };
  const renderOrder = (id) => {
    const o = orders.find((x) => x.id === id);
    return (
      <Link className="bubble-order" to="/orders">
        <b>📦 Заказ № {id.slice(0, 8)}</b>
        {o && <span>{orderTitle(o)} · {STATUS[o.status]}</span>}
      </Link>
    );
  };
  return (
    <main className="chat-screen">
      <header className="chat-head">
        <span className="chat-ava" aria-hidden="true">K</span>
        <span className="grow"><strong>Поддержка Kavkaz Look</strong><small>{hours ? (/^[А-ЯЁA-Z]/.test(hours) ? hours : 'Работаем ' + hours) : 'Обычно отвечаем в течение дня'}</small></span>
      </header>
      {data === undefined ? <p className="chat-note">Загрузка…</p> : data === null ? (
        <p className="chat-note">Чат поддержки скоро заработает. Пока напишите нам в <Link className="link-u" to="/support">другие каналы</Link>.</p>
      ) : <>
        <div className="chat-body">
          {data.messages.length === 0 ? (
            <div className="chat-empty">
              <strong>Здравствуйте! Чем помочь?</strong>
              <span>Выберите тему ниже или напишите своими словами. Можно прикрепить фото и заказ — кнопка 📎.</span>
            </div>
          ) : <ChatThread messages={data.messages} me="user" readAt={data.thread?.admin_read_at} renderOrder={renderOrder} />}
          {data.thread?.status === 'closed' && <p className="chat-note">Вопрос отмечен как решённый. Напишите, если нужна ещё помощь.</p>}
        </div>
        <ChatComposer onSend={send} orders={orders} orderTitle={(o) => `№ ${o.id.slice(0, 8)} · ${orderTitle(o)}`} quick={data.messages.length ? [] : TOPICS} placeholder="Ваше сообщение…" />
      </>}
    </main>
  );
}
