import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import EmptyState from '../components/EmptyState.jsx';
import { BrandCard, useOpenBrand } from '../components/home/LocalBrands.jsx';
import { api } from '../api/index.js';

// Все местные бренды из «Сделано рядом»
export default function Brands() {
  const [list, setList] = useState(null);
  const [open, sheet] = useOpenBrand();
  useEffect(() => { api.listLocalBrands().then(setList); }, []);
  return (
    <main className="wrap">
      <h1 className="screen-title rise">Сделано рядом</h1>
      <p className="lead">Чеченские бренды и местные производители.</p>
      {list === null ? <div className="brand-grid">{[0, 1].map((n) => <div key={n} className="brand-card skeleton" />)}</div>
        : list.length ? <div className="brand-grid">{list.map((b) => <BrandCard key={b.id} b={b} onOpen={open} />)}</div>
          : <EmptyState title="Скоро здесь будут бренды" text="Мы договариваемся с местными производителями." />}
      <Link className="link-u" to="/partners" style={{ justifySelf: 'start' }}>Стать партнёром</Link>
      {sheet}
    </main>
  );
}
