import { useCallback, useEffect, useState } from 'react';
import EmptyState from '../components/EmptyState.jsx';
import { rub } from '../store/cart.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api/index.js';
import { STATUS, DELIVERY, OrderSteps, holdText } from './Orders.jsx';
import { useAction } from '../lib/useAction.js';

const FILTERS = [['active', 'Активные'], ['done', 'Выполненные'], ['cancelled', 'Отменённые'], ['all', 'Все']];
const waNumber = (ph) => { const d = String(ph || '').replace(/\D/g, ''); return d.length === 11 && d[0] === '8' ? '7' + d.slice(1) : d; };

// Заказы бутика: каждый заказ — только ваши товары; телефон и адрес покупателя видны, пока заказ не закрыт
export default function SellerOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState(null);
  const [filter, setFilter] = useState('active');
  const [msg, setMsg] = useState('');
  const load = useCallback(async () => {
    const b = user ? await api.getMyBoutique(user.id) : null;
    setOrders(b ? await api.listSellerOrders(b.id) : []);
  }, [user]);
  useEffect(() => { load(); }, [load]);
  const [busy, run] = useAction();
  const act = (id, status, ask) => run(async () => {
    if (ask && !window.confirm(ask)) return;
    setMsg('');
    if (await api.setOrderStatus(id, status)) await load(); else setMsg('Статус не изменён. Попробуйте ещё раз.');
  }, id);
  const shown = (orders || []).filter((o) => filter === 'all' || (filter === 'active' ? ['new', 'confirmed'].includes(o.status) : o.status === filter));
  const count = (orders || []).filter((o) => o.status === 'new').length;
  return (
    <main className="wrap">
      <h1 className="screen-title rise">Заказы бутика</h1>
      <div className="chips">
        {FILTERS.map(([v, l]) => <button key={v} type="button" className={'chip' + (filter === v ? ' on' : '')} onClick={() => setFilter(v)}>{l}{v === 'active' && count ? ` · ${count} новых` : ''}</button>)}
      </div>
      {msg && <p className="msg" role="status">{msg}</p>}
      {orders === null ? <p className="lead">Загрузка…</p> : shown.length ? (
        <div className="list">{shown.map((o) => (
          <article key={o.id} className="bcard order-card">
            <div className="order-head">
              <strong>№ {o.id.slice(0, 8)} · {STATUS[o.status]}</strong>
              <span className="muted small">{new Date(o.created_at).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <OrderSteps status={o.status} />
            <ul className="order-items">
              {o.items.map((i, n) => <li key={n}><span>{i.title}{i.size ? <> · <b>размер {i.size}</b></> : ''} × {i.qty}</span><b>{rub(i.price_rub * i.qty)}</b></li>)}
            </ul>
            <div className="order-contact">
              <span><b>{DELIVERY[o.delivery] || 'Получение не указано'}</b>{o.address ? ': ' + o.address : ''}</span>
              {o.delivery === 'reserve' && ['new', 'confirmed'].includes(o.status) && <span className="reserve-hold">{holdText(o)} — потом бронь снимется сама</span>}
              {o.comment && <span className="muted">«{o.comment}»</span>}
              {o.phone ? (
                <span className="row-gap">
                  <a className="act ok press" href={'tel:' + o.phone}>Позвонить {o.phone}</a>
                  <a className="act press" href={'https://wa.me/' + waNumber(o.phone)} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                </span>
              ) : ['new', 'confirmed'].includes(o.status) ? null : <span className="muted small">Контакт покупателя удалён после закрытия заказа.</span>}
              <span className="muted small">Оплата при получении</span>
            </div>
            {o.discount_rub > 0 && <span className="promo-note">Промокод {o.promo_code}: −{rub(o.discount_rub)} · {o.discount_by === 'platform' ? 'скидку возмещает площадка' : 'скидка вашего бутика'}</span>}
            <div className="order-foot"><span>К оплате покупателем</span><b className="price">{rub(o.total_rub)}</b></div>
            <div className="acts" aria-busy={busy === o.id}>
              {o.status === 'new' && <button type="button" className="act ok press" disabled={busy === o.id} onClick={() => act(o.id, 'confirmed')}>{o.delivery === 'reserve' ? 'Отложил' : 'Подтвердить'}</button>}
              {o.status === 'confirmed' && <button type="button" className="act ok press" disabled={busy === o.id} onClick={() => act(o.id, 'done', o.delivery === 'reserve' ? 'Покупатель примерил и купил?' : 'Покупатель получил заказ и оплатил его?')}>{o.delivery === 'reserve' ? 'Купил' : 'Выполнен'}</button>}
              {['new', 'confirmed'].includes(o.status) && <button type="button" className="act danger press" disabled={busy === o.id} onClick={() => act(o.id, 'cancelled', o.delivery === 'reserve' ? 'Не подошло или не пришёл? Вещь вернётся в продажу.' : 'Отменить заказ? Остатки вернутся в продажу.')}>{o.delivery === 'reserve' ? 'Не купил' : 'Отменить'}</button>}
            </div>
          </article>
        ))}</div>
      ) : <EmptyState title={filter === 'active' ? 'Активных заказов нет' : 'Здесь пока пусто'} />}
    </main>
  );
}
