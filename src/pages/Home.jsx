import { useEffect, useState } from 'react';
import { Icon } from '../components/Icons.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ProductCard from '../components/ProductCard.jsx';
import HomeHeader from '../components/home/HomeHeader.jsx';
import SearchBar from '../components/home/SearchBar.jsx';
import LocalBrands, { useOpenBrand } from '../components/home/LocalBrands.jsx';
import { FeedGrid, Strip, ToTop } from '../components/home/Feed.jsx';
import { useFeed } from '../lib/useFeed.js';
import { api } from '../api/index.js';
import { city as cityStore } from '../lib/local.js';

// Главная: шапка с городом → поиск с фильтрами → «Сделано рядом» → «Популярное сейчас» → рекомендации
const NOFILTER = { minPrice: '', maxPrice: '', size: '', sort: 'new', color: '' };

export default function Home() {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState(NOFILTER);
  const [city, setCity] = useState(cityStore.get);
  const [brands, setBrands] = useState([]);
  const [popular, setPopular] = useState(null);
  const [openBrand, brandSheet] = useOpenBrand();
  const searching = query.trim() !== '' || !!(filters.minPrice || filters.maxPrice || filters.size || filters.color || filters.sort !== 'new');
  const feed = useFeed({ query, category: '', ...filters, city }, query ? 300 : 0);

  useEffect(() => { api.listLocalBrands().then(setBrands); api.listPopular().then(setPopular); }, []);

  const toFeed = () => document.getElementById('feed')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const changeCity = (c) => { setCity(c); cityStore.set(c); };
  const reset = () => { setQuery(''); setFilters(NOFILTER); changeCity(''); };

  return (
    <main className="wrap home">
      <HomeHeader city={city} onCity={changeCity} />
      <SearchBar value={query} onChange={setQuery} filters={filters} onFilters={setFilters}
        onBrand={(id) => openBrand(brands.find((b) => b.id === id))} />

      {!searching && <>
        <LocalBrands brands={brands} onOpen={openBrand} />

        {popular && popular.length > 0 && (
          <section className="home-sec" aria-labelledby="pop-h">
            <div className="sec-head2">
              <h2 id="pop-h"><Icon name="flame" />Популярное сейчас</h2>
              <button type="button" className="sec-link" onClick={toFeed}>Ещё <Icon name="arrow" /></button>
            </div>
            <Strip>{popular.map((p, i) => <ProductCard key={p.id} p={p} i={i} variant="compact" wide priority={i < 2} />)}</Strip>
          </section>
        )}
        {popular === null && <div className="hscroll popular">{[0, 1, 2].map((n) => <div key={n} className="pcard pcard-compact"><div className="photo skeleton" style={{ aspectRatio: '4 / 5' }} /></div>)}</div>}
      </>}

      <section className="home-sec" id="feed" aria-labelledby="feed-h">
        <div className="sec-head2">
          <h2 id="feed-h"><Icon name="sparkles" />{searching ? 'Результаты' : 'Рекомендации для вас'}</h2>
          {city && <span className="muted small">{city}</span>}
        </div>
        <FeedGrid feed={feed} empty={
          <EmptyState title={feed.error ? 'Не удалось загрузить' : searching || city ? 'Ничего не найдено' : 'Товаров пока нет'}
            text={feed.error ? 'Проверьте интернет и попробуйте ещё раз.' : searching || city ? 'Попробуйте другой запрос или город.' : 'Здесь появятся товары, как только бутики их добавят.'}
            action={(searching || city) && !feed.error ? <button type="button" className="btn btn-secondary press" onClick={reset}>Сбросить всё</button> : null} />
        } />
      </section>
      {brandSheet}
      <ToTop />
    </main>
  );
}
