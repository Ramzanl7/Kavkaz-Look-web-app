import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import ProductCard from '../components/ProductCard.jsx';
import { useWishlist } from '../store/wishlist.jsx';
import { history } from '../lib/local.js';
import { loadPool, slotOf } from '../lib/stylist.js';
const MapPicker = lazy(() => import('../components/MapPicker.jsx'));
import { Icon } from '../components/Icons.jsx';
import { useCart, rub } from '../store/cart.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { useToast } from '../store/toast.jsx';
import { api } from '../api/index.js';
import { useAction } from '../lib/useAction.js';
import { useMyProfile } from '../store/profile.js';
import PhoneInput, { formatPhone, phoneComplete } from '../components/PhoneInput.jsx';

// Ключ попытки оформления: тот же состав корзины → тот же ключ, даже после перезагрузки страницы.
function attemptKey(items) {
  const sig = items.map((i) => i.key + ':' + i.qty).sort().join(',');
  try {
    const saved = JSON.parse(sessionStorage.getItem('kl_order_attempt') || 'null');
    if (saved?.sig === sig) return saved.key;
    const key = crypto.randomUUID();
    sessionStorage.setItem('kl_order_attempt', JSON.stringify({ sig, key }));
    return key;
  } catch { return crypto.randomUUID(); }
}
const forgetAttempt = () => { try { sessionStorage.removeItem('kl_order_attempt'); } catch { /* приватный режим */ } };
// Телефон и адрес можно запомнить только на этом устройстве (на сервере они хранятся лишь в заказе)
const CONTACT_KEY = 'kl-contact';
const PAY = { cash: 'Наличными при получении', transfer: 'Переводом при получении', prepay: 'Предоплата по СБП' };
const readContact = () => { try { return JSON.parse(localStorage.getItem(CONTACT_KEY)) || {}; } catch { return {}; } };

const CITIES = ['Грозный', 'Аргун', 'Гудермес', 'Урус-Мартан', 'Шали', 'Курчалой', 'Ачхой-Мартан', 'Наурская', 'Ведено'];
// Цена доставки бутика для адреса — так же считает сервер (delivery_fee_for). null — цену сообщит бутик.
export function feeFor(b, address, amount) {
  if (!b) return null;
  if (b.free_from && amount >= b.free_from) return 0;
  const a = String(address || '').toLowerCase();
  const other = CITIES.some((c) => c !== b.city && a.includes(c.toLowerCase()));
  if (!b.city || a.includes(String(b.city).toLowerCase()) || !other) return b.fee_city ?? null;
  return b.fee_region ?? b.fee_city ?? null;
}
const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 10 || h >= 20) ? b : c; };
const STEPS = ['Корзина', 'Получение', 'Подтверждение'];
const logoUrl = (path) => (path ? api.imageUrls(path).thumb : null);

