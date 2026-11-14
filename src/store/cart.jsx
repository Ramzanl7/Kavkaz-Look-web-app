import { createContext, useContext, useEffect, useState } from 'react';
const KEY = 'kl-cart';
const CartCtx = createContext(null);
export const rub = (n) => new Intl.NumberFormat('ru-RU').format(n) + ' ₽';
// Позиция корзины = товар + размер. Цены здесь только для показа: сумму, цену и наличие проверяет сервер.
const keyOf = (id, size) => id + '|' + (size || '');
const valid = (i) => i && typeof i.id === 'string' && typeof i.title === 'string' && Number.isFinite(i.price) && Number.isInteger(i.qty) && i.qty > 0 && i.qty < 100
  && (i.size == null || /^[0-9A-Za-z.,]{1,6}$/.test(i.size));
const load = () => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(v) ? v.filter(valid).map((i) => ({ ...i, key: keyOf(i.id, i.size) })) : [];
  } catch { return []; }
};
export function CartProvider({ children }) {
  const [items, setItems] = useState(load);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* хранилище недоступно */ } }, [items]);
  const add = (p, size = null) => {
    const k = keyOf(String(p.id), size);
    setItems((l) => (l.some((i) => i.key === k)
      ? l.map((i) => (i.key === k ? { ...i, qty: Math.min(i.qty + 1, 99) } : i))
      : [...l, { key: k, id: String(p.id), size: size || null, title: String(p.title), price: Number(p.price), thumb: p.thumb || null, boutique: p.boutique || '' }]
        .map((i) => (i.key === k && !i.qty ? { ...i, qty: 1 } : i))));
  };
  // вернуть убранную позицию (кнопка «Вернуть»)
  const put = (item) => setItems((l) => (l.some((i) => i.key === item.key) ? l : [...l, item]));
  // сменить размер прямо в корзине; если такой размер уже лежит — объединяем
  const changeSize = (key, size) => setItems((l) => {
    const it = l.find((i) => i.key === key); if (!it) return l;
    const nk = keyOf(it.id, size), same = l.find((i) => i.key === nk && i.key !== key);
    if (same) return l.filter((i) => i.key !== key).map((i) => (i.key === nk ? { ...i, qty: Math.min(i.qty + it.qty, 99) } : i));
    return l.map((i) => (i.key === key ? { ...i, size, key: nk } : i));
  });
  // свежие данные с сервера: цена, название, фото, бутик
  const sync = (fresh) => setItems((l) => l.map((i) => { const p = fresh.get(i.id); return p ? { ...i, price: p.price, title: p.title, thumb: p.thumb || i.thumb, boutique: p.boutique || i.boutique } : i; }));
  const setQty = (key, qty) => setItems((l) => (qty < 1 ? l.filter((i) => i.key !== key) : l.map((i) => (i.key === key ? { ...i, qty: Math.min(qty, 99) } : i))));
  const remove = (key) => setItems((l) => l.filter((i) => i.key !== key));
  const clear = () => setItems([]);
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  return <CartCtx.Provider value={{ items, add, setQty, remove, clear, total, put, changeSize, sync }}>{children}</CartCtx.Provider>;
}
export const useCart = () => useContext(CartCtx);
