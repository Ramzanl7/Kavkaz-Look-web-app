import { useEffect, useState } from 'react';
import { Icon } from '../components/Icons.jsx';
import { Link } from 'react-router-dom';
import EmptyState from '../components/EmptyState.jsx';
import ProductCard from '../components/ProductCard.jsx';
import { api } from '../api/index.js';
const chips = ['Всё', 'Женское', 'Мужское', 'Национальное', 'Обувь', 'Аксессуары'];
const nearby = [['food', 'Еда'], ['taxi', 'Такси'], ['delivery', 'Доставка'], ['coffee', 'Кофейни']];
const sorts = [['new', 'Новинки'], ['price_asc', 'Сначала дешёвые'], ['price_desc', 'Сначала дорогие'], ['rating', 'По рейтингу']];
export default function Catalog() {
  const [active, setActive] = useState('Всё');
  const [sort, setSort] = useState('new');
  const [query, setQuery] = useState('');
  const opts = { query, category: active === 'Всё' ? '' : active, sort };
  const [products, setProducts] = useState(() => api.peekList({ query: '', category: '', boutiqueId: '', sort: 'new' }));
  useEffect(() => {
    let on = true;
    const cached = api.peekList({ ...opts, boutiqueId: '' });
    if (cached) setProducts(cached);
    const t = setTimeout(() => { api.listProducts(opts).then((r) => on && setProducts(r)); }, query ? 300 : 0);
    return () => { on = false; clearTimeout(t); };
  }, [query, active, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const filtered = query.trim() !== '' || active !== 'Всё';
  return (
    <main className="wrap">
      <div className="topbar rise"><span className="wordmark wordmark-sans">Kavkaz <span>Look</span></span><span className="pill">ЧР | Грозный</span></div>
      <input className="search rise" style={{ '--d': 1 }} type="search" aria-label="Поиск" placeholder="Найти одежду, бутик или бренд" value={query} onChange={(e) => setQuery(e.target.value)} maxLength={80} />
      <div className="chips rise" style={{ '--d': 2 }}>
        {chips.map((c) => (
          <button key={c} type="button" className={'chip press' + (c === 'Национальное' ? ' nat' : '') + (c === active ? ' on' : '')} onClick={() => setActive(c)}>{c}</button>
        ))}
      </div>
      <Link className="stylist-card press" to="/stylist">
        <span className="menu-ic"><Icon name="star" /></span>
        <span className="grow"><strong className="block">ИИ-стилист</strong><small className="muted">Опишите повод и бюджет — подберём образ</small></span>
        <Icon name="chevron" />
      </Link>
      <div className="sec-head"><h2>Популярное сейчас</h2>
        <select className="sort" aria-label="Сортировка" value={sort} onChange={(e) => setSort(e.target.value)}>{sorts.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select>
      </div>
      {products === null ? (
        <div className="pgrid">{[0, 1, 2, 3].map((n) => <div key={n} className="pcard"><div className="photo skeleton" style={{ aspectRatio: '4 / 5' }} /><div className="skeleton" style={{ height: 14, borderRadius: 6 }} /><div className="skeleton" style={{ height: 14, width: '60%', borderRadius: 6 }} /></div>)}</div>
      ) : products.length ? (
        <div className="pgrid">{products.map((p, i) => <ProductCard key={p.id} p={p} i={i} />)}</div>
      ) : (
        <EmptyState title={filtered ? 'Ничего не найдено' : 'Товаров пока нет'} text={filtered ? 'Попробуйте другой запрос или раздел.' : 'Здесь появятся товары, как только бутики их добавят.'} />
      )}
      <div className="sec-head"><h2>Сделано рядом</h2></div>
      <p className="lead">Наши чеченские бренды и сервисы.</p>
      <div className="nearby">
        {nearby.map(([slug, name]) => <Link key={slug} className="tile press" to={'/nearby/' + slug}>{name}</Link>)}
      </div>
      <Link className="link-u" to="/partners" style={{ justifySelf: 'start' }}>Стать партнёром</Link>
    </main>
  );
}
