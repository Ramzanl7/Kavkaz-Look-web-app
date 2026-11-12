import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import EmptyState from '../components/EmptyState.jsx';
import { Icon } from '../components/Icons.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api/index.js';

// Кабинет продавца: главное — новые заказы, затем товары, статистика и профиль бутика
export default function SellerHome() {
  const { user } = useAuth();
  const [b, setB] = useState(undefined);
  const [orders, setOrders] = useState(null);
  useEffect(() => { if (user) api.getMyBoutique(user.id).then((r) => { setB(r); if (r) api.listSellerOrders(r.id).then(setOrders); }); }, [user]);
  if (b === undefined) return <main className="wrap"><p className="lead">Загрузка…</p></main>;
  if (!b) return <main className="wrap"><EmptyState title="Бутик не найден" text="Обратитесь к администратору." /></main>;
  const fresh = (orders || []).filter((o) => o.status === 'new').length;
  const work = (orders || []).filter((o) => o.status === 'confirmed').length;
  const empty = !b.logo || !b.address || !(b.phone || b.whatsapp || b.telegram);
  const Tile = ({ to, icon, title, sub, badge }) => (
    <Link className="menu-item press" to={to}><span className="menu-ic"><Icon name={icon} /></span><span className="grow"><strong className="block">{title}</strong>{sub && <small className="muted">{sub}</small>}</span>{badge ? <i className="pill-count">{badge}</i> : null}<span className="menu-arrow"><Icon name="chevron" /></span></Link>
  );
  return (
    <main className="wrap">
      <h1 className="screen-title rise">{b.name}</h1>
      <p className="notice">{b.is_approved ? 'Бутик одобрен и виден покупателям.' : 'Бутик ожидает одобрения администратора.'}</p>
      {empty && <Link className="stylist-card press" to="/seller/profile"><span className="grow"><strong className="block">Заполните профиль бутика</strong><small className="muted">Логотип, адрес и контакты повышают доверие покупателей</small></span><Icon name="chevron" /></Link>}
      <div className="menu">
        <Tile to="/seller/orders" icon="box" title="Заказы" sub={orders ? `Новых: ${fresh} · в работе: ${work}` : ''} badge={fresh} />
        <Tile to="/seller/products" icon="catalog" title="Мои товары" sub="Добавить, изменить, остатки" />
        <Tile to="/seller/products/new" icon="star" title="Добавить товар" />
        <Tile to="/seller/stats" icon="chart" title="Статистика" sub="Просмотры, избранное, продажи, выручка" />
        <Tile to="/seller/profile" icon="store" title="Профиль бутика" sub="Логотип, адрес, часы, контакты, доставка" />
        {b.is_approved && <Tile to={'/boutiques/' + b.id} icon="shop" title="Мой бутик глазами покупателя" />}
      </div>
    </main>
  );
}
