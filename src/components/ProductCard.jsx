import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PhotoSlot from './PhotoSlot.jsx';
import { Icon } from './Icons.jsx';
import { rub, useCart } from '../store/cart.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { useWishlist } from '../store/wishlist.jsx';
import { useToast } from '../store/toast.jsx';

// Одна карточка товара для всех лент: variant="grid" — основной каталог, "compact" — горизонтальная лента «Популярное».
// p.ad — оплаченное размещение: показываем пометку «Реклама» и по нажатию — рекламодателя и токен erid (38-ФЗ).
export default function ProductCard({ p, i = 0, variant = 'grid', priority = false }) {
  const { add } = useCart();
  const { user } = useAuth();
  const { ids, toggle } = useWishlist();
  const toast = useToast();
  const nav = useNavigate();
  const [pop, setPop] = useState(false);
  const [adInfo, setAdInfo] = useState(false);
  const on = ids.has(p.id);
  const heart = async () => {
    if (!user) { toast('Войдите, чтобы сохранять товары'); nav('/login'); return; }
    setPop(true); setTimeout(() => setPop(false), 350);
    await toggle(p.id);
  };
  const sizes = p.sizes?.length ? (p.sizes.length > 3 ? `${p.sizes[0]}–${p.sizes[p.sizes.length - 1]}` : p.sizes.join(', ')) : '';
  return (
    <div className={'pcard pcard-' + variant + ' rise'} style={{ '--d': Math.min(i, 8) }}>
      <Link to={'/product/' + encodeURIComponent(p.id)} state={{ p }} className="plink press" aria-label={p.title + ', ' + rub(p.price)}>
        <PhotoSlot src={p.thumb} fallback={p.image} alt={p.title} ratio={variant === 'compact' ? '31 / 30' : '4 / 5'} priority={priority} />
        <span className="pc-title">{p.title}</span>
        {variant === 'grid' && p.boutique && <span className="pc-shop">{p.boutique}</span>}
        <span className="pc-row">
          <b className="price">{rub(p.price)}</b>
          {variant === 'grid' && sizes && <span className="pc-sizes">{sizes}</span>}
        </span>
      </Link>
      <div className="pc-badges">
        {p.ad && <button type="button" className="badge-ad" onClick={() => setAdInfo(!adInfo)} aria-expanded={adInfo}>Реклама</button>}
        {!p.ad && p.isNew && variant === 'grid' && <span className="badge-new">Новинка</span>}
      </div>
      {adInfo && p.ad && (
        <div className="ad-info" role="note">
          Рекламодатель: {p.ad.advertiser}{p.ad.inn ? `, ИНН ${p.ad.inn}` : ''}{p.ad.erid ? <><br />erid: {p.ad.erid}</> : null}
        </div>
      )}
      <button type="button" className={'iconbtn heart' + (on ? ' on' : '') + (pop ? ' pop' : '')} onClick={heart} aria-label={on ? 'Убрать из избранного' : 'В избранное'}><Icon name="heart" /></button>
      <button type="button" className="cartbtn press" onClick={() => { if (p.sizes?.length) { nav('/product/' + encodeURIComponent(p.id), { state: { p, pickSize: true } }); return; } add(p); toast('Добавлено в корзину'); }} aria-label={'В корзину: ' + p.title}><Icon name="cart" /></button>
    </div>
  );
}
