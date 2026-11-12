import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import ProductCard from '../components/ProductCard.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ReportSheet from '../components/ReportSheet.jsx';
import { Icon } from '../components/Icons.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api/index.js';

// Страница бутика: обложка, логотип, описание, адрес, часы, контакты, доставка и товары
export default function BoutiqueDetails() {
  const { id } = useParams();
  const { user } = useAuth();
  const [b, setB] = useState(undefined);
  const [products, setProducts] = useState(null);
  const [rep, setRep] = useState(false);
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
      <h1 className="screen-title">{b.name}</h1>
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
