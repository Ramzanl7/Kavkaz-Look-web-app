import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icons.jsx';
import { api } from '../api/index.js';
import SiteLink from '../components/SiteLink.jsx';
import { useAction } from '../lib/useAction.js';

// Главная админки: каждая кнопка открывает отдельный экран. Число на кнопке — что ждёт вашего внимания.
export const SECTIONS = [
  ['Люди', [
    ['stats', 'chart', 'Статистика', 'Сколько в сети, заходы, регистрации — без имён'],
    ['users', 'user', 'Пользователи', 'Поиск, блокировка'],
    ['support', 'chat', 'Поддержка — чаты', 'Обращения пользователей и продавцов', 'support'],
    ['support-contacts', 'phone', 'Контакты поддержки', 'Телефон, WhatsApp, Telegram, почта, часы'],
  ]],
  ['Бутики', [
    ['requests', 'mail', 'Заявки', 'С лендинга, на бутик, партнёры', 'requests'],
    ['boutiques', 'store', 'Бутики', 'Одобрить, скрыть, открыть страницу', 'boutiques'],
    ['finance', 'chart', 'Обороты', 'Продажи бутиков и возмещение скидок'],
  ]],
  ['Заказы', [
    ['orders', 'box', 'Все заказы', 'По статусам и бутикам', 'orders'],
    ['unpaid', 'shield', 'Неоплаты', 'Покупатели, не оплатившие доставку', 'unpaid'],
  ]],
  ['Контроль', [
    ['moderation', 'shield', 'Модерация', 'Товары, отзывы, жалобы', 'reports'],
  ]],
  ['Продвижение', [
    ['brands', 'star', 'Реклама брендов', '«Сделано рядом» на главной'],
    ['popular', 'flame', 'Популярное сейчас', 'Продвижение товаров'],
    ['collections', 'sparkles', 'Подборки', 'Тематические подборки на главной'],
    ['promos', 'sparkles', 'Промокоды', 'Промокоды площадки'],
    ['invites', 'send', 'Приглашения', 'Рейтинг пригласивших для розыгрышей'],
    ['broadcast', 'bell', 'Рассылка', 'Уведомление всем или группе'],
  ]],
];

export default function Admin() {
  const [n, setN] = useState({});
  useEffect(() => { api.adminCounters().then(setN); }, []);
  return (
    <main className="wrap">
      <h1 className="screen-title rise">Админ-панель</h1>
      {SECTIONS.map(([group, items], gi) => (
        <section key={group} className="admin-group rise" style={{ '--d': gi }}>
          <h2 className="admin-group-title">{group}</h2>
          <div className="admin-grid">
            {items.map(([key, icon, title, sub, counter]) => (
              <Link key={key} className="admin-tile press" to={'/admin/s/' + key}>
                <span className="menu-ic"><Icon name={icon} /></span>
                <strong>{title}</strong>
                <small>{sub}</small>
                {counter && n[counter] > 0 && <i className="pill-count">{n[counter]}</i>}
              </Link>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}

const CAT = { food: 'Еда', taxi: 'Такси', delivery: 'Доставка', coffee: 'Кофейни' };
// Заявки на открытие бутика (от вошедших пользователей) и заявки партнёров
export function RoleAndPartnerRequests() {
  const [roles, setRoles] = useState([]), [partners, setPartners] = useState([]), [msg, setMsg] = useState('');
  const load = useCallback(async () => {
    const [a, b] = await Promise.all([api.listPendingRoleRequests(), api.listPendingPartnerRequests()]);
    setRoles(a); setPartners(b);
  }, []);
  useEffect(() => { load(); }, [load]);
  const [busy, run] = useAction();
  const act = (fn) => () => run(async () => { setMsg(''); if (await fn()) await load(); else setMsg('Действие не выполнено.'); });
  return <>
    {msg && <p className="msg" role="status">{msg}</p>}
    <div className="sec-head"><h2>Заявки на кабинет продавца</h2></div>
    <p className="hint">Пользователь уже зарегистрирован и просит открыть ему кабинет бутика.</p>
    {roles.length ? roles.map((r) => (
      <div key={r.id} className="bcard"><strong>{r.boutique_name}</strong>
        <div className="acts"><button type="button" className="act ok press" disabled={!!busy} onClick={act(() => api.reviewRoleRequest(r.id, true))}>Одобрить</button><button type="button" className="act danger press" disabled={!!busy} onClick={act(() => api.reviewRoleRequest(r.id, false))}>Отклонить</button></div></div>
    )) : <p className="muted">Новых заявок нет.</p>}
    <div className="sec-head"><h2>Заявки партнёров</h2></div>
    {partners.length ? partners.map((r) => (
      <div key={r.id} className="bcard"><strong>{r.brand_name}</strong><span className="muted">{CAT[r.category]} · {r.contact}</span>
        <div className="acts"><button type="button" className="act ok press" disabled={!!busy} onClick={act(() => api.reviewPartnerRequest(r.id, true))}>Одобрить</button><button type="button" className="act danger press" disabled={!!busy} onClick={act(() => api.reviewPartnerRequest(r.id, false))}>Отклонить</button></div></div>
    )) : <p className="muted">Новых заявок нет.</p>}
  </>;
}

// Бутики: одобрить или скрыть, открыть страницу
export function BoutiquesAdmin() {
  const [list, setList] = useState(null), [msg, setMsg] = useState(''), [q, setQ] = useState('');
  const load = useCallback(() => api.listAllBoutiques().then(setList), []);
  useEffect(() => { load(); }, [load]);
  const [busy, run] = useAction();
  const shown = (list || []).filter((b) => !q || b.name.toLowerCase().includes(q.toLowerCase()));
  return <>
    {msg && <p className="msg" role="status">{msg}</p>}
    <input className="search" type="search" placeholder="Поиск бутика" maxLength={60} value={q} onChange={(e) => setQ(e.target.value)} />
    {list === null ? <p className="lead">Загрузка…</p> : shown.length ? shown.map((b) => (
      <div key={b.id} className="bcard"><strong>{b.name} <span className={b.is_approved ? 'status ok' : 'status'}>{b.is_approved ? 'Одобрен' : 'Скрыт'}</span></strong>
        <div className="acts">
          <button type="button" className={b.is_approved ? 'act press' : 'act ok press'} disabled={!!busy} onClick={() => run(async () => { setMsg(''); if (await api.setBoutiqueApproved(b.id, !b.is_approved)) await load(); else setMsg('Действие не выполнено.'); })}>{b.is_approved ? 'Скрыть' : 'Одобрить'}</button>
          {b.is_approved && <SiteLink className="act press" to={'/boutiques/' + b.id}>Открыть</SiteLink>}
        </div>
      </div>
    )) : <p className="muted">Бутиков нет.</p>}
  </>;
}
