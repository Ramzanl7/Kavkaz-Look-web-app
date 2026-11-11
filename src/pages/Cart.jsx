import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import EmptyState from '../components/EmptyState.jsx';
import { useCart, rub } from '../store/cart.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api/index.js';
import { useAction } from '../lib/useAction.js';

// Ключ попытки оформления: тот же состав корзины → тот же ключ, даже после перезагрузки страницы.
function attemptKey(items) {
  const sig = items.map((i) => i.id + ':' + i.qty).sort().join(',');
  try {
    const saved = JSON.parse(sessionStorage.getItem('kl_order_attempt') || 'null');
    if (saved?.sig === sig) return saved.key;
    const key = crypto.randomUUID();
    sessionStorage.setItem('kl_order_attempt', JSON.stringify({ sig, key }));
    return key;
  } catch { return crypto.randomUUID(); }
}
const forgetAttempt = () => { try { sessionStorage.removeItem('kl_order_attempt'); } catch { /* приватный режим */ } };
export default function Cart() {
  const { items, setQty, clear, total } = useCart();
  const { user } = useAuth();
  const nav = useNavigate();
  const [busy, run] = useAction(1500);
  const [msg, setMsg] = useState('');
  const checkout = () => run(async () => {
    setMsg('');
    const id = await api.createOrder(items, attemptKey(items));
    if (id) { forgetAttempt(); clear(); nav('/orders'); } else setMsg('Не удалось оформить заказ. Проверьте интернет и нажмите ещё раз — повторный заказ не создастся.');
  });
  return (
    <main className="wrap">
      <h1 className="screen-title rise">Корзина</h1>
      {items.length === 0 ? (
        <EmptyState title="Корзина пуста" action={<Link className="btn btn-secondary press" to="/catalog">В каталог</Link>} />
      ) : (
        <>
          {items.map((i) => (
            <div key={i.id} className="cart-row">
              <div><strong>{i.title}</strong><div className="muted">{rub(i.price)}</div></div>
              <div className="qty">
                <button type="button" aria-label="Меньше" onClick={() => setQty(i.id, i.qty - 1)}>−</button>
                <span>{i.qty}</span>
                <button type="button" aria-label="Больше" onClick={() => setQty(i.id, i.qty + 1)}>+</button>
              </div>
            </div>
          ))}
          <div className="cart-total"><span>Итого</span><b className="price">{rub(total)}</b></div>
          {msg && <p className="msg" role="status">{msg}</p>}
          {user ? <button type="button" className="btn btn-primary press" disabled={!!busy} onClick={checkout}>{busy ? 'Оформляем…' : 'Оформить заказ'}</button> : <Link className="btn btn-primary press" to="/login">Войти, чтобы оформить</Link>}
          <p className="notice">Тестовый режим: заказ сохраняется без доставки и оплаты. Итоговую сумму пересчитывает сервер.</p>
        </>
      )}
    </main>
  );
}
