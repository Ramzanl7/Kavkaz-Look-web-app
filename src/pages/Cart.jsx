import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import EmptyState from '../components/EmptyState.jsx';
import { useCart, rub } from '../store/cart.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api/index.js';
export default function Cart() {
  const { items, setQty, clear, total } = useCart();
  const { user } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const checkout = async () => {
    setBusy(true); setMsg('');
    const id = await api.createOrder(items);
    setBusy(false);
    if (id) { clear(); nav('/orders'); } else setMsg('Не удалось оформить заказ. Возможно, товар уже недоступен.');
  };
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
          {user ? <button type="button" className="btn btn-primary press" disabled={busy} onClick={checkout}>Оформить заказ</button> : <Link className="btn btn-primary press" to="/login">Войти, чтобы оформить</Link>}
          <p className="notice">Тестовый режим: заказ сохраняется без доставки и оплаты. Итоговую сумму пересчитывает сервер.</p>
        </>
      )}
    </main>
  );
}
