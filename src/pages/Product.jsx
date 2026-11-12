import { useEffect, useState } from 'react';
import { history } from '../lib/local.js';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/index.js';
import PhotoSlot from '../components/PhotoSlot.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Reviews from '../components/Reviews.jsx';
import ReportSheet from '../components/ReportSheet.jsx';
import ProductCard from '../components/ProductCard.jsx';
import { Icon, starsText } from '../components/Icons.jsx';
import { useCart, rub } from '../store/cart.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { useWishlist } from '../store/wishlist.jsx';
import { useToast } from '../store/toast.jsx';
import { suggestSize } from '../lib/sizes.js';
import { guessType } from '../lib/fit.js';
import { Link } from 'react-router-dom';
export default function Product() {
  const { id } = useParams();
  const loc = useLocation();
  const nav = useNavigate();
  const { add } = useCart();
  const { user } = useAuth();
  const { ids, toggle } = useWishlist();
  const toast = useToast();
  const [m, setM] = useState(null);
  const [size, setSize] = useState(null);
  const [rep, setRep] = useState(false);
  const [rel, setRel] = useState({ same: [], shop: [] });
  const [needSize, setNeedSize] = useState(!!loc.state?.pickSize);
  useEffect(() => { if (user) api.getMeasurements().then(setM); }, [user]);
  // Данные карточки показываются сразу, свежие подгружаются в фоне
  const [p, setP] = useState(() => loc.state?.p ?? api.peekProduct(id) ?? undefined);
  useEffect(() => {
    let on = true;
    api.getProduct(id).then((r) => { if (r) { history.add(r.id); api.trackView(r.id); } if (on) setP((prev) => r ?? prev ?? null); });
    return () => { on = false; };
  }, [id]);
  useEffect(() => { setRel({ same: [], shop: [] }); setSize(null); if (p?.id) api.related(p).then(setRel); }, [p?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (p === undefined) return <main className="wrap"><div className="photo skeleton" style={{ aspectRatio: '4 / 5' }} /><div className="skeleton" style={{ height: 24, borderRadius: 6 }} /></main>;
  if (!p) return <main className="wrap"><EmptyState title="Товар не найден" text="Возможно, его уже убрали." /></main>;
  const on = ids.has(p.id);
  const soldOut = p.sizes?.length ? !!size && p.stock?.[size] === 0 : p.stock?._ === 0;
  const share = async () => {
    const url = window.location.origin + '/product/' + p.id, text = `${p.title} — ${rub(p.price)} в Kavkaz Look`;
    try { if (navigator.share) { await navigator.share({ title: p.title, text, url }); return; } } catch { return; }
    try { await navigator.clipboard.writeText(url); toast('Ссылка скопирована'); } catch { toast(url); }
  };
  const notifyMe = async () => {
    if (!user) { toast('Войдите, чтобы получить уведомление'); nav('/login'); return; }
    const err = await api.stockAlert(p.id, size);
    toast(err || 'Готово — сообщим, когда появится');
  };
  const heart = async () => { if (!user) { toast('Войдите, чтобы сохранять товары'); nav('/login'); return; } await toggle(p.id); };
  return (
    <main className="wrap">
      <Gallery p={p} />
      <h1 className="screen-title">{p.title}</h1>
      {p.boutiqueId ? <Link className="lead link-plain" to={'/boutiques/' + p.boutiqueId}>{p.boutique} ›</Link> : <p className="lead">{p.boutique}</p>}
      {p.ratingCount > 0 && <p className="stars">{starsText(p.rating)} {p.rating.toFixed(1)} <span className="muted">({p.ratingCount})</span></p>}
      <div className="price-line">
        <b className="price big">{rub(p.price)}</b>
        {p.oldPrice && <><s className="old-price">{rub(p.oldPrice)}</s><span className="badge-sale">−{Math.round((1 - p.price / p.oldPrice) * 100)}%</span></>}
        <button type="button" className="iconbtn share-btn" aria-label="Поделиться" onClick={share}><Icon name="send" /></button>
      </div>
      {p.description && <p>{p.description}</p>}
      {user && (() => {
        const s = suggestSize(m, p.category);
        if (s) return <Link className="size-card press" to="/measurements"><span className="muted">Ваш размер по меркам — ориентировочно</span><strong>{s.size}</strong><small className="muted">{s.note}. Сверьтесь с продавцом: лекала у брендов разные.</small></Link>;
        if (p.category !== 'Аксессуары') return <Link className="link-u" style={{ justifySelf: 'start' }} to="/measurements">Укажите мерки — подскажем размер</Link>;
        return null;
      })()}
      {guessType(p) !== 'none' && (
        <Link className="tryon-btn press" to={'/tryon/' + p.id}>
          <span className="tryon-ic" aria-hidden="true">◇</span>
          <span className="grow"><strong className="block">Примерить на себя</strong><small>{guessType(p) === 'shoes' ? 'Манекен по вашему размеру покажет, как сядет пара' : '3D-манекен по вашим меркам покажет, как сядет вещь'}</small></span>
        </Link>
      )}
      {p.sizes?.length > 0 && (
        <div className={'size-pick' + (needSize && !size ? ' need' : '')} id="size-pick">
          <span className="muted">{needSize && !size ? 'Выберите размер' : 'Размер'}</span>
          <div className="chips wrapchips" role="radiogroup" aria-label="Размер">
            {p.sizes.map((s) => {
              const left = p.stock ? p.stock[s] : undefined, out = left === 0;
              return <button key={s} type="button" role="radio" aria-checked={size === s} className={'chip' + (size === s ? ' on' : '') + (out ? ' out' : '')} onClick={() => setSize(s)}>{s}{out ? ' · нет' : ''}</button>;
            })}
          </div>
          {size && p.stock?.[size] > 0 && p.stock[size] <= 3 && <small className="muted">Осталось {p.stock[size]} шт.</small>}
        </div>
      )}
      {!p.sizes?.length && p.stock?._ === 0 && <p className="msg">Нет в наличии</p>}
      {!p.sizes?.length && p.stock?._ > 0 && p.stock._ <= 3 && <small className="muted">Осталось {p.stock._} шт.</small>}
      {soldOut && (
        <div className="bcard alert-card">
          <strong>{size ? `Размера ${size} сейчас нет` : 'Сейчас нет в наличии'}</strong>
          <span className="muted small">Пришлём уведомление, как только появится.</span>
          <button type="button" className="btn btn-secondary press" onClick={notifyMe}>Сообщить о поступлении</button>
        </div>
      )}
      <div className="row">
        <button type="button" className="btn btn-primary press grow" disabled={soldOut} onClick={() => {
          if (p.sizes?.length && !size) { setNeedSize(true); document.getElementById('size-pick')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
          add(p, size); toast(size ? `Добавлено в корзину, размер ${size}` : 'Добавлено в корзину');
        }}>В корзину</button>
        <button type="button" className={'iconbtn big' + (on ? ' on' : '')} onClick={heart} aria-label={on ? 'Убрать из избранного' : 'В избранное'}><Icon name="heart" /></button>
      </div>
      {rel.shop.length > 0 && <RelatedStrip title={'Ещё из бутика ' + p.boutique} items={rel.shop} />}
      {rel.same.length > 0 && <RelatedStrip title="Похожие товары" items={rel.same} />}
      <Reviews productId={p.id} />
      {user && <button type="button" className="link-muted" style={{ justifySelf: 'start' }} onClick={() => setRep(true)}><Icon name="shield" /> Пожаловаться на товар</button>}
      {rep && <ReportSheet type="product" id={p.id} onClose={() => setRep(false)} />}
    </main>
  );
}

// Галерея: листается пальцем, точки показывают номер фото
function Gallery({ p }) {
  const photos = p.photos?.length ? p.photos : [{ image: p.image, thumb: p.thumb }];
  const [i, setI] = useState(0);
  return (
    <div className="gallery">
      <div className="gallery-track" onScroll={(e) => setI(Math.round(e.currentTarget.scrollLeft / (e.currentTarget.clientWidth || 1)))}>
        {photos.map((ph, n) => <div key={n} className="gallery-item"><PhotoSlot src={ph.image} fallback={ph.thumb} alt={p.title + (photos.length > 1 ? `, фото ${n + 1}` : '')} ratio="4 / 5" priority={n === 0} /></div>)}
      </div>
      {photos.length > 1 && <div className="dots" aria-hidden="true">{photos.map((_, n) => <i key={n} className={n === i ? 'on' : ''} />)}</div>}
    </div>
  );
}

function RelatedStrip({ title, items }) {
  return (
    <section className="home-sec related">
      <div className="sec-head2"><h2>{title}</h2></div>
      <div className="hscroll popular">{items.map((x, i) => <ProductCard key={x.id} p={x} i={i} variant="compact" />)}</div>
    </section>
  );
}
