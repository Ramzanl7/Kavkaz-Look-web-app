import { useEffect, useRef, useState } from 'react';
import ProductCard from '../ProductCard.jsx';
import { Icon } from '../Icons.jsx';
import { PAGE } from '../../api/index.js';

// Сетка товаров ленты: заглушки при загрузке, бесконечная прокрутка, пустое состояние
export function FeedGrid({ feed, empty }) {
  const { items, more, sentinel } = feed;
  if (items === null) return <div className="pgrid">{[0, 1, 2, 3].map((n) => <div key={n} className="pcard"><div className="photo skeleton" style={{ aspectRatio: '4 / 5' }} /><div className="skeleton" style={{ height: 14, borderRadius: 6 }} /><div className="skeleton" style={{ height: 14, width: '60%', borderRadius: 6 }} /></div>)}</div>;
  if (!items.length) return empty;
  return <>
    <div className="pgrid">{items.map((p, i) => <ProductCard key={p.id} p={p} i={i % PAGE} />)}</div>
    <div ref={sentinel} className="load-more" aria-hidden={!more}>{more ? <span className="spinner" /> : null}</div>
  </>;
}

// горизонтальная лента с индикаторами страниц
export function Strip({ children }) {
  const ref = useRef(null);
  const [pages, setPages] = useState(1), [page, setPage] = useState(0);
  useEffect(() => {
    const el = ref.current; if (!el) return undefined;
    // одна точка на карточку; активная — та, что сейчас слева
    const upd = () => { const n = el.children.length, w = (el.firstElementChild?.offsetWidth || 1) + 12, end = el.scrollLeft >= el.scrollWidth - el.clientWidth - 2; setPages(n); setPage(end ? n - 1 : Math.min(n - 1, Math.round(el.scrollLeft / w))); };
    upd(); el.addEventListener('scroll', upd, { passive: true }); window.addEventListener('resize', upd);
    return () => { el.removeEventListener('scroll', upd); window.removeEventListener('resize', upd); };
  }, [children]);
  return (
    <>
      <div className="hscroll popular" ref={ref}>{children}</div>
      {pages > 1 && <div className="dots" aria-hidden="true">{Array.from({ length: pages }, (_, i) => <i key={i} className={i === page ? 'on' : ''} />)}</div>}
    </>
  );
}

// кнопка «Наверх»: появляется, когда пролистали ленту вниз
export function ToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const on = () => setShow(window.scrollY > window.innerHeight * 1.5);
    window.addEventListener('scroll', on, { passive: true }); on();
    return () => window.removeEventListener('scroll', on);
  }, []);
  return (
    <button type="button" className={'to-top press' + (show ? ' on' : '')} aria-label="Наверх" tabIndex={show ? 0 : -1}
      onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })}>
      <Icon name="down" />
    </button>
  );
}
