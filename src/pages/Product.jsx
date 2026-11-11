import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/index.js';
import PhotoSlot from '../components/PhotoSlot.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Reviews from '../components/Reviews.jsx';
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
  useEffect(() => { if (user) api.getMeasurements().then(setM); }, [user]);
  // Данные карточки показываются сразу, свежие подгружаются в фоне
  const [p, setP] = useState(() => loc.state?.p ?? api.peekProduct(id) ?? undefined);
  useEffect(() => {
    let on = true;
    api.getProduct(id).then((r) => { if (on) setP((prev) => r ?? prev ?? null); });
    return () => { on = false; };
  }, [id]);
  if (p === undefined) return <main className="wrap"><div className="photo skeleton" style={{ aspectRatio: '4 / 5' }} /><div className="skeleton" style={{ height: 24, borderRadius: 6 }} /></main>;
  if (!p) return <main className="wrap"><EmptyState title="Товар не найден" text="Возможно, его уже убрали." /></main>;
  const on = ids.has(p.id);
  const heart = async () => { if (!user) { toast('Войдите, чтобы сохранять товары'); nav('/login'); return; } await toggle(p.id); };
  return (
    <main className="wrap">
      <PhotoSlot key={p.id} src={p.image} alt={p.title} ratio="4 / 5" priority />
      <h1 className="screen-title">{p.title}</h1>
      <p className="lead">{p.boutique}</p>
      {p.ratingCount > 0 && <p className="stars">{starsText(p.rating)} {p.rating.toFixed(1)} <span className="muted">({p.ratingCount})</span></p>}
      <b className="price big">{rub(p.price)}</b>
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
          <span className="grow"><strong className="block">Примерить на себя</strong><small>3D-манекен по вашим меркам покажет, как сядет вещь</small></span>
        </Link>
      )}
      {p.sizes?.length > 0 && <p className="muted">Размеры в наличии: {p.sizes.join(', ')}</p>}
      <div className="row">
        <button type="button" className="btn btn-primary press grow" onClick={() => { add(p); toast('Добавлено в корзину'); }}>В корзину</button>
        <button type="button" className={'iconbtn big' + (on ? ' on' : '')} onClick={heart} aria-label={on ? 'Убрать из избранного' : 'В избранное'}><Icon name="heart" /></button>
      </div>
      <Reviews productId={p.id} />
    </main>
  );
}
