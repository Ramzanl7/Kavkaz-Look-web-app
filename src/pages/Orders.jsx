import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import EmptyState from '../components/EmptyState.jsx';
import { rub } from '../store/cart.jsx';
import { api } from '../api/index.js';
export const STATUS = { new: 'Новый', confirmed: 'Подтверждён', done: 'Выполнен', cancelled: 'Отменён' };
export default function Orders() {
  const [items, setItems] = useState(null);
  const load = useCallback(() => api.listMyOrders().then(setItems), []);
  useEffect(() => { load(); }, [load]);
  const cancel = async (id) => { if (window.confirm('Отменить заказ?') && (await api.setOrderStatus(id, 'cancelled'))) load(); };
  return (
    <main className="wrap">
      <h1 className="screen-title rise">Мои заказы</h1>
      {items === null ? <p className="lead">Загрузка…</p> : items.length ? (
        <div className="list">{items.map((o) => (
          <div key={o.id} className="bcard">
            <strong>{rub(o.total_rub)} · {STATUS[o.status] || o.status}</strong>
            <span className="muted">{new Date(o.created_at).toLocaleDateString('ru-RU')}</span>
            {o.items.map((i, n) => <span key={n} className="muted">{i.title} × {i.qty}</span>)}
            {o.status === 'new' && <button type="button" className="link-u" style={{ justifySelf: 'start' }} onClick={() => cancel(o.id)}>Отменить заказ</button>}
          </div>
        ))}</div>
      ) : <EmptyState title="Заказов пока нет" action={<Link className="link-u" to="/catalog">В каталог</Link>} />}
    </main>
  );
}
