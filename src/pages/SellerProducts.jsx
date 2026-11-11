import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import EmptyState from '../components/EmptyState.jsx';
import { rub } from '../store/cart.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api/index.js';
import { useAction } from '../lib/useAction.js';
import { useToast } from '../store/toast.jsx';
import { createPortal } from 'react-dom';
import SizeEditor from '../components/SizeEditor.jsx';
export default function SellerProducts() {
  const { user } = useAuth();
  const [items, setItems] = useState(null);
  const [boutique, setBoutique] = useState(null);
  const toast = useToast();
  const [editing, setEditing] = useState(null); // { p, sizing }
  const load = useCallback(async () => {
    const b = user ? await api.getMyBoutique(user.id) : null;
    setBoutique(b);
    setItems(b ? await api.listProducts({ boutiqueId: b.id }) : []);
  }, [user]);
  useEffect(() => { load(); }, [load]);
  const [busy, run] = useAction();
  const toggle = (p) => run(async () => { if (await api.setProductPublished(p.id, !p.published)) await load(); }, p.id);
  const saveSizing = () => run(async () => {
    if (await api.setProductSizing(editing.p.id, editing.sizing)) { toast('Размеры сохранены'); setEditing(null); await load(); } else toast('Не удалось сохранить');
  }, 'sizing');
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
              <button type="button" className="act press" onClick={() => setEditing({ p, sizing: { type: p.garmentType || '', sizes: p.sizes || [], chart: p.sizeChart || {} } })}>Размеры{p.sizes?.length ? ` (${p.sizes.length})` : ''}</button>
              <button type="button" className="act danger press" disabled={busy === p.id} onClick={() => remove(p)}>Удалить</button>
            </div>
          </div>
        ))}</div>
      ) : <EmptyState title="Товаров пока нет" text="Добавьте первый товар." />}
      {editing && createPortal(
        <div className="sheet-bg" role="presentation" onClick={() => !busy && setEditing(null)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label="Размеры товара" onClick={(e) => e.stopPropagation()}>
            <h2>{editing.p.title}</h2>
            <SizeEditor value={editing.sizing} onChange={(sizing) => setEditing({ ...editing, sizing })} title={editing.p.title} category={editing.p.category} />
            <button type="button" className="btn btn-primary press" disabled={!!busy} onClick={saveSizing}>{busy === 'sizing' ? 'Сохраняем…' : 'Сохранить размеры'}</button>
            <button type="button" className="btn btn-secondary press" onClick={() => setEditing(null)}>Отмена</button>
          </div>
        </div>,
        document.body,
      )}
    </main>
  );
}
