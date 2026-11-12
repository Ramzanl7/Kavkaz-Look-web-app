import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import EmptyState from '../components/EmptyState.jsx';
import ProductCard from '../components/ProductCard.jsx';
import { api } from '../api/index.js';
export default function BoutiqueDetails() {
  const { id } = useParams();
  const [b, setB] = useState(undefined);
  const [products, setProducts] = useState([]);
  useEffect(() => {
    let on = true;
    api.getBoutique(id).then((r) => { if (on) setB(r); });
    api.listProducts({ boutiqueId: id }).then((r) => { if (on) setProducts(r || []); });
    return () => { on = false; };
  }, [id]);
  if (b === undefined) return <main className="wrap"><p className="lead">Загрузка…</p></main>;
  if (!b) return <main className="wrap"><EmptyState title="Бутик не найден" /></main>;
  return (
    <main className="wrap">
      <h1 className="screen-title">{b.name}</h1>
      <p className="lead">{b.city}{b.description ? ' · ' + b.description : ''}</p>
      {products.length ? <div className="pgrid">{products.map((p) => <ProductCard key={p.id} p={p} />)}</div> : <EmptyState title="Товаров пока нет" />}
    </main>
  );
}
