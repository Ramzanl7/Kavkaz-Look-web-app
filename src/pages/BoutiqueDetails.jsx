import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import ProductCard from '../components/ProductCard.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ReportSheet from '../components/ReportSheet.jsx';
import { Icon } from '../components/Icons.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api/index.js';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../store/toast.jsx';
import { useAction } from '../lib/useAction.js';

// Страница бутика: обложка, логотип, описание, адрес, часы, контакты, доставка и товары
export default function BoutiqueDetails() {
  const { id } = useParams();
  const { user } = useAuth();
  const [b, setB] = useState(undefined);
  const [products, setProducts] = useState(null);
  const [rep, setRep] = useState(false);
  const [fol, setFol] = useState({ on: false, count: 0 });
  const nav = useNavigate(); const toast = useToast(); const [busy, run] = useAction();
  useEffect(() => { api.followState(id, user?.id).then(setFol); }, [id, user]);
  const follow = () => run(async () => {
    if (!user) { toast('Войдите, чтобы подписаться'); nav('/login'); return; }
    const next = !fol.on;
    if (await api.setFollow(id, next)) { setFol((f) => ({ on: next, count: Math.max(0, f.count + (next ? 1 : -1)) })); toast(next ? 'Вы подписались — сообщим о новинках' : 'Подписка отменена'); } else toast('Не удалось');
  });
  useEffect(() => {
    let on = true;
    api.getBoutique(id).then((r) => { if (on) setB(r); });
    api.listProducts({ boutiqueId: id }).then((r) => { if (on) setProducts(r || []); });
    return () => { on = false; };
  }, [id]);
  if (b === undefined) return <main className="wrap"><div className="skeleton" style={{ height: 180, borderRadius: 16 }} /></main>;
  if (!b) return <main className="wrap"><EmptyState title="Бутик не найден" /></main>;
  const wa = b.whatsapp ? 'https://wa.me/' + b.whatsapp : null;
  return (
    <main className="wrap">
      <div className={'bq-hero' + (b.cover ? ' has-cover' : '')} style={b.cover ? { '--cover': `url(${b.cover})` } : undefined}>
        {b.logo ? <img className="bq-hero-logo" src={b.logo} alt="" /> : <span className="bq-hero-logo bq-initial">{b.name.slice(0, 1)}</span>}
      </div>
      <div className="bq-title">
        <h1 className="screen-title">{b.name}</h1>
        <button type="button" className={'follow-btn press' + (fol.on ? ' on' : '')} aria-pressed={fol.on} disabled={!!busy} onClick={follow}>{fol.on ? 'Вы подписаны' : 'Подписаться'}</button>
      </div>
      {fol.count > 0 && <span className="muted small">Подписчиков: {fol.count}</span>}
      <p className="lead">{[b.city, b.address].filter(Boolean).join(', ')}{b.hours ? ' · ' + b.hours : ''}</p>
      {b.description && <p>{b.description}</p>}
      {(wa || b.telegram || b.phone) && (
        <div className="row-gap">
          {wa && <a className="act ok press" href={wa} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
          {b.telegram && <a className="act press" href={'https://t.me/' + b.telegram} target="_blank" rel="noopener noreferrer">Telegram</a>}
          {b.phone && <a className="act press" href={'tel:' + b.phone}>Позвонить</a>}
        </div>
      )}
      {(b.delivery_pickup !== undefined) && (
        <p className="muted small">Получение: {[b.delivery_pickup && 'самовывоз', b.delivery_courier && 'доставка курьером'].filter(Boolean).join(', ')}{b.courier_note ? ' — ' + b.courier_note : ''}. Оплата при получении.</p>
      )}
      <div className="sec-head"><h2>Товары{products ? ` (${products.length})` : ''}</h2></div>
      {products === null ? <div className="pgrid">{[0, 1].map((n) => <div key={n} className="pcard"><div className="photo skeleton" style={{ aspectRatio: '4 / 5' }} /></div>)}</div>
        : products.length ? <div className="pgrid">{products.map((p, i) => <ProductCard key={p.id} p={p} i={i} />)}</div> : <EmptyState title="Товаров пока нет" />}
      {user && <button type="button" className="link-muted" style={{ justifySelf: 'start' }} onClick={() => setRep(true)}><Icon name="shield" /> Пожаловаться на бутик</button>}
      {rep && <ReportSheet type="boutique" id={b.id} onClose={() => setRep(false)} />}
    </main>
  );
}
