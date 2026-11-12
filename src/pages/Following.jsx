import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import EmptyState from '../components/EmptyState.jsx';
import { api } from '../api/index.js';

// Бутики, на которые подписан покупатель: о новинках приходят уведомления
export default function Following() {
  const [list, setList] = useState(null);
  useEffect(() => { api.listMyFollows().then(setList); }, []);
  return (
    <main className="wrap">
      <h1 className="screen-title rise">Мои бутики</h1>
      <p className="lead">Пришлём уведомление, когда в этих бутиках появятся новинки.</p>
      {list === null ? <p className="lead">Загрузка…</p> : list.length ? (
        <div className="menu">{list.map((b) => (
          <Link key={b.id} className="menu-item press" to={'/boutiques/' + b.id}>
            {b.logo ? <img className="follow-logo" src={b.logo} alt="" /> : <span className="follow-logo bq-initial">{b.name.slice(0, 1)}</span>}
            <span className="grow"><strong className="block">{b.name}</strong><small className="muted">{[b.city, b.address].filter(Boolean).join(', ')}</small></span>
          </Link>
        ))}</div>
      ) : <EmptyState title="Подписок пока нет" text="Откройте бутик и нажмите «Подписаться»." action={<Link className="btn btn-secondary press" to="/boutiques">Бутики</Link>} />}
    </main>
  );
}
