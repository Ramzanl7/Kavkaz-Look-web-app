import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icons.jsx';
import { api } from '../api/index.js';
import SupportEditor from '../components/SupportEditor.jsx';
import { useAction } from '../lib/useAction.js';
const CAT = { food: 'Еда', taxi: 'Такси', delivery: 'Доставка', coffee: 'Кофейни' };
export default function Admin() {
  const [roles, setRoles] = useState([]);
  const [partners, setPartners] = useState([]);
  const [boutiques, setBoutiques] = useState([]);
  const [msg, setMsg] = useState('');
  const load = useCallback(async () => {
    const [a, b, c] = await Promise.all([api.listPendingRoleRequests(), api.listPendingPartnerRequests(), api.listAllBoutiques()]);
    setRoles(a); setPartners(b); setBoutiques(c);
  }, []);
  useEffect(() => { load(); }, [load]);
  const [busy, run] = useAction();
  const act = (fn) => () => run(async () => { setMsg(''); if (await fn()) await load(); else setMsg('Действие не выполнено.'); });
  return (
    <main className="wrap">
      <h1 className="screen-title rise">Админ-панель</h1>
      <Link className="admin-card press rise" to="/admin/stats">
        <span className="menu-ic"><Icon name="chart" /></span>
        <span className="grow"><strong>Статистика и пользователи</strong><small>Посещения, кто был в сети, блокировка</small></span>
        <Icon name="chevron" />
      </Link>
      <Link className="admin-card press rise" to="/admin/tools">
        <span className="menu-ic"><Icon name="shield" /></span>
        <span className="grow"><strong>Модерация и управление</strong><small>Товары, отзывы, жалобы, все заказы, рассылка, обороты бутиков</small></span>
        <Icon name="chevron" />
      </Link>
      <Link className="admin-card press rise" to="/admin/promo">
        <span className="menu-ic"><Icon name="star" /></span>
        <span className="grow"><strong>Реклама на главной</strong><small>«Сделано рядом» и «Популярное сейчас»: баннеры, сроки, ссылки</small></span>
        <Icon name="chevron" />
      </Link>
      {msg && <p className="msg" role="status">{msg}</p>}
      <div className="sec-head"><h2>Заявки на бутик</h2></div>
      {roles.length ? roles.map((r) => (
        <div key={r.id} className="bcard"><strong>{r.boutique_name}</strong>
          <div className="acts"><button type="button" className="act ok press" disabled={!!busy} onClick={act(() => api.reviewRoleRequest(r.id, true))}>Одобрить</button><button type="button" className="act danger press" disabled={!!busy} onClick={act(() => api.reviewRoleRequest(r.id, false))}>Отклонить</button></div></div>
      )) : <p className="muted">Новых заявок нет.</p>}
      <div className="sec-head"><h2>Заявки партнёров</h2></div>
      {partners.length ? partners.map((r) => (
        <div key={r.id} className="bcard"><strong>{r.brand_name}</strong><span className="muted">{CAT[r.category]} · {r.contact}</span>
          <div className="acts"><button type="button" className="act ok press" disabled={!!busy} onClick={act(() => api.reviewPartnerRequest(r.id, true))}>Одобрить</button><button type="button" className="act danger press" disabled={!!busy} onClick={act(() => api.reviewPartnerRequest(r.id, false))}>Отклонить</button></div></div>
      )) : <p className="muted">Новых заявок нет.</p>}
      <div className="sec-head"><h2>Бутики</h2></div>
      {boutiques.length ? boutiques.map((b) => (
        <div key={b.id} className="bcard"><strong>{b.name}</strong><span className={b.is_approved ? 'status ok' : 'status'}>{b.is_approved ? 'Одобрен' : 'Скрыт'}</span>
          <div className="acts"><button type="button" className={b.is_approved ? 'act press' : 'act ok press'} disabled={!!busy} onClick={act(() => api.setBoutiqueApproved(b.id, !b.is_approved))}>{b.is_approved ? 'Скрыть' : 'Одобрить'}</button></div></div>
      )) : <p className="muted">Бутиков нет.</p>}
      <div className="sec-head"><h2>Контакты поддержки</h2></div>
      <SupportEditor />
    </main>
  );
}
