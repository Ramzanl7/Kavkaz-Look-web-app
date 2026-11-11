import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import EmptyState from '../components/EmptyState.jsx';
import { rub } from '../store/cart.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api/index.js';
import { useAction } from '../lib/useAction.js';
import { useToast } from '../store/toast.jsx';
export default function SellerProducts() {
  const { user } = useAuth();
  const [items, setItems] = useState(null);
  const [boutique, setBoutique] = useState(null);
  const toast = useToast();
  const load = useCallback(async () => {
    const b = user ? await api.getMyBoutique(user.id) : null;
    setBoutique(b);
    setItems(b ? await api.listProducts({ boutiqueId: b.id }) : []);
  }, [user]);
  useEffect(() => { load(); }, [load]);
  const [busy, run] = useAction();
  const toggle = (p) => run(async () => { if (await api.setProductPublished(p.id, !p.published)) await load(); }, p.id);
  const upload3d = (p, file) => run(async () => {
    if (!file || !boutique) return;
    const err = await api.uploadModel(boutique.id, p.id, file);
    toast(err || '3D-модель загружена');
    if (!err) await load();
  }, p.id);
  const remove3d = (p) => run(async () => { if (window.confirm('Убрать 3D-модель?') && (await api.removeModel(p.id, p.modelPath))) await load(); }, p.id);
  const remove = (p) => run(async () => { if (window.confirm('Удалить товар «' + p.title + '»?') && (await api.deleteProduct(p.id))) await load(); }, p.id);
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
              <button type="button" className="act press" disabled={busy === p.id} onClick={() => toggle(p)}>{p.published ? 'Скрыть' : 'Опубликовать'}</button>
              <button type="button" className="act danger press" disabled={busy === p.id} onClick={() => remove(p)}>Удалить</button>
              <label className={'act press' + (busy === p.id ? ' disabled' : '')}>
                {p.model ? 'Заменить 3D' : 'Добавить 3D (.glb)'}
                <input type="file" accept=".glb,model/gltf-binary" hidden disabled={busy === p.id} onChange={(e) => { upload3d(p, e.target.files?.[0]); e.target.value = ''; }} />
              </label>
              {p.model && <button type="button" className="act press" disabled={busy === p.id} onClick={() => remove3d(p)}>Убрать 3D</button>}
            </div>
          </div>
        ))}</div>
      ) : <EmptyState title="Товаров пока нет" text="Добавьте первый товар." />}
    </main>
  );
}
