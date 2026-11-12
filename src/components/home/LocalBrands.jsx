import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../Icons.jsx';

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const ua = () => navigator.userAgent || '';
const isIOS = () => /iPhone|iPad|iPod/.test(ua()) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = () => /Android/.test(ua());

// Переход к бренду: своя страница в Kavkaz Look → приложение (универсальная ссылка откроет его, если установлено,
// иначе — страницу в App Store / Google Play) → сайт → карточка с описанием внутри приложения.
export function useOpenBrand() {
  const nav = useNavigate();
  const [info, setInfo] = useState(null);
  const open = (b) => {
    if (!b) return;
    if (b.boutique_id) { nav('/boutiques/' + b.boutique_id); return; }
    const app = isIOS() ? b.ios_url : isAndroid() ? b.android_url : null;
    const target = app || b.site_url;
    if (target) { window.open(target, '_blank', 'noopener,noreferrer'); return; }
    setInfo(b);
  };
  const sheet = info && (
    <div className="sheet-bg" onClick={() => setInfo(null)}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="brand-t" onClick={(e) => e.stopPropagation()}>
        {info.banner && <img className="brand-sheet-img" src={info.banner} alt="" />}
        <h2 id="brand-t">{info.name}</h2>
        {info.description && <p className="lead" style={{ margin: 0 }}>{info.description}</p>}
        <p className="hint" style={{ margin: 0 }}>Сайт и приложение бренда скоро появятся.</p>
        <button type="button" className="btn btn-primary press" onClick={() => setInfo(null)}>Понятно</button>
      </div>
    </div>
  );
  return [open, sheet];
}

export function BrandCard({ b, onOpen }) {
  return (
    <button type="button" className="brand-card press" onClick={() => onOpen(b)} aria-label={b.name + (b.description ? '. ' + b.description : '')}>
      {b.banner ? <img src={b.banner} alt="" loading="lazy" decoding="async" /> : <span className="brand-bg" aria-hidden="true" />}
      <span className="brand-shade" aria-hidden="true" />
      <span className="brand-go" aria-hidden="true"><Icon name="arrow" /></span>
      <span className="brand-text">
        {b.logo && <img className="brand-logo" src={b.logo} alt="" loading="lazy" />}
        <strong>{b.name}</strong>
        {b.description && <small>{b.description}</small>}
      </span>
    </button>
  );
}

// «Сделано рядом»: автоматическая карусель (раз в 6 с, плавно), ручная прокрутка, пауза при касании, индикаторы страниц
export default function LocalBrands({ brands, onOpen }) {
  const track = useRef(null);
  const [page, setPage] = useState(0);
  const pause = useRef(0);
  const n = brands.length;
  useEffect(() => {
    const el = track.current; if (!el || n < 2) return undefined;
    const onScroll = () => { const w = el.firstElementChild?.offsetWidth || 1; setPage(Math.min(n - 1, Math.round(el.scrollLeft / (w + 12)))); };
    const stop = () => { pause.current = Date.now() + 10000; };
    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('pointerdown', stop); el.addEventListener('wheel', stop, { passive: true }); el.addEventListener('focusin', stop);
    const t = setInterval(() => {
      if (document.hidden || Date.now() < pause.current || reduced()) return;
      const w = el.firstElementChild?.offsetWidth || 0, max = el.scrollWidth - el.clientWidth;
      const next = el.scrollLeft + w + 12 > max + 2 ? 0 : el.scrollLeft + w + 12;
      el.scrollTo({ left: next, behavior: 'smooth' });
    }, 6000);
    return () => { clearInterval(t); el.removeEventListener('scroll', onScroll); el.removeEventListener('pointerdown', stop); el.removeEventListener('wheel', stop); el.removeEventListener('focusin', stop); };
  }, [n]);
  if (!n) return null;
  return (
    <section className="home-sec" aria-labelledby="near-h">
      <div className="sec-head2">
        <h2 id="near-h"><Icon name="hand" />Сделано рядом</h2>
        <Link className="sec-link" to="/brands">Все бренды <Icon name="arrow" /></Link>
      </div>
      <div className="hscroll brands" ref={track}>
        {brands.map((b) => <BrandCard key={b.id} b={b} onOpen={onOpen} />)}
      </div>
      {n > 1 && <div className="dots" aria-hidden="true">{brands.map((b, i) => <i key={b.id} className={i === page ? 'on' : ''} />)}</div>}
    </section>
  );
}
