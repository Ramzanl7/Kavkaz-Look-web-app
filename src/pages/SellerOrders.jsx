import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import EmptyState from '../components/EmptyState.jsx';
import { rub } from '../store/cart.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { useToast } from '../store/toast.jsx';
import { api } from '../api/index.js';
import { STATUS, DELIVERY, PAYMENT, OrderSteps, holdText, isDebt } from './Orders.jsx';
import { useAction } from '../lib/useAction.js';

const FILTERS = [['active', 'Активные'], ['done', 'Выполненные'], ['cancelled', 'Отменённые'], ['all', 'Все']];
const DAY = 864e5;
const waNumber = (ph) => { const d = String(ph || '').replace(/\D/g, ''); return d.length === 11 && d[0] === '8' ? '7' + d.slice(1) : d; };
const dt = (d) => new Date(d).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const isCod = (o) => o.delivery === 'courier' && o.payment !== 'prepay';
// Сообщить о неоплате можно по доставке с оплатой при получении: пока заказ открыт и 3 дня после закрытия
const canUnpaid = (o) => isCod(o) && !o.unpaid_at && (o.status === 'confirmed' || (o.status === 'done' && (!o.closed_at || Date.now() - new Date(o.closed_at) < 3 * DAY)));

// Заказы бутика. Обычный заказ — одно нажатие «Принять» (или ноль с автоприёмом): закрывает покупатель или система через 3 дня.
// Кнопки ниже — только для проблем: не оплатил, не забрал, отменить.
export default function SellerOrders() {
  const { user } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const { oid, action } = useParams();
  const [orders, setOrders] = useState(null), [flags, setFlags] = useState({}), [auto, setAuto] = useState(null);
  const [filter, setFilter] = useState('active');
  const [msg, setMsg] = useState('');
  const accepted = useRef(false);
  const load = useCallback(async () => {
    const b = user ? await api.getMyBoutique(user.id) : null;
    const list = b ? await api.listSellerOrders(b.id) : [];
    setOrders(list);
    if (b) api.myBoutiquePay(b.id).then((p) => setAuto(p ? !!p.auto_accept : null));
    api.buyerFlags(list.filter((o) => ['new', 'confirmed'].includes(o.status) || isDebt(o)).map((o) => o.id)).then(setFlags);
  }, [user]);
  useEffect(() => { load(); }, [load]);
  const [busy, run] = useAction();
  const act = (id, status, ask) => run(async () => {
    if (ask && !window.confirm(ask)) return;
    setMsg('');
    if (await api.setOrderStatus(id, status)) await load(); else setMsg('Статус не изменён. Попробуйте ещё раз.');
  }, id);
  const unpaid = (o) => run(async () => {
    if (!window.confirm(`Покупатель не оплатил заказ на ${rub(o.total_rub)}?\n\nЕму закроют новые заказы, пока вопрос не решится, а администрация получит его данные и свяжется с ним.`)) return;
    const err = await api.orderUnpaid(o.id);
    if (err) setMsg(err); else { toast('Сообщили администрации'); await load(); }
  }, o.id);
  const paid = (o) => run(async () => { if (await api.orderPaid(o.id)) { toast('Ограничение для покупателя снято'); await load(); } }, o.id);

  // Кнопка «Принять» в пуше (Android) открывает /seller/orders/accept/<id>
  useEffect(() => {
    if (action !== 'accept' || !oid || !orders || accepted.current) return;
    accepted.current = true;
    const o = orders.find((x) => x.id === oid);
    (async () => {
      if (o?.status === 'new' && (await api.setOrderStatus(oid, 'confirmed'))) { toast('Заказ принят'); await load(); }
      nav('/seller/orders/' + oid, { replace: true });
    })();
  }, [action, oid, orders]); // eslint-disable-line react-hooks/exhaustive-deps
  // Открыли из уведомления — показываем этот заказ
  useEffect(() => {
    if (!oid || !orders) return;
    const o = orders.find((x) => x.id === oid);
    if (o && !['new', 'confirmed'].includes(o.status) && !isDebt(o)) setFilter('all');
    setTimeout(() => document.getElementById('o-' + oid)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 150);
  }, [oid, orders]);

  const shown = (orders || []).filter((o) => filter === 'all' || (filter === 'active' ? ['new', 'confirmed'].includes(o.status) || isDebt(o) : o.status === filter));
  const count = (orders || []).filter((o) => o.status === 'new').length;
  return (
    <main className="wrap">
      <h1 className="screen-title rise">Заказы бутика</h1>
      {auto === false && <Link className="stylist-card press" to="/seller/profile"><span className="grow"><strong className="block">Включите автоприём заказов</strong><small className="muted">Заказы будут приниматься сами — вам останется только отправить товар</small></span></Link>}
      <div className="chips">
        {FILTERS.map(([v, l]) => <button key={v} type="button" className={'chip' + (filter === v ? ' on' : '')} onClick={() => setFilter(v)}>{l}{v === 'active' && count ? ` · ${count} новых` : ''}</button>)}
      </div>
      {msg && <p className="msg" role="status">{msg}</p>}
      {orders === null ? <p className="lead">Загрузка…</p> : shown.length ? (
        <div className="list">{shown.map((o) => {
          const f = flags[o.id];
          return (
            <article key={o.id} id={'o-' + o.id} className={'bcard order-card' + (o.id === oid ? ' order-focus' : '')}>
              <div className="order-head">
                <strong>№ {o.id.slice(0, 8)} · {STATUS[o.status]}</strong>
                <span className="muted small">{dt(o.created_at)}</span>
              </div>
              <OrderSteps status={o.status} />
              <ul className="order-items">
                {o.items.map((i, n) => <li key={n}><span>{i.title}{i.size ? <> · <b>размер {i.size}</b></> : ''} × {i.qty}</span><b>{rub(i.price_rub * i.qty)}</b></li>)}
              </ul>
              {f && ['new', 'confirmed'].includes(o.status) && (f.debt
                ? <span className="buyer-flag bad">У покупателя есть неоплаченный заказ</span>
                : <span className="buyer-flag">{f.paid ? `Покупатель выкупил заказов: ${f.paid}` : 'Первый заказ покупателя'}</span>)}
              <div className="order-contact">
                <span><b>{DELIVERY[o.delivery] || 'Получение не указано'}</b>{o.address ? ': ' + o.address : ''}</span>
                {o.delivery_lat != null && <a className="link-u small" href={`https://yandex.ru/maps/?pt=${o.delivery_lng},${o.delivery_lat}&z=17&l=map`} target="_blank" rel="noopener noreferrer">📍 Точка доставки на карте</a>}
                {o.delivery === 'reserve' && ['new', 'confirmed'].includes(o.status) && <span className="reserve-hold">{holdText(o)} — потом бронь снимется сама</span>}
                {o.comment && <span className="muted">«{o.comment}»</span>}
                {o.phone ? (
                  <span className="row-gap">
                    <a className="act ok press" href={'tel:' + o.phone}>Позвонить {o.phone}</a>
                    <a className="act press" href={'https://wa.me/' + waNumber(o.phone)} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                  </span>
                ) : ['new', 'confirmed'].includes(o.status) ? null : <span className="muted small">Контакт покупателя удалён после закрытия заказа.</span>}
                <span className="muted small">{o.delivery === 'courier' ? 'Оплата: ' + (PAYMENT[o.payment] || PAYMENT.on_delivery) : 'Оплата в бутике'}</span>
                {o.payment === 'prepay' && ['new', 'confirmed'].includes(o.status) && (o.paid_claim_at
                  ? <span className="buyer-flag">Покупатель сообщил о переводе {dt(o.paid_claim_at)} — проверьте поступление</span>
                  : <span className="muted small">Ждём перевод по СБП — отправляйте после поступления денег</span>)}
                {o.status === 'confirmed' && o.delivery !== 'reserve' && <span className="muted small">Закроется автоматически {dt(new Date(o.accepted_at || o.created_at).getTime() + 3 * DAY)}, если покупатель не подтвердит получение раньше</span>}
              </div>
              {isDebt(o) && <div className="debt-card bcard"><strong>Вы сообщили о неоплате</strong><span className="small">{o.paid_claim_at ? 'Покупатель сообщает, что оплатил. Проверьте поступление.' : 'Администрация свяжется с покупателем.'}</span></div>}
              {o.discount_rub > 0 && <span className="promo-note">Промокод {o.promo_code}: −{rub(o.discount_rub)} · {o.discount_by === 'platform' ? 'скидку возмещает площадка' : 'скидка вашего бутика'}</span>}
              {o.delivery === 'courier' && o.delivery_fee_rub != null && <span className="promo-note">Доставка (платит покупатель курьеру): {o.delivery_fee_rub ? rub(o.delivery_fee_rub) : 'бесплатно'}</span>}
              <div className="order-foot"><span>К оплате покупателем</span><b className="price">{rub(o.total_rub)}</b></div>
              <div className="acts" aria-busy={busy === o.id}>
                {o.status === 'new' && <button type="button" className="act ok press" disabled={busy === o.id} onClick={() => act(o.id, 'confirmed')}>Принять</button>}
                {o.status === 'confirmed' && o.delivery === 'reserve' && <button type="button" className="act ok press" disabled={busy === o.id} onClick={() => act(o.id, 'done')}>Купил</button>}
                {isDebt(o) && <button type="button" className="act ok press" disabled={busy === o.id} onClick={() => paid(o)}>Оплата получена</button>}
                {canUnpaid(o) && <button type="button" className="act danger press" disabled={busy === o.id} onClick={() => unpaid(o)}>Не оплатил</button>}
                {o.status === 'confirmed' && o.delivery === 'pickup' && <button type="button" className="act danger press" disabled={busy === o.id} onClick={() => act(o.id, 'cancelled', 'Покупатель не забрал заказ? Товар вернётся в продажу.')}>Не забрал</button>}
                {['new', 'confirmed'].includes(o.status) && !(o.status === 'confirmed' && o.delivery === 'pickup') && <button type="button" className="act danger press" disabled={busy === o.id} onClick={() => act(o.id, 'cancelled', o.delivery === 'reserve' ? 'Не подошло или не пришёл? Вещь вернётся в продажу.' : 'Отменить заказ? Остатки вернутся в продажу.')}>{o.delivery === 'reserve' && o.status === 'confirmed' ? 'Не купил' : 'Отменить'}</button>}
              </div>
            </article>
          );
        })}</div>
      ) : <EmptyState title={filter === 'active' ? 'Активных заказов нет' : 'Здесь пока пусто'} />}
    </main>
  );
}