export default function Cart() {
  const { items, setQty, remove, clear, total, put, changeSize, sync } = useCart();
  const { user } = useAuth();
  const { ids: wished, toggle } = useWishlist();
  const toast = useToast();
  const nav = useNavigate();
  const [busy, run] = useAction(1500);
  const [msg, setMsg] = useState('');
  const [promoIn, setPromoIn] = useState(''), [promo, setPromo] = useState(null), [promoMsg, setPromoMsg] = useState('');
  const [promoBusy, runPromo] = useAction(300);
  const applyPromo = () => runPromo(async () => { setPromoMsg(''); const r = await api.promoQuote(promoIn, items); if (r.error) { setPromo(null); setPromoMsg(r.error); } else setPromo(r); });
  const [step, setStep] = useState('cart');
  const [done, setDone] = useState(null);
  const [c, setC] = useState(() => ({ delivery: 'pickup', address: '', comment: '', remember: true, ...readContact(), phone: formatPhone(readContact().phone || '') }));
  const me = useMyProfile(user?.id ?? null);
  useEffect(() => {
    if (!me) return;
    setC((x) => ({ ...x, phone: x.phone || formatPhone(me.phone || ''), address: x.address || [me.city, me.address].filter(Boolean).join(', ') }));
  }, [me]);

  // Живая проверка: свежие цены, наличие и данные бутиков
  const [fresh, setFresh] = useState(null), [changes, setChanges] = useState({}), [opts, setOpts] = useState(null), [trust, setTrust] = useState(null);
  const idsKey = [...new Set(items.map((i) => i.id))].sort().join(',');
  useEffect(() => {
    if (!idsKey) { setFresh(new Map()); return; }
    const ids = idsKey.split(',');
    api.listProductsByIds(ids).then((list) => {
      const m = new Map(list.map((p) => [p.id, p]));
      setChanges((ch) => { const n = { ...ch }; items.forEach((i) => { const p = m.get(i.id); if (p && p.price !== i.price) n[i.id] = { was: i.price, now: p.price }; }); return n; });
      setFresh(m); sync(m);
    });
    api.checkoutOptions(ids).then(setOpts);
  }, [idsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (user && step === 'contact') api.myTrust().then(setTrust); }, [user, step]);

  const state = (i) => {
    const p = fresh?.get(i.id);
    if (!fresh) return {};
    if (!p || !p.published || p.blocked) return { gone: true, p };
    const left = p.stock ? p.stock[i.size || '_'] : undefined;
    if (left !== undefined && left !== null && left <= 0) return { gone: true, p };
    return { p, left: left !== undefined && left !== null && left <= 3 ? left : null, short: left != null && left < i.qty };
  };
  const live = items.filter((i) => !state(i).gone);
  const goneCount = items.length - live.length;
  const liveTotal = live.reduce((s, i) => s + i.price * i.qty, 0);
  const saved = live.reduce((s, i) => { const p = fresh?.get(i.id); return s + (p?.oldPrice ? (p.oldPrice - p.price) * i.qty : 0); }, 0);
  const promoDisc = promo?.discount || 0;
  const pay = Math.max(0, liveTotal - promoDisc);
  const count = live.reduce((s, i) => s + i.qty, 0);

  // Группы по бутикам
  const bmap = useMemo(() => new Map((opts || []).map((b) => [b.id, b])), [opts]);
  const groups = useMemo(() => {
    const g = new Map();
    items.forEach((i) => { const bid = fresh?.get(i.id)?.boutiqueId || i.boutique || '?'; if (!g.has(bid)) g.set(bid, []); g.get(bid).push(i); });
    return [...g.entries()].map(([bid, list]) => ({ bid, b: bmap.get(bid), name: bmap.get(bid)?.name || list[0].boutique || 'Бутик', list, sum: list.filter((i) => !state(i).gone).reduce((s, i) => s + i.price * i.qty, 0) }));
  }, [items, fresh, bmap]); // eslint-disable-line react-hooks/exhaustive-deps
  const shops = groups.length;

  const all = (k) => !opts?.length || opts.every((b) => b[k]);
  const canPickup = all('pickup'), canCourier = all('courier');
  const payList = ['cash', 'transfer', 'prepay'].filter(all);
  const delivery = c.delivery === 'courier' ? (canCourier ? 'courier' : 'pickup') : canPickup ? 'pickup' : 'courier';
  const payment = payList.includes(c.payment) ? c.payment : payList[0];
  const cod = delivery === 'courier' && payment !== 'prepay';
  const overLimit = cod && trust && (trust.active_n + shops > trust.lim_n || trust.active_sum + pay > trust.lim_sum);
  const phoneOk = phoneComplete(c.phone);
  const ready = phoneOk && (delivery === 'pickup' || c.address.trim().length >= 5) && !trust?.debt && (delivery === 'pickup' || payList.length > 0);
  // доставка: по каждому бутику; если хоть один не указал цену — «сообщит бутик»
  const fees = groups.map((g) => feeFor(g.b, c.address, g.sum));
  const feeKnown = fees.every((f) => f != null), feeSum = fees.reduce((s, f) => s + (f || 0), 0);
  const minFee = (opts || []).map((b) => b.fee_city).filter((x) => x != null);

  // Удаление с «Вернуть»
  const [undo, setUndo] = useState(null); const undoT = useRef(0);
  const drop = (i) => { remove(i.key); setUndo(i); clearTimeout(undoT.current); undoT.current = setTimeout(() => setUndo(null), 5000); };
  const toWish = async (i) => { if (!user) { toast('Войдите, чтобы сохранять товары'); return; } if (!wished.has(i.id)) await toggle(i.id); remove(i.key); toast('Перенесли в избранное'); };
  const [sizeFor, setSizeFor] = useState(null);
  const [mapOpen, setMapOpen] = useState(false);
  const point = c.lat != null && c.lng != null ? { lat: c.lat, lng: c.lng } : null;

  const checkout = (e) => { e.preventDefault(); return run(async () => {
    setMsg('');
    const r = await api.placeOrder(live, { ...c, delivery, payment, promo: promo?.code }, attemptKey(live));
    if (r.error) { setMsg(r.error); if (r.promo) setPromo(null); return; }
    if (delivery === 'courier' && point) await api.setOrderPoint(r.ids, point.lat, point.lng);
    try { if (c.remember) localStorage.setItem(CONTACT_KEY, JSON.stringify({ phone: c.phone, address: c.address, delivery: c.delivery, lat: c.lat ?? null, lng: c.lng ?? null })); else localStorage.removeItem(CONTACT_KEY); } catch { /* приватный режим */ }
    setDone({ ids: r.ids, delivery, payment, pay, fee: delivery === 'courier' ? (feeKnown ? feeSum : null) : 0, shops: groups.map((g) => ({ name: g.name, address: g.b?.address, city: g.b?.city })) });
    forgetAttempt(); clear(); setStep('done'); window.scrollTo(0, 0);
  }); };

  if (step === 'done' && done) return <Done d={done} />;
  if (!items.length) return <EmptyCart />;

  const stepIdx = step === 'cart' ? 0 : 1;
  return (
    <main className="wrap cart-page">
      <div className="cart-head rise">
        <h1 className="screen-title">{step === 'cart' ? 'Корзина' : 'Оформление'}</h1>
        {step === 'cart' && <span className="muted">{count} {plural(count, 'товар', 'товара', 'товаров')}</span>}
      </div>
      <ol className="steps" aria-label="Шаги оформления">{STEPS.map((s, k) => <li key={s} className={k < stepIdx ? 'done' : k === stepIdx ? 'on' : ''}><i>{k < stepIdx ? '✓' : k + 1}</i>{s}</li>)}</ol>

      {step === 'cart' ? <>
        {groups.map((g) => (
          <section key={g.bid} className="cart-shop rise">
            <header className="cart-shop-head">
              <span className="shop-ava sm">{logoUrl(g.b?.logo) ? <img src={logoUrl(g.b.logo)} alt="" /> : g.name.slice(0, 1).toUpperCase()}</span>
              <span className="grow"><strong>{g.name}</strong><small>{[g.b?.city, g.b && [g.b.pickup && 'Самовывоз', g.b.courier && 'Доставка'].filter(Boolean).join(' · ')].filter(Boolean).join(' · ')}</small></span>
            </header>
            {g.list.map((i) => <CartItem key={i.key} i={i} st={state(i)} change={changes[i.id]} onQty={setQty} onDrop={drop} onWish={toWish} onSize={() => setSizeFor(i)} />)}
            <div className="cart-shop-sum"><span>Сумма по бутику</span><b>{rub(g.sum)}</b></div>
          </section>
        ))}
        {goneCount > 0 && <p className="notice">Некоторых товаров уже нет в наличии — уберите их, чтобы оформить заказ.</p>}

        <PromoBox promo={promo} promoIn={promoIn} setPromoIn={setPromoIn} busy={promoBusy} apply={applyPromo} drop={() => { setPromo(null); setPromoIn(''); }} msg={promoMsg} />

        <section className="cart-sum rise" aria-label="Итог">
          <div><span>Товары ({count})</span><span>{rub(liveTotal + saved)}</span></div>
          {saved > 0 && <div className="good"><span>Скидка</span><span>−{rub(saved)}</span></div>}
          {promoDisc > 0 && <div className="good"><span>Промокод {promo.code}</span><span>−{rub(promoDisc)}</span></div>}
          <div className="muted"><span>Доставка</span><span>{!canCourier ? 'самовывоз — бесплатно' : minFee.length === (opts || []).length && minFee.length ? 'от ' + rub(Math.min(...minFee)) + ', курьеру' : 'стоимость сообщит бутик'}</span></div>
          <div className="total"><span>Итого</span><b>{rub(pay)}</b></div>
          {saved + promoDisc > 0 && <p className="cart-save">Вы экономите {rub(saved + promoDisc)} 🎉</p>}
          {shops > 1 && <p className="hint" style={{ margin: 0 }}>Товары из {shops} бутиков — оформим отдельный заказ в каждый.</p>}
        </section>

        <ul className="trust-list rise">
          <li><Icon name="shield" />Оплата при получении или в бутике</li>
          <li><Icon name="store" />Заказ напрямую у бутика — без посредников</li>
          <li><Icon name="chat" />Поддержка в чате, если что-то пошло не так</li>
        </ul>

        <Upsell items={items} />

        <div className="cart-bar">
          <span><small>Итого</small><b>{rub(pay)}</b></span>
          {user ? <button type="button" className="btn btn-primary press" disabled={!live.length || goneCount > 0} onClick={() => { setStep('contact'); window.scrollTo(0, 0); }}>Оформить заказ</button>
            : <Link className="btn btn-primary press" to="/login" state={{ from: '/cart' }}>Войти и оформить</Link>}
        </div>
      </> : (
        <form className="form" onSubmit={checkout}>
          <div className="seg" role="radiogroup" aria-label="Получение">
            {[['pickup', 'Самовывоз из бутика', canPickup], ['courier', 'Доставка курьером', canCourier]].map(([v, l, ok]) => (
              <button key={v} type="button" role="radio" aria-checked={delivery === v} disabled={!ok} className={'chip' + (delivery === v ? ' on' : '')} onClick={() => setC({ ...c, delivery: v })}>{l}</button>
            ))}
          </div>
          {(!canPickup || !canCourier) && <p className="hint">{!canCourier ? 'Доставку курьером делают не все бутики из корзины.' : 'Самовывоз есть не у всех бутиков из корзины.'}</p>}
          {delivery === 'pickup' && groups.map((g) => g.b?.address && <div key={g.bid} className="bcard pay-card"><strong>Забрать в «{g.name}»</strong><span className="muted small">{[g.b.city, g.b.address].filter(Boolean).join(', ')}</span></div>)}
          {trust?.debt && <div className="bcard debt-card" role="alert"><strong>Есть неоплаченный заказ</strong><span className="small">Новые заказы недоступны, пока вопрос не решится. Если вы оплатили — нажмите «Я оплатил» в заказе.</span><Link className="link-u small" to="/orders">Мои заказы</Link></div>}
          <div className="field"><label htmlFor="ph">Телефон для связи</label>
            <PhoneInput id="ph" maxLength={20} value={c.phone} onChange={(phone) => setC((x) => ({ ...x, phone }))} /></div>
          {delivery === 'courier' && (
            <div className="field"><label htmlFor="ad">Адрес доставки</label>
              <input id="ad" autoComplete="street-address" placeholder="Город, улица, дом, квартира" maxLength={200} value={c.address} onChange={(e) => setC({ ...c, address: e.target.value })} />
              <button type="button" className={'addr-map press' + (point ? ' on' : '')} onClick={() => setMapOpen(true)}>
                <Icon name="pin" /><span className="grow">{point ? <><b>Точка на карте выбрана</b><small>Курьер приедет точно сюда · изменить</small></> : <><b>Указать на карте</b><small>Курьеру будет проще найти вас</small></>}</span><Icon name="chevron" />
              </button></div>
          )}
          <div className="field"><label htmlFor="cm">Комментарий для продавца (необязательно)</label>
            <input id="cm" maxLength={300} placeholder="Например: позвонить за час" value={c.comment} onChange={(e) => setC({ ...c, comment: e.target.value })} /></div>
          {delivery === 'courier' ? (
            <fieldset className="pay-pick">
              <legend>Оплата</legend>
              {payList.length ? payList.map((k) => (
                <label key={k} className={'pay-opt' + (payment === k ? ' on' : '')}>
                  <input type="radio" name="pay" checked={payment === k} onChange={() => setC({ ...c, payment: k })} />
                  <span><b>{PAY[k]}</b><small>{k === 'prepay' ? 'Переведите по номеру телефона продавца — реквизиты появятся в заказе' : k === 'cash' ? 'Курьеру, сразу при получении' : 'На карту или по СБП продавцу, сразу при получении'}</small></span>
                </label>
              )) : <p className="msg">У бутиков из корзины нет общего способа оплаты при доставке. Оформите самовывоз или разделите корзину.</p>}
            </fieldset>
          ) : <div className="bcard pay-card"><strong>Оплата в бутике</strong><span className="muted small">Наличными или переводом, когда заберёте заказ.</span></div>}
          <label className="check"><input type="checkbox" checked={c.remember} onChange={(e) => setC({ ...c, remember: e.target.checked })} /> Запомнить телефон и адрес на этом устройстве</label>
          <p className="hint">Телефон и адрес увидит только продавец вашего заказа. После закрытия заказа они удаляются (при доставке с оплатой при получении — через 3 дня).</p>

          <section className="cart-sum" aria-label="Итог">
            <div><span>Товары ({count})</span><span>{rub(liveTotal)}</span></div>
            {promoDisc > 0 && <div className="good"><span>Промокод {promo.code}</span><span>−{rub(promoDisc)}</span></div>}
            <div className="total"><span>К оплате за товары</span><b>{rub(pay)}</b></div>
            {delivery === 'courier'
              ? <div className="fee"><span>Доставка — курьеру при получении</span><span>{feeKnown ? (feeSum ? rub(feeSum) : 'бесплатно') : 'сообщит бутик'}</span></div>
              : <div className="muted"><span>Самовывоз</span><span>бесплатно</span></div>}
          </section>
          {cod && (
            <div className="cod-note" role="note">
              <strong>Оплата при получении</strong>
              <span>Оплатите заказ курьеру сразу при получении — наличными или переводом. Если продавец сообщит о неоплате, оформлять новые заказы будет нельзя, пока вопрос не решится, а администрация свяжется с вами.</span>
              {overLimit && <span className="cod-limit">Ваш лимит с оплатой при получении: {trust.lim_n} {trust.lim_n === 1 ? 'заказ' : 'заказа'} до {rub(trust.lim_sum)} одновременно — он растёт с каждым оплаченным заказом. Выберите предоплату или самовывоз.</span>}
            </div>
          )}
          {msg && <p className="msg" role="status">{msg}</p>}
          <button type="submit" className="btn btn-primary press" disabled={!!busy || !!promoBusy || !ready || overLimit}>{busy ? 'Оформляем…' : 'Оформить заказ · ' + rub(pay)}</button>
          <button type="button" className="btn btn-secondary press" onClick={() => setStep('cart')}>Назад к корзине</button>
        </form>
      )}

      {undo && <div className="undo-bar" role="status"><span>Товар убран</span><button type="button" onClick={() => { put(undo); setUndo(null); }}>Вернуть</button></div>}
      {mapOpen && <Suspense fallback={null}><MapPicker start={point} onClose={() => setMapOpen(false)} onPick={(pt) => {
        const replace = !!pt.address && (!c.address.trim() || c.address === c.mapAddr);
        setC((x) => ({ ...x, lat: pt.lat, lng: pt.lng, address: replace ? pt.address : x.address, mapAddr: pt.address }));
        setMapOpen(false); toast(replace ? 'Адрес подставлен — допишите квартиру и подъезд' : 'Точка выбрана — проверьте адрес в поле');
      }} /></Suspense>}
      {sizeFor && <SizeSheet i={sizeFor} p={fresh?.get(sizeFor.id)} onPick={(s) => { changeSize(sizeFor.key, s); setSizeFor(null); }} onClose={() => setSizeFor(null)} />}
    </main>
  );
}

