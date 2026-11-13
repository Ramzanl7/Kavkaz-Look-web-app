import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api/index.js';
import { rub } from '../store/cart.jsx';
import { useAction } from '../lib/useAction.js';
import ChatThread from '../components/ChatThread.jsx';

// Чат с поддержкой внутри приложения: один диалог на человека, можно прикрепить заказ.
export default function SupportChat() {
  const { user, role } = useAuth();
  const [data, setData] = useState(undefined);
  const [text, setText] = useState(''), [orderId, setOrderId] = useState(''), [orders, setOrders] = useState([]), [msg, setMsg] = useState('');
  const [busy, run] = useAction(300);
  const load = useCallback(async () => {
    const d = await api.supportThread();
    setData(d);
    if (d?.thread?.user_unread) api.supportRead();
  }, []);
  useEffect(() => { load(); }, [load]);
  // Пока экран открыт — проверяем новые ответы каждые 8 секунд
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 8000);
    return () => clearInterval(t);
  }, [load]);
  // Заказы, которые можно прикрепить: свои покупки и (для продавца) заказы бутика
  useEffect(() => {
    if (!user) return;
    (async () => {
      const mine = (await api.listMyOrders(user.id)) || [];
      let shop = [];
      if (role === 'seller') { const b = await api.getMyBoutique(user.id); if (b) shop = (await api.listSellerOrders(b.id)) || []; }
      const all = [...shop.map((o) => ({ ...o, mine: false })), ...mine.map((o) => ({ ...o, mine: true }))];
      setOrders(all.slice(0, 30));
    })();
  }, [user, role]);
  const send = (e) => { e?.preventDefault(); return run(async () => {
    setMsg('');
    const err = await api.supportSend(text, orderId);
    if (err) { setMsg(err); return; }
    setText(''); setOrderId(''); await load();
  }); };
  const label = (o) => `№ ${o.id.slice(0, 8)} · ${o.mine ? o.boutique?.name || 'покупка' : 'заказ бутика'} · ${rub(o.total_rub)}`;
  const orderLabel = (id) => { const o = orders.find((x) => x.id === id); return o ? label(o) : '№ ' + id.slice(0, 8); };

  return (
    <main className="wrap chat-wrap">
      <h1 className="screen-title rise">Чат с поддержкой</h1>
      {data === undefined ? <p className="lead">Загрузка…</p> : data === null ? (
        <p className="notice">Чат поддержки скоро заработает. Пока напишите нам в <Link className="link-u" to="/support">другие каналы</Link>.</p>
      ) : <>
        {data.messages.length === 0 && (
          <div className="chat-hello">
            <strong>Здравствуйте! Чем помочь?</strong>
            <span className="muted small">Опишите вопрос — по заказу, бутику или приложению. Если вопрос по заказу, прикрепите его ниже. Обычно отвечаем в течение дня.</span>
          </div>
        )}
        <ChatThread messages={data.messages} me="user" orderLabel={orderLabel} />
        {data.thread?.status === 'closed' && <p className="muted small chat-closed">Вопрос отмечен как решённый. Напишите, если нужна ещё помощь — диалог откроется снова.</p>}
        <form className="chat-form" onSubmit={send}>
          {orders.length > 0 && (
            <select aria-label="Прикрепить заказ" value={orderId} onChange={(e) => setOrderId(e.target.value)}>
              <option value="">Без заказа</option>
              {orders.map((o) => <option key={o.id} value={o.id}>{label(o)}</option>)}
            </select>
          )}
          <div className="chat-input">
            <textarea aria-label="Сообщение" rows={2} maxLength={2000} placeholder="Ваше сообщение…" value={text} onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) { e.preventDefault(); send(); } }} />
            <button type="submit" className="btn btn-primary press" disabled={!!busy || !text.trim()}>{busy ? '…' : 'Отправить'}</button>
          </div>
          {msg && <p className="msg" role="alert">{msg}</p>}
        </form>
      </>}
    </main>
  );
}
