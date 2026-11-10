import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import EmptyState from '../components/EmptyState.jsx';
import { api } from '../api/index.js';
export default function Boutiques() {
  const [items, setItems] = useState(null);
  useEffect(() => { let on = true; api.listBoutiques().then((r) => on && setItems(r)); return () => { on = false; }; }, []);
  return (
    <main className="wrap">
      <h1 className="screen-title rise">Бутики</h1>
      {items === null ? <p className="lead">Загрузка…</p> : items.length ? (
        <div className="list">{items.map((b) => (
          <Link key={b.id} to={'/boutiques/' + b.id} className="bcard press"><strong>{b.name}</strong><span className="muted">{b.city}</span></Link>
        ))}</div>
      ) : <EmptyState title="Бутиков пока нет" text="Они появятся после одобрения заявок." action={<Link className="link-u" to="/become-seller">Я представляю бутик</Link>} />}
    </main>
  );
}