function CartItem({ i, st, change, onQty, onDrop, onWish, onSize }) {
  const p = st.p;
  return (
    <div className={'cart-row' + (st.gone ? ' gone' : '')}>
      <Link to={'/product/' + i.id} className="cart-thumb">{i.thumb ? <img src={i.thumb} alt="" loading="lazy" /> : null}</Link>
      <div className="grow cart-info">
        <strong>{i.title}</strong>
        {st.gone ? <span className="cart-flag bad">Нет в наличии</span>
          : change && change.now < change.was ? <span className="cart-flag good">Цена снизилась: было {rub(change.was)}</span>
            : change ? <span className="cart-flag warn">Цена изменилась: было {rub(change.was)}</span>
              : st.left ? <span className="cart-flag gold">Осталось {st.left} шт.</span> : null}
        <span className="cart-meta">
          {i.size ? <button type="button" className="size-pill" onClick={onSize} disabled={st.gone}>Размер {i.size} ▾</button> : p?.sizes?.length ? <button type="button" className="size-pill" onClick={onSize}>Выбрать размер ▾</button> : null}
        </span>
        <span className="cart-price">
          <b className="price">{rub(i.price * i.qty)}</b>
          {p?.oldPrice && !st.gone && <s className="muted small">{rub(p.oldPrice * i.qty)}</s>}
        </span>
      </div>
      <div className="cart-side">
        <div className="cart-acts">
          <button type="button" className="cart-ic" aria-label={'В избранное: ' + i.title} onClick={() => onWish(i)}><Icon name="heart" /></button>
          <button type="button" className="cart-ic" aria-label={'Убрать ' + i.title} onClick={() => onDrop(i)}><Icon name="close" /></button>
        </div>
        {!st.gone && (
          <div className="qty">
            <button type="button" aria-label="Меньше" onClick={() => (i.qty > 1 ? onQty(i.key, i.qty - 1) : onDrop(i))}>−</button>
            <span>{i.qty}</span>
            <button type="button" aria-label="Больше" disabled={st.left != null && i.qty >= st.left} onClick={() => onQty(i.key, i.qty + 1)}>+</button>
          </div>
        )}
      </div>
    </div>
  );
}

