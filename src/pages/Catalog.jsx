import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icons.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ProductCard from '../components/ProductCard.jsx';
import HomeHeader from '../components/home/HomeHeader.jsx';
import SearchBar from '../components/home/SearchBar.jsx';
import LocalBrands, { useOpenBrand } from '../components/home/LocalBrands.jsx';
import { api, PAGE } from '../api/index.js';
import { history, city as cityStore } from '../lib/local.js';
import { BELT } from '../components/ornamentPaths.js';

// Главная (каталог): шапка → поиск → разделы → ИИ-стилист → «Сделано рядом» → «Популярное сейчас» → история → каталог.
const CATS = ['Для вас', 'Женское', 'Мужское', 'Национальное', 'Обувь', 'Аксессуары'];
const NOFILTER = { minPrice: '', maxPrice: '', size: '', sort: 'new' };

export default function Catalog() {
  const [cat, setCat] = useState('Для вас');
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState(NOFILTER);
  const [city, setCity] = useState(cityStore.get);
  const [brands, setBrands] = useState([]);
  const [popular, setPopular] = useState(null);
  const [hasHistory] = useState(() => history.list().length > 0);
  const [openBrand, brandSheet] = useOpenBrand();
  const chipsRef = useRef(null);
  const opts = { query, category: cat === 'Для вас' ? '' : cat, ...filters, city };
  const searching = query.trim() !== '' || cat !== 'Для вас' || !!(filters.minPrice || filters.maxPrice || filters.size || filters.sort !== 'new');

  useEffect(() => { api.listLocalBrands().then(setBrands); api.listPopular().then(setPopular); }, []);

  // каталог: первая страница сразу (из кэша, если есть), следующие — при прокрутке
  const [items, setItems] = useState(() => api.peekList({ ...opts, boutiqueId: '' }));
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(true);
  const [error, setError] = useState(false);
  const loading = useRef(false), req = useRef(0);
  const key = JSON.stringify(opts);
  useEffect(() => {
    const id = ++req.current;
    const cached = api.peekList({ ...opts, boutiqueId: '' });
    setItems(cached ?? null); setPage(0); setMore(true); setError(false);
    loading.current = true;
    const t = setTimeout(() => api.listProducts({ ...opts, page: 0 }).then((r) => {
      if (id !== req.current) return;
      loading.current = false;
      if (r === null) { setError(true); setItems((v) => v ?? []); return; }
      setItems(r); setMore(r.length === PAGE);
    }), query ? 300 : 0);
    return () => clearTimeout(t);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const loadMore = useCallback(() => {
    if (loading.current || !more || !items) return;
    loading.current = true;
    const id = req.current, next = page + 1;
    api.listProducts({ ...opts, page: next }).then((r) => {
      if (id !== req.current) return;
      loading.current = false;
      const list = r || [];
      setItems((v) => { const have = new Set(v.map((p) => p.id)); return [...v, ...list.filter((p) => !have.has(p.id))]; });
      setPage(next); setMore(list.length === PAGE);
    });
  }, [items, more, page, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const sentinel = useRef(null);
  useEffect(() => {
    const el = sentinel.current; if (!el) return undefined;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) loadMore(); }, { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  const toCatalog = () => document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const changeCity = (c) => { setCity(c); cityStore.set(c); };

  return (
    <main className="wrap home">
      <HomeHeader city={city} onCity={changeCity} />
      <SearchBar value={query} onChange={setQuery} filters={filters} onFilters={setFilters}
        onBrand={(id) => openBrand(brands.find((b) => b.id === id))} />
      <div className="cat-row">
        <div className="chips cat-chips" role="tablist" aria-label="Разделы" ref={chipsRef}>
          {CATS.map((c) => (
            <button key={c} type="button" role="tab" aria-selected={c === cat} className={'chip press' + (c === cat ? ' on' : '')} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>
        <button type="button" className="cat-more" aria-label="Ещё разделы" onClick={() => chipsRef.current?.scrollBy({ left: 160, behavior: 'smooth' })}><Icon name="chevron" /></button>
      </div>

      {!searching && <>
        <Link className="stylist-bar press" to="/stylist">
          <span className="stylist-ic"><Icon name="sparkles" /></span>
          <span className="grow"><strong>ИИ-стилист</strong><small>Подберём образ под твой бюджет</small></span>
          <svg className="stylist-orn" viewBox={`0 0 ${BELT.w} ${BELT.h}`} aria-hidden="true"><path d={BELT.d} fill="currentColor" /></svg>
          <Icon name="chevron" />
        </Link>

        <LocalBrands brands={brands} onOpen={openBrand} />

        {popular && popular.length > 0 && (
          <section className="home-sec" aria-labelledby="pop-h">
            <div className="sec-head2">
              <h2 id="pop-h"><Icon name="flame" />Популярное сейчас</h2>
              <button type="button" className="sec-link" onClick={toCatalog}>Все товары <Icon name="arrow" /></button>
            </div>
            <Strip>{popular.map((p, i) => <ProductCard key={p.id} p={p} i={i} variant="compact" priority={i < 2} />)}</Strip>
          </section>
        )}
        {popular === null && <div className="hscroll popular">{[0, 1, 2].map((n) => <div key={n} className="pcard pcard-compact"><div className="photo skeleton" style={{ aspectRatio: '4 / 5' }} /></div>)}</div>}

        {hasHistory && (
          <Link className="history-link press" to="/history"><Icon name="clock" /><span className="grow">История просмотров</span><Icon name="chevron" /></Link>
        )}
      </>}

      <section className="home-sec" id="catalog" aria-labelledby="cat-h">
        <div className="sec-head2">
          <h2 id="cat-h"><Icon name="catalog" />{searching ? 'Результаты' : 'Каталог'}</h2>
          {city ? <span className="muted small">{city}</span> : searching ? null : <button type="button" className="sec-link" onClick={toCatalog}>Все товары <Icon name="arrow" /></button>}
        </div>
        {items === null ? (
          <div className="pgrid">{[0, 1, 2, 3].map((n) => <div key={n} className="pcard"><div className="photo skeleton" style={{ aspectRatio: '4 / 5' }} /><div className="skeleton" style={{ height: 14, borderRadius: 6 }} /><div className="skeleton" style={{ height: 14, width: '60%', borderRadius: 6 }} /></div>)}</div>
        ) : items.length ? (
          <>
            <div className="pgrid">{items.map((p, i) => <ProductCard key={p.id} p={p} i={i % PAGE} />)}</div>
            <div ref={sentinel} className="load-more" aria-hidden={!more}>{more ? <span className="spinner" /> : null}</div>
          </>
        ) : (
          <EmptyState title={error ? 'Не удалось загрузить' : searching || city ? 'Ничего не найдено' : 'Товаров пока нет'}
            text={error ? 'Проверьте интернет и попробуйте ещё раз.' : searching || city ? 'Попробуйте другой запрос, раздел или город.' : 'Здесь появятся товары, как только бутики их добавят.'}
            action={(searching || city) && !error ? <button type="button" className="btn btn-secondary press" onClick={() => { setQuery(''); setCat('Для вас'); setFilters(NOFILTER); changeCity(''); }}>Сбросить всё</button> : null} />
        )}
      </section>
      {brandSheet}
      <ToTop />
    </main>
  );
}

// горизонтальная лента с индикаторами страниц
function Strip({ children }) {
  const ref = useRef(null);
  const [pages, setPages] = useState(1), [page, setPage] = useState(0);
  useEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const upd = () => { const w = el.clientWidth || 1; setPages(Math.max(1, Math.ceil((el.scrollWidth - 4) / w))); setPage(Math.round(el.scrollLeft / w)); };
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

// кнопка «Наверх»: появляется, когда пролистали каталог вниз
function ToTop() {
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
