import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import EmptyState from '../components/EmptyState.jsx';
import { rub } from '../store/cart.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api/index.js';
export default function SellerProducts() {
  const { user } = useAuth();
  const [items, setItems] = useState(null);
  const load = useCallback(async () => {
    const b = user ? await api.getMyBoutique(user.id) : null;
    setItems(b ? await api.listProducts({ boutiqueId: b.id }) : []);
  }, [user]);
  useEffect(() => { load(); }, [load]);
  const toggle = async (p) => { if (await api.setProductPublished(p.id, !p.published)) load(); };
  const remove = async (p) => { if (window.confirm('Удалить товар «' + p.title + '»?') && (await api.deleteProduct(p.id))) load(); };
  return (
    <main className="wrap">
      <h1 className="screen-title rise">Мои товары</h1>
      <Link className="btn btn-primary press" to="/seller/products/new">Добавить товар</Link>
      {items === null ? <p className="lead">Загрузка…</p> : items.length ? (
        <div className="list">{items.map((p) => (
          <div key={p.id} className="bcard">
            <strong>{p.title}</strong>
            <span className="muted">{rub(p.price)} · {p.category} · {p.published ? 'опубликован' : 'скрыт'}</span>
            <div className="acts">
              <button type="button" className="act press" onClick={() => toggle(p)}>{p.published ? 'Скрыть' : 'Опубликовать'}</button>
              <button type="button" className="act danger press" onClick={() => remove(p)}>Удалить</button>
            </div>
          </div>
        ))}</div>
      ) : <EmptyState title="Товаров пока нет" text="Добавьте первый товар." />}
    </main>
  );
}