function SizeSheet({ i, p, onPick, onClose }) {
  const sizes = p?.sizes || [];
  return createPortal(
    <div className="sheet-bg" role="presentation" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sz-t" onClick={(e) => e.stopPropagation()}>
        <h2 id="sz-t">Размер — {i.title}</h2>
        {sizes.length ? <div className="size-grid">{sizes.map((s) => {
          const left = p.stock ? p.stock[s] : undefined; const out = left !== undefined && left !== null && left <= 0;
          return <button key={s} type="button" className={'chip press' + (s === i.size ? ' on' : '')} disabled={out} onClick={() => onPick(s)}>{s}{out ? ' · нет' : ''}</button>;
        })}</div> : <p className="muted">Загрузка…</p>}
        <button type="button" className="btn btn-secondary press" onClick={onClose}>Готово</button>
      </div>
    </div>, document.body);
}

function PromoBox({ promo, promoIn, setPromoIn, busy, apply, drop, msg }) {
  return (
    <div className="promo-box rise">
      {promo ? (
        <div className="promo-on"><span><b>{promo.code}</b> — скидка {rub(promo.discount)}{promo.title ? ` · ${promo.title}` : ''}</span>
          <button type="button" className="link-muted" onClick={drop}>Убрать</button></div>
      ) : (
        <div className="promo-row-in">
          <input aria-label="Промокод" placeholder="Промокод" maxLength={20} value={promoIn} onChange={(e) => setPromoIn(e.target.value.toUpperCase())} autoCapitalize="characters" />
          <button type="button" className="btn btn-secondary press" disabled={promoIn.trim().length < 4 || !!busy} onClick={apply}>{busy ? '…' : 'Применить'}</button>
        </div>
      )}
      {msg && <small className="msg">{msg}</small>}
    </div>
  );
}

