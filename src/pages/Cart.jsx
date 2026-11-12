import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import EmptyState from '../components/EmptyState.jsx';
import { Icon } from '../components/Icons.jsx';
import { useCart, rub } from '../store/cart.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { useToast } from '../store/toast.jsx';
import { api } from '../api/index.js';
import { useAction } from '../lib/useAction.js';

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
const readContact = () => { try { return JSON.parse(localStorage.getItem(CONTACT_KEY)) || {}; } catch { return {}; } };

export default function Cart() {
  const { items, setQty, remove, clear, total } = useCart();
  const { user } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [busy, run] = useAction(1500);
  const [msg, setMsg] = useState('');
  const [promoIn, setPromoIn] = useState(''), [promo, setPromo] = useState(null), [promoMsg, setPromoMsg] = useState('');
  const [promoBusy, runPromo] = useAction(300);
  const applyPromo = () => runPromo(async () => { setPromoMsg(''); const r = await api.promoQuote(promoIn, items); if (r.error) { setPromo(null); setPromoMsg(r.error); } else setPromo(r); });
  const pay = Math.max(0, total - (promo?.discount || 0));
  const [step, setStep] = useState('cart');
  const [c, setC] = useState(() => ({ phone: '', delivery: 'pickup', address: '', comment: '', remember: true, ...readContact() }));
  const shops = new Set(items.map((i) => i.boutique || '?')).size;
  const phoneOk = /^\+?[0-9]{10,15}$/.test(c.phone.replace(/[^0-9+]/g, ''));
  const ready = phoneOk && (c.delivery === 'pickup' || c.address.trim().length >= 5);
  const checkout = (e) => { e.preventDefault(); return run(async () => {
    setMsg('');
    const r = await api.placeOrder(items, { ...c, promo: promo?.code }, attemptKey(items));
    if (r.error) { setMsg(r.error); if (r.promo) setPromo(null); return; }
    try { if (c.remember) localStorage.setItem(CONTACT_KEY, JSON.stringify({ phone: c.phone, address: c.address, delivery: c.delivery })); else localStorage.removeItem(CONTACT_KEY); } catch { /* приватный режим */ }
    forgetAttempt(); clear(); toast(r.ids.length > 1 ? `Оформлено заказов: ${r.ids.length} — по одному на бутик` : 'Заказ оформлен'); nav('/orders');
  }); };

  if (!items.length) return (
    <main className="wrap">
      <h1 className="screen-title rise">Корзина</h1>
      <EmptyState title="Корзина пуста" action={<Link className="btn btn-secondary press" to="/catalog">В каталог</Link>} />
    </main>
  );
  return (
    <main className="wrap">
      <h1 className="screen-title rise">{step === 'cart' ? 'Корзина' : 'Оформление'}</h1>
      {step === 'cart' ? <>
        {items.map((i) => (
          <div key={i.key} className="cart-row">
            <Link to={'/product/' + i.id} className="cart-thumb">{i.thumb ? <img src={i.thumb} alt="" loading="lazy" /> : null}</Link>
            <div className="grow cart-info">
              <strong>{i.title}</strong>
              <span className="muted small">{[i.size && 'Размер ' + i.size, i.boutique].filter(Boolean).join(' · ')}</span>
              <b className="price">{rub(i.price * i.qty)}</b>
            </div>
            <div className="cart-side">
              <button type="button" className="cart-del" aria-label={'Убрать ' + i.title} onClick={() => remove(i.key)}><Icon name="close" /></button>
              <div className="qty">
                <button type="button" aria-label="Меньше" onClick={() => setQty(i.key, i.qty - 1)}>−</button>
                <span>{i.qty}</span>
                <button type="button" aria-label="Больше" onClick={() => setQty(i.key, i.qty + 1)}>+</button>
              </div>
            </div>
          </div>
        ))}
        <div className="cart-total"><span>Итого</span><b className="price">{rub(total)}</b></div>
        {shops > 1 && <p className="hint">Товары из {shops} бутиков — оформим отдельный заказ в каждый бутик.</p>}
        {user ? <button type="button" className="btn btn-primary press" onClick={() => setStep('contact')}>Перейти к оформлению</button>
          : <Link className="btn btn-primary press" to="/login">Войти, чтобы оформить</Link>}
      </> : (
        <form className="form" onSubmit={checkout}>
          <div className="seg" role="radiogroup" aria-label="Получение">
            {[['pickup', 'Самовывоз из бутика'], ['courier', 'Доставка курьером']].map(([v, l]) => (
              <button key={v} type="button" role="radio" aria-checked={c.delivery === v} className={'chip' + (c.delivery === v ? ' on' : '')} onClick={() => setC({ ...c, delivery: v })}>{l}</button>
            ))}
          </div>
          <div className="field"><label htmlFor="ph">Телефон для связи</label>
            <input id="ph" type="tel" inputMode="tel" autoComplete="tel" placeholder="+7 900 000-00-00" maxLength={20} value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} /></div>
          {c.delivery === 'courier' && (
            <div className="field"><label htmlFor="ad">Адрес доставки</label>
              <input id="ad" autoComplete="street-address" placeholder="Город, улица, дом, квартира" maxLength={200} value={c.address} onChange={(e) => setC({ ...c, address: e.target.value })} /></div>
          )}
          <div className="field"><label htmlFor="cm">Комментарий для продавца (необязательно)</label>
            <input id="cm" maxLength={300} placeholder="Например: позвонить за час" value={c.comment} onChange={(e) => setC({ ...c, comment: e.target.value })} /></div>
          <div className="bcard pay-card"><strong>Оплата при получении</strong><span className="muted small">Наличными или переводом продавцу. Онлайн-оплата появится позже.</span></div>
          <label className="check"><input type="checkbox" checked={c.remember} onChange={(e) => setC({ ...c, remember: e.target.checked })} /> Запомнить телефон и адрес на этом устройстве</label>
          <p className="hint">Телефон и адрес увидит только продавец вашего заказа. После выполнения или отмены заказа они удаляются.</p>
          <div className="promo-box">
            {promo ? (
              <div className="promo-on"><span><b>{promo.code}</b> — скидка {rub(promo.discount)}{promo.title ? ` · ${promo.title}` : ''}</span>
                <button type="button" className="link-muted" onClick={() => { setPromo(null); setPromoIn(''); }}>Убрать</button></div>
            ) : (
              <div className="promo-row-in">
                <input aria-label="Промокод" placeholder="Промокод" maxLength={20} value={promoIn} onChange={(e) => setPromoIn(e.target.value.toUpperCase())} autoCapitalize="characters" />
                <button type="button" className="btn btn-secondary press" disabled={promoIn.trim().length < 4 || !!promoBusy} onClick={applyPromo}>{promoBusy ? '…' : 'Применить'}</button>
              </div>
            )}
            {promoMsg && <small className="msg">{promoMsg}</small>}
          </div>
          {promo && <div className="cart-total small"><span>Без скидки</span><s className="muted">{rub(total)}</s></div>}
          <div className="cart-total"><span>К оплате</span><b className="price">{rub(pay)}</b></div>
          {msg && <p className="msg" role="status">{msg}</p>}
          <button type="submit" className="btn btn-primary press" disabled={!!busy || !!promoBusy || !ready}>{busy ? 'Оформляем…' : 'Оформить заказ'}</button>
          <button type="button" className="btn btn-secondary press" onClick={() => setStep('cart')}>Назад к корзине</button>
        </form>
      )}
    </main>
  );
}
