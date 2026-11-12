import { useEffect, useState } from 'react';
import EmptyState from '../components/EmptyState.jsx';
import ProductCard from '../components/ProductCard.jsx';
import { api } from '../api/index.js';
import { history } from '../lib/local.js';

// История просмотров — только на этом устройстве; появляется после реальных просмотров товаров
export default function History() {
  const [items, setItems] = useState(null);
  useEffect(() => { api.listProductsByIds(history.list()).then(setItems); }, []);
  return (
    <main className="wrap">
      <h1 className="screen-title rise">История просмотров</h1>
      {items === null ? <div className="pgrid">{[0, 1].map((n) => <div key={n} className="pcard"><div className="photo skeleton" style={{ aspectRatio: '4 / 5' }} /></div>)}</div>
        : items.length ? <>
          <div className="pgrid">{items.map((p, i) => <ProductCard key={p.id} p={p} i={i} />)}</div>
          <button type="button" className="link-muted" style={{ justifySelf: 'start' }} onClick={() => { history.clear(); setItems([]); }}>Очистить историю</button>
        </> : <EmptyState title="История пуста" text="Здесь появятся товары, которые вы открывали." />}
      <p className="hint">История хранится только на этом устройстве.</p>
    </main>
  );
}
