import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import EmptyState from '../components/EmptyState.jsx';
import { api } from '../api/index.js';
const names = { food: 'Еда', taxi: 'Такси', delivery: 'Доставка', coffee: 'Кофейни' };
export default function Nearby() {
  const { category } = useParams();
  const [items, setItems] = useState(null);
  useEffect(() => { let on = true; setItems(null); api.listPartners(category).then((r) => on && setItems(r)); return () => { on = false; }; }, [category]);
  return (
    <main className="wrap">
      <h1 className="screen-title rise">{names[category] || 'Сделано рядом'}</h1>
      {items === null ? <p className="lead">Загрузка…</p> : items.length ? (
        <div className="list">{items.map((p) => <div key={p.id} className="bcard"><strong>{p.name}</strong>{p.description && <span className="muted">{p.description}</span>}</div>)}</div>
      ) : <EmptyState title="Партнёры скоро появятся" text="Мы начинаем сотрудничество с чеченскими брендами." action={<Link className="btn btn-secondary press" to="/partners">Стать партнёром</Link>} />}
    </main>
  );
}
