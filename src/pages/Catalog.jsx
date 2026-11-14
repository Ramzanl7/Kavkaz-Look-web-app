import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icons.jsx';
import EmptyState from '../components/EmptyState.jsx';
import SearchBar from '../components/home/SearchBar.jsx';
import Collections from '../components/home/Collections.jsx';
import { useOpenBrand } from '../components/home/LocalBrands.jsx';
import { FeedGrid, ToTop } from '../components/home/Feed.jsx';
import { useFeed } from '../lib/useFeed.js';
import { api } from '../api/index.js';
import { city as cityStore } from '../lib/local.js';
import { BELT } from '../components/ornamentPaths.js';

// Каталог: поиск → разделы → бутики, ИИ-стилист, подборки → все товары выбранного раздела
const CATS = ['Все', 'Женское', 'Мужское', 'Национальное', 'Обувь', 'Аксессуары'];
const NOFILTER = { minPrice: '', maxPrice: '', size: '', sort: 'new', color: '' };

export default function Catalog() {
  const [cat, setCat] = useState('Все');
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState(NOFILTER);
  const [city] = useState(cityStore.get);
  const [colls, setColls] = useState([]);
  const [brands, setBrands] = useState([]);
  const [openBrand, brandSheet] = useOpenBrand();
  const chipsRef = useRef(null);
  const searching = query.trim() !== '' || !!(filters.minPrice || filters.maxPrice || filters.size || filters.color || filters.sort !== 'new');
  const feed = useFeed({ query, category: cat === 'Все' ? '' : cat, ...filters, city }, query ? 300 : 0);

  useEffect(() => { api.listCollections().then(setColls); api.listLocalBrands().then(setBrands); }, []);

  return (
    <main className="wrap home catalog-page">
      <h1 className="screen-title rise">Каталог</h1>
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

      {!searching && cat === 'Все' && <>
        <Link className="history-link press" to="/boutiques"><Icon name="store" /><span className="grow">Все бутики</span><Icon name="chevron" /></Link>
        <Link className="stylist-bar press" to="/stylist">
          <span className="stylist-ic"><Icon name="sparkles" /></span>
          <span className="grow"><strong>ИИ-стилист</strong><small>Подберём образ под твой бюджет</small></span>
          <svg className="stylist-orn" viewBox={`0 0 ${BELT.w} ${BELT.h}`} aria-hidden="true"><path d={BELT.d} fill="currentColor" /></svg>
          <Icon name="chevron" />
        </Link>
        <Collections items={colls} />
      </>}

      <section className="home-sec" aria-labelledby="cat-h">
        <div className="sec-head2">
          <h2 id="cat-h"><Icon name="catalog" />{searching ? 'Результаты' : cat === 'Все' ? 'Все товары' : cat}</h2>
          {city && <span className="muted small">{city}</span>}
        </div>
        <FeedGrid feed={feed} empty={
          <EmptyState title={feed.error ? 'Не удалось загрузить' : 'Ничего не найдено'}
            text={feed.error ? 'Проверьте интернет и попробуйте ещё раз.' : 'Попробуйте другой запрос или раздел.'}
            action={(searching || cat !== 'Все') && !feed.error ? <button type="button" className="btn btn-secondary press" onClick={() => { setQuery(''); setCat('Все'); setFilters(NOFILTER); }}>Сбросить</button> : null} />
        } />
      </section>
      {brandSheet}
      <ToTop />
    </main>
  );
}
