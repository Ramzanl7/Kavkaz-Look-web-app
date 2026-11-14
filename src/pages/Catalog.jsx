import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
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

// Разделы каталога: адрес → название в базе
export const SECTIONS = [
  ['women', 'Женское', 'Платья, абайи, костюмы'],
  ['men', 'Мужское', 'Худи, рубашки, брюки'],
  ['national', 'Национальное', 'Черкески, платья, папахи'],
  ['shoes', 'Обувь', 'Туфли, кроссовки, сапоги'],
  ['accessories', 'Аксессуары', 'Платки, сумки, украшения'],
];
const NOFILTER = { minPrice: '', maxPrice: '', size: '', sort: 'new', color: '' };
const isSearching = (q, f) => q.trim() !== '' || !!(f.minPrice || f.maxPrice || f.size || f.color || f.sort !== 'new');

// Каталог: ИИ-стилист → поиск → разделы плитками (с фото товара из раздела) → бутики → подборки.
// Ленты товаров здесь нет — она на главной; товары раздела открываются по нажатию на плитку.
export default function Catalog() {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState(NOFILTER);
  const [city] = useState(cityStore.get);
  const [covers, setCovers] = useState({});
  const [shops, setShops] = useState(null);
  const [colls, setColls] = useState([]);
  const [brands, setBrands] = useState([]);
  const [openBrand, brandSheet] = useOpenBrand();
  const searching = isSearching(query, filters);
  const feed = useFeed({ query, category: '', ...filters, city }, query ? 300 : 0);

  useEffect(() => {
    api.listBoutiques().then(setShops); api.listCollections().then(setColls); api.listLocalBrands().then(setBrands);
    // обложка раздела — фото свежего товара из него
    SECTIONS.forEach(([slug, cat]) => api.listProducts({ category: cat, city }).then((r) => {
      const p = (r || []).find((x) => x.thumb || x.image);
      if (p) setCovers((c) => ({ ...c, [slug]: p.thumb || p.image }));
    }));
  }, [city]);

  return (
    <main className="wrap home catalog-page">
      <h1 className="screen-title rise">Каталог</h1>
      <Link className="stylist-bar press rise" to="/stylist">
        <span className="stylist-ic"><Icon name="sparkles" /></span>
        <span className="grow"><strong>ИИ-стилист</strong><small>Подберём образ под твой бюджет</small></span>
        <svg className="stylist-orn" viewBox={`0 0 ${BELT.w} ${BELT.h}`} aria-hidden="true"><path d={BELT.d} fill="currentColor" /></svg>
        <Icon name="chevron" />
      </Link>
      <SearchBar value={query} onChange={setQuery} filters={filters} onFilters={setFilters}
        onBrand={(id) => openBrand(brands.find((b) => b.id === id))} />

      {searching ? (
        <section className="home-sec" aria-labelledby="res-h">
          <div className="sec-head2"><h2 id="res-h"><Icon name="search" />Результаты</h2>{city && <span className="muted small">{city}</span>}</div>
          <FeedGrid feed={feed} empty={<EmptyState title={feed.error ? 'Не удалось загрузить' : 'Ничего не найдено'} text={feed.error ? 'Проверьте интернет и попробуйте ещё раз.' : 'Попробуйте другой запрос или фильтры.'}
            action={!feed.error ? <button type="button" className="btn btn-secondary press" onClick={() => { setQuery(''); setFilters(NOFILTER); }}>Сбросить</button> : null} />} />
        </section>
      ) : <>
        <section className="home-sec" aria-labelledby="sec-h">
          <div className="sec-head2"><h2 id="sec-h"><Icon name="catalog" />Разделы</h2></div>
          <div className="sec-tiles">
            {SECTIONS.map(([slug, cat, sub], i) => (
              <Link key={slug} to={'/catalog/' + slug} className={'sec-tile press rise' + (i === 0 ? ' big' : '')} style={{ '--d': i }}>
                {covers[slug] ? <img src={covers[slug]} alt="" loading="lazy" decoding="async" /> : <span className="sec-tile-bg" aria-hidden="true" />}
                <span className="sec-tile-shade" aria-hidden="true" />
                <span className="sec-tile-text"><strong>{cat}</strong><small>{sub}</small></span>
              </Link>
            ))}
            <Link to="/catalog/all" className="sec-tile sec-tile-all press rise" style={{ '--d': 5 }}>
              <span className="sec-tile-text"><strong>Все товары</strong><small>Весь ассортимент</small></span><Icon name="arrow" />
            </Link>
          </div>
        </section>

        <section className="home-sec" aria-labelledby="shops-h">
          <div className="sec-head2">
            <h2 id="shops-h"><Icon name="store" />Бутики</h2>
            <Link className="sec-link" to="/boutiques">Все бутики <Icon name="arrow" /></Link>
          </div>
          {shops === null ? <div className="hscroll">{[0, 1, 2].map((n) => <div key={n} className="shop-chip skeleton" />)}</div>
            : shops.length ? (
              <div className="hscroll">
                {shops.map((b) => (
                  <Link key={b.id} to={'/boutiques/' + b.id} className="shop-chip press">
                    <span className="shop-ava">{b.logo ? <img src={b.logo} alt="" loading="lazy" /> : b.name.slice(0, 1).toUpperCase()}</span>
                    <strong>{b.name}</strong>
                    {b.city && <small>{b.city}</small>}
                  </Link>
                ))}
              </div>
            ) : <p className="muted">Бутики скоро появятся.</p>}
        </section>

        <Collections items={colls} />
      </>}
      {brandSheet}
      {searching && <ToTop />}
    </main>
  );
}

// Товары одного раздела: /catalog/women, /catalog/all …
export function CatalogSection() {
  const { slug } = useParams();
  const sec = SECTIONS.find(([s]) => s === slug);
  const title = sec ? sec[1] : 'Все товары';
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState(NOFILTER);
  const [city] = useState(cityStore.get);
  const searching = isSearching(query, filters);
  const feed = useFeed({ query, category: sec ? sec[1] : '', ...filters, city }, query ? 300 : 0);
  return (
    <main className="wrap home">
      <h1 className="screen-title rise">{title}</h1>
      <SearchBar value={query} onChange={setQuery} filters={filters} onFilters={setFilters} />
      <div className="chips cat-chips" aria-label="Разделы">
        <Link to="/catalog/all" replace className={'chip press' + (!sec ? ' on' : '')}>Все</Link>
        {SECTIONS.map(([s, cat]) => <Link key={s} to={'/catalog/' + s} replace className={'chip press' + (s === slug ? ' on' : '')}>{cat}</Link>)}
      </div>
      {city && <p className="muted small" style={{ margin: 0 }}>Город: {city}</p>}
      <FeedGrid feed={feed} empty={
        <EmptyState title={feed.error ? 'Не удалось загрузить' : 'Здесь пока пусто'}
          text={feed.error ? 'Проверьте интернет и попробуйте ещё раз.' : searching ? 'Попробуйте другой запрос или фильтры.' : 'Товары появятся, как только бутики их добавят.'}
          action={searching && !feed.error ? <button type="button" className="btn btn-secondary press" onClick={() => { setQuery(''); setFilters(NOFILTER); }}>Сбросить</button> : null} />
      } />
      <ToTop />
    </main>
  );
}
