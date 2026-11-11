import { useCallback, useEffect, useState } from 'react';
import EmptyState from '../components/EmptyState.jsx';
import { rub } from '../store/cart.jsx';
import { api } from '../api/index.js';
import { STATUS } from './Orders.jsx';
import { useAction } from '../lib/useAction.js';
export default function SellerOrders() {
  const [items, setItems] = useState(null);
  const [msg, setMsg] = useState('');
  const load = useCallback(() => api.listMyOrderItems().then(setItems), []);
  useEffect(() => { load(); }, [load]);
  const [busy, run] = useAction();
  const act = (id, status) => run(async () => { setMsg(''); if (await api.setOrderStatus(id, status)) await load(); else setMsg('Статус не изменён. Заказы с товарами других бутиков меняет администратор.'); }, id);
  return (
    <main className="wrap">
      <h1 className="screen-title rise">Заказы бутика</h1>
      {msg && <p className="msg" role="status">{msg}</p>}
      {items === null ? <p className="lead">Загрузка…</p> : items.length ? (
        <div className="list">{items.map((i) => (
          <div key={i.id} className="bcard">
            <strong>{i.title} × {i.qty}</strong>
            <span className="muted">{rub(i.price_rub * i.qty)} · {STATUS[i.order?.status] || ''} · {i.order ? new Date(i.order.created_at).toLocaleDateString('ru-RU') : ''}</span>
            {i.order && (
              <div className="acts" aria-busy={busy === i.order.id}>
                {i.order.status === 'new' && <button type="button" className="act ok press" disabled={busy === i.order.id} onClick={() => act(i.order.id, 'confirmed')}>Подтвердить</button>}
                {i.order.status === 'confirmed' && <button type="button" className="act ok press" disabled={busy === i.order.id} onClick={() => act(i.order.id, 'done')}>Выполнен</button>}
                {['new', 'confirmed'].includes(i.order.status) && <button type="button" className="act danger press" disabled={busy === i.order.id} onClick={() => act(i.order.id, 'cancelled')}>Отменить</button>}
              </div>
            )}
          </div>
        ))}</div>
      ) : <EmptyState title="Заказов пока нет" />}
    </main>
  );
}
