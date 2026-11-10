import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import EmptyState from '../components/EmptyState.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api/index.js';
export default function SellerHome() {
  const { user } = useAuth();
  const [b, setB] = useState(undefined);
  useEffect(() => { if (user) api.getMyBoutique(user.id).then(setB); }, [user]);
  if (b === undefined) return <main className="wrap"><p className="lead">Загрузка…</p></main>;
  if (!b) return <main className="wrap"><EmptyState title="Бутик не найден" text="Обратитесь к администратору." /></main>;
  return (
    <main className="wrap">
      <h1 className="screen-title rise">{b.name}</h1>
      <p className="notice">{b.is_approved ? 'Бутик одобрен и виден покупателям.' : 'Бутик ожидает одобрения администратора.'}</p>
      <div className="list">
        <Link className="tile press" to="/seller/products/new">Добавить товар</Link>
        <Link className="tile press" to="/seller/products">Мои товары</Link>
        <Link className="tile press" to="/seller/orders">Заказы бутика</Link>
      </div>
    </main>
  );
}
