import { createContext, useContext, useEffect, useState } from 'react';
const KEY = 'kl-cart';
const CartCtx = createContext(null);
export const rub = (n) => new Intl.NumberFormat('ru-RU').format(n) + ' ₽';
// Цены в корзине нужны только для показа. Итоговую сумму заказа всегда пересчитывает сервер.
const valid = (i) => i && typeof i.id === 'string' && typeof i.title === 'string' && Number.isFinite(i.price) && Number.isInteger(i.qty) && i.qty > 0 && i.qty < 100;
const load = () => { try { const v = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(v) ? v.filter(valid) : []; } catch { return []; } };
export function CartProvider({ children }) {
  const [items, setItems] = useState(load);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* хранилище недоступно */ } }, [items]);
  const add = (p) => setItems((l) => l.some((i) => i.id === p.id)
    ? l.map((i) => (i.id === p.id ? { ...i, qty: Math.min(i.qty + 1, 99) } : i))
    : [...l, { id: String(p.id), title: String(p.title), price: Number(p.price), qty: 1 }]);
  const setQty = (id, qty) => setItems((l) => (qty < 1 ? l.filter((i) => i.id !== id) : l.map((i) => (i.id === id ? { ...i, qty: Math.min(qty, 99) } : i))));
  const clear = () => setItems([]);
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  return <CartCtx.Provider value={{ items, add, setQty, clear, total }}>{children}</CartCtx.Provider>;
}
export const useCart = () => useContext(CartCtx);
