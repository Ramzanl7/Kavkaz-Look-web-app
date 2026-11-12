import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import ProductCard from '../components/ProductCard.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { api } from '../api/index.js';

// Подборка от администратора: обложка, описание и товары
export default function CollectionPage() {
  const { id } = useParams();
  const [c, setC] = useState(undefined);
  useEffect(() => { api.getCollection(id).then(setC); }, [id]);
  if (c === undefined) return <main className="wrap"><div className="skeleton" style={{ height: 160, borderRadius: 16 }} /></main>;
  if (!c) return <main className="wrap"><EmptyState title="Подборка не найдена" text="Возможно, она уже закончилась." /></main>;
  return (
    <main className="wrap">
      <div className={'coll-hero' + (c.cover ? ' has-cover' : '')} style={c.cover ? { '--cover': `url(${c.cover})` } : undefined}>
        <h1>{c.title}</h1>{c.subtitle && <p>{c.subtitle}</p>}
      </div>
      {c.products.length ? <div className="pgrid">{c.products.map((p, i) => <ProductCard key={p.id} p={p} i={i} />)}</div> : <EmptyState title="Товары скоро появятся" />}
    </main>
  );
}
