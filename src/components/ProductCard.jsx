import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PhotoSlot from './PhotoSlot.jsx';
import { Icon } from './Icons.jsx';
import { rub, useCart } from '../store/cart.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { useWishlist } from '../store/wishlist.jsx';
import { useToast } from '../store/toast.jsx';
export default function ProductCard({ p, i = 0 }) {
  const { add } = useCart();
  const { user } = useAuth();
  const { ids, toggle } = useWishlist();
  const toast = useToast();
  const nav = useNavigate();
  const [pop, setPop] = useState(false);
  const on = ids.has(p.id);
  const heart = async () => {
    if (!user) { toast('Войдите, чтобы сохранять товары'); nav('/login'); return; }
    setPop(true); setTimeout(() => setPop(false), 350);
    await toggle(p.id);
  };
  return (
    <div className="pcard rise" style={{ '--d': Math.min(i, 8) }}>
      <Link to={'/product/' + encodeURIComponent(p.id)} state={{ p }} className="plink press">
        <PhotoSlot src={p.thumb} fallback={p.image} alt={p.title} ratio="4 / 5" />
        <strong>{p.title}</strong>
        <span className="muted">{p.boutique}</span>
        {p.ratingCount > 0 && <span className="stars">★ {p.rating.toFixed(1)} <span className="muted">({p.ratingCount})</span></span>}
        <b className="price">{rub(p.price)}</b>
      </Link>
      <button type="button" className={'iconbtn heart' + (on ? ' on' : '') + (pop ? ' pop' : '')} onClick={heart} aria-label={on ? 'Убрать из избранного' : 'В избранное'}><Icon name="heart" /></button>
      <button type="button" className="addbtn press" onClick={() => { add(p); toast('Добавлено в корзину'); }}>В корзину</button>
    </div>
  );
}