// «Дополните образ»: вещи тех видов, которых в корзине ещё нет (обувь, аксессуар…), сначала из тех же бутиков
function Upsell({ items }) {
  const [list, setList] = useState(null);
  const key = items.map((i) => i.id).sort().join(',');
  useEffect(() => {
    let on = true;
    loadPool().then((pool) => {
      const inCart = new Set(items.map((i) => i.id));
      const have = new Set(pool.filter((p) => inCart.has(p.id)).map(slotOf));
      const shops = new Set(items.map((i) => i.boutique));
      const pick = pool.filter((p) => !inCart.has(p.id) && !have.has(slotOf(p)))
        .sort((a, b) => (shops.has(b.boutique) - shops.has(a.boutique)) || (b.rating - a.rating)).slice(0, 10);
      if (on) setList(pick);
    });
    return () => { on = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!list?.length) return null;
  return (
    <section className="home-sec rise" aria-labelledby="up-h">
      <div className="sec-head2"><h2 id="up-h"><Icon name="sparkles" />Дополните образ</h2></div>
      <div className="hscroll popular">{list.map((p, i) => <ProductCard key={p.id} p={p} i={i} variant="compact" />)}</div>
    </section>
  );
}

function EmptyCart() {
  const [recent, setRecent] = useState([]), [popular, setPopular] = useState([]);
  useEffect(() => {
    const ids = history.list().slice(0, 10);
    if (ids.length) api.listProductsByIds(ids).then(setRecent);
    api.listPopular().then((l) => setPopular(l || []));
  }, []);
  const strip = (title, icon, list) => list.length > 0 && (
    <section className="home-sec" aria-label={title}>
      <div className="sec-head2"><h2><Icon name={icon} />{title}</h2></div>
      <div className="hscroll popular">{list.map((p, i) => <ProductCard key={p.id} p={p} i={i} variant="compact" />)}</div>
    </section>
  );
  return (
    <main className="wrap cart-page">
      <h1 className="screen-title rise">Корзина</h1>
      <div className="cart-empty rise">
        <span className="cart-empty-ic"><Icon name="bag" /></span>
        <strong>Корзина пока пуста</strong>
        <span className="muted">Самое время найти что-то особенное.</span>
        <div className="cart-empty-acts">
          <Link className="btn btn-primary press" to="/home">На главную</Link>
          <Link className="btn btn-secondary press" to="/stylist">Спросить стилиста ✨</Link>
        </div>
      </div>
      {strip('Вы недавно смотрели', 'clock', recent)}
      {strip('Популярное сейчас', 'flame', popular)}
    </main>
  );
}

function Done({ d }) {
  const courier = d.delivery === 'courier';
  const payText = !courier ? 'Оплата — в бутике, когда заберёте заказ' : d.payment === 'prepay' ? 'Оплата — переводом по СБП, реквизиты в заказе' : 'Оплата — курьеру при получении' + (d.fee ? ` (товары + доставка ${rub(d.fee)})` : '');
  return (
    <main className="wrap cart-page">
      <ol className="steps" aria-label="Шаги оформления">{STEPS.map((s, k) => <li key={s} className={k < 2 ? 'done' : 'on'}><i>{k < 2 ? '✓' : 3}</i>{s}</li>)}</ol>
      <section className="done-card rise">
        <span className="done-check" aria-hidden="true">✓</span>
        <h1>Заказ оформлен!</h1>
        <p className="muted">{d.ids.length > 1 ? `Оформлено заказов: ${d.ids.length} — по одному на бутик` : `Заказ № ${String(d.ids[0] || '').slice(0, 6).toUpperCase()}`}{d.shops.length === 1 ? ' · ' + d.shops[0].name : ''}</p>
        <div className="done-total"><span>Сумма</span><b>{rub(d.pay)}</b></div>
      </section>
      <section className="done-steps rise" style={{ '--d': 1 }}>
        <h2>Что дальше</h2>
        <ol>
          <li><b>Бутик подтвердит заказ</b><span>Пришлём уведомление, как только продавец примет заказ.</span></li>
          {courier ? <li><b>Курьер свяжется с вами</b><span>Перед доставкой курьер позвонит по указанному номеру.</span></li>
            : <li><b>Заберите заказ в бутике</b><span>{d.shops.map((s) => [s.name, s.city, s.address].filter(Boolean).join(', ')).join('; ')}</span></li>}
          <li><b>{payText}</b><span>Проверьте вещи перед оплатой.</span></li>
        </ol>
      </section>
      <Link className="btn btn-primary press" to="/orders">Мои заказы</Link>
      <Link className="btn btn-secondary press" to="/home">Продолжить покупки</Link>
    </main>
  );
}
