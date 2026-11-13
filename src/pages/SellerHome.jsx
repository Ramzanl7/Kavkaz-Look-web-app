import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import EmptyState from '../components/EmptyState.jsx';
import { Icon } from '../components/Icons.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api/index.js';

// Кабинет продавца: каждая кнопка — отдельный экран, число на кнопке — что ждёт внимания
export default function SellerHome() {
  const { user } = useAuth();
  const [b, setB] = useState(undefined);
  const [orders, setOrders] = useState(null), [reviews, setReviews] = useState(null), [support, setSupport] = useState(0);
  useEffect(() => {
    if (!user) return;
    api.getMyBoutique(user.id).then((r) => { setB(r); if (r) api.listSellerOrders(r.id).then(setOrders); });
    api.sellerReviews().then(setReviews);
    api.supportUnread().then(setSupport);
  }, [user]);
  if (b === undefined) return <main className="wrap"><p className="lead">Загрузка…</p></main>;
  if (!b) return <main className="wrap"><EmptyState title="Бутик не найден" text="Обратитесь к администратору." /></main>;
  const fresh = (orders || []).filter((o) => o.status === 'new').length;
  const work = (orders || []).filter((o) => o.status === 'confirmed').length;
  const noReply = (reviews || []).filter((r) => !r.reply).length;
  const empty = !b.logo || !b.address || !(b.phone || b.whatsapp || b.telegram);
  const groups = [
    ['Продажи', [
      ['/seller/orders', 'box', 'Заказы', orders ? `Новых: ${fresh} · в работе: ${work}` : 'Принять, отметить проблему', fresh],
      ['/seller/reviews', 'star', 'Отзывы', reviews ? (noReply ? `Без ответа: ${noReply}` : 'Ответьте покупателям') : 'Ответьте покупателям', noReply],
      ['/seller/stats', 'chart', 'Статистика', 'Просмотры, избранное, продажи, выручка'],
    ]],
    ['Товары', [
      ['/seller/products', 'catalog', 'Мои товары', 'Изменить, остатки, снять с продажи'],
      ['/seller/products/new', 'bag', 'Добавить товар', 'Фото, цена, размеры'],
      ['/seller/promos', 'sparkles', 'Промокоды', 'Скидки для ваших покупателей'],
    ]],
    ['Бутик', [
      ['/seller/profile', 'store', 'Профиль бутика', 'Логотип, адрес, часы, контакты, доставка'],
      ['/seller/payments', 'shield', 'Оплата и приём заказов', 'Способы оплаты, СБП, автоприём'],
      ...(b.is_approved ? [['/boutiques/' + b.id, 'shop', 'Мой бутик глазами покупателя', 'Как вас видят в приложении']] : []),
    ]],
    ['Помощь', [
      ['/support/chat', 'chat', 'Поддержка', support ? `Новых ответов: ${support}` : 'Чат с администрацией', support],
      ['/seller/help', 'sliders', 'Как продавать', 'Первые шаги и частые вопросы'],
    ]],
  ];
  return (
    <main className="wrap">
      <h1 className="screen-title rise">{b.name}</h1>
      <p className="notice">{b.is_approved ? 'Бутик одобрен и виден покупателям.' : 'Бутик ожидает одобрения администратора.'}</p>
      {empty && <Link className="stylist-card press" to="/seller/profile"><span className="grow"><strong className="block">Заполните профиль бутика</strong><small className="muted">Логотип, адрес и контакты повышают доверие покупателей</small></span><Icon name="chevron" /></Link>}
      {groups.map(([g, items], gi) => (
        <section key={g} className="admin-group rise" style={{ '--d': gi }}>
          <h2 className="admin-group-title">{g}</h2>
          <div className="admin-grid">
            {items.map(([to, icon, title, sub, badge]) => (
              <Link key={to} className="admin-tile press" to={to}>
                <span className="menu-ic"><Icon name={icon} /></span>
                <strong>{title}</strong>
                <small>{sub}</small>
                {badge > 0 && <i className="pill-count">{badge}</i>}
              </Link>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
