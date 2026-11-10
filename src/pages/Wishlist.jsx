import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import EmptyState from '../components/EmptyState.jsx';
import ProductCard from '../components/ProductCard.jsx';
import { api } from '../api/index.js';
export default function Wishlist() {
  const [items, setItems] = useState(null);
  useEffect(() => { let on = true; api.listWishlist().then((r) => on && setItems(r)); return () => { on = false; }; }, []);
  return (
    <main className="wrap">
      <h1 className="screen-title rise">Избранное</h1>
      {items === null ? <p className="lead">Загрузка…</p> : items.length ? (
        <div className="pgrid">{items.map((p, i) => <ProductCard key={p.id} p={p} i={i} />)}</div>
      ) : <EmptyState title="Здесь пока пусто" text="Добавляйте товары в избранное на странице товара." action={<Link className="link-u" to="/catalog">В каталог</Link>} />}
    </main>
  );
}
