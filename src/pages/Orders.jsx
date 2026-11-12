import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import EmptyState from '../components/EmptyState.jsx';
import { rub, useCart } from '../store/cart.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { useToast } from '../store/toast.jsx';
import { api } from '../api/index.js';
import { useAction } from '../lib/useAction.js';

export const STATUS = { new: 'Новый', confirmed: 'Подтверждён', done: 'Выполнен', cancelled: 'Отменён' };
export const DELIVERY = { pickup: 'Самовывоз из бутика', courier: 'Доставка курьером' };
const STEPS = ['new', 'confirmed', 'done'];

// Шаги заказа: принят → подтверждён продавцом → выполнен
export function OrderSteps({ status }) {
  if (status === 'cancelled') return <p className="order-cancel">Заказ отменён</p>;
  const at = STEPS.indexOf(status);
  return (
    <ol className="order-steps" aria-label={'Статус: ' + (STATUS[status] || status)}>
      {['Принят', 'Подтверждён', 'Выполнен'].map((l, i) => <li key={l} className={i <= at ? 'on' : ''}><i />{l}</li>)}
    </ol>
  );
}

export default function Orders() {
  const { user } = useAuth();
  const { add } = useCart();
  const toast = useToast();
  const nav = useNavigate();
  const [items, setItems] = useState(null);
  const load = useCallback(() => api.listMyOrders(user?.id).then(setItems), [user]);
  useEffect(() => { load(); }, [load]);
  const [busy, run] = useAction();
  const cancel = (id) => run(async () => { if (window.confirm('Отменить заказ?') && (await api.setOrderStatus(id, 'cancelled'))) await load(); }, id);
  const repeat = (o) => run(async () => {
    const ps = await api.listProductsByIds(o.items.map((i) => i.product_id));
    let n = 0;
    for (const i of o.items) {
      const p = ps.find((x) => x.id === i.product_id);
      if (!p || (i.size && !p.sizes?.includes(i.size))) continue;
      for (let k = 0; k < i.qty; k++) add(p, i.size || null);
      n++;
    }
    if (n) { toast(n < o.items.length ? 'Добавлено в корзину (часть товаров больше не продаётся)' : 'Добавлено в корзину'); nav('/cart'); } else toast('Эти товары больше не продаются');
  }, 'r' + o.id);
  return (
    <main className="wrap">
      <h1 className="screen-title rise">Мои заказы</h1>
      {items === null ? <p className="lead">Загрузка…</p> : items.length ? (
        <div className="list">{items.map((o) => (
          <article key={o.id} className="bcard order-card">
            <div className="order-head">
              <strong>{o.boutique?.name || 'Заказ'}</strong>
              <span className="muted small">№ {o.id.slice(0, 8)} · {new Date(o.created_at).toLocaleDateString('ru-RU')}</span>
            </div>
            <OrderSteps status={o.status} />
            <ul className="order-items">
              {o.items.map((i, n) => <li key={n}><span>{i.title}{i.size ? `, размер ${i.size}` : ''} × {i.qty}</span><b>{rub(i.price_rub * i.qty)}</b></li>)}
            </ul>
            {o.delivery && <span className="muted small">{DELIVERY[o.delivery]}{o.address ? ': ' + o.address : ''} · оплата при получении</span>}
            <div className="order-foot"><span>Итого</span><b className="price">{rub(o.total_rub)}</b></div>
            <div className="acts">
              {o.boutique?.id && <Link className="act press" to={'/boutiques/' + o.boutique.id}>Бутик</Link>}
              <button type="button" className="act press" disabled={busy === 'r' + o.id} onClick={() => repeat(o)}>Повторить</button>
              {o.status === 'new' && <button type="button" className="act danger press" disabled={busy === o.id} onClick={() => cancel(o.id)}>{busy === o.id ? 'Отменяем…' : 'Отменить'}</button>}
            </div>
          </article>
        ))}</div>
      ) : <EmptyState title="Заказов пока нет" action={<Link className="link-u" to="/catalog">В каталог</Link>} />}
    </main>
  );
}
