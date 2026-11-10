import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/index.js';
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
  const act = (fn) => async () => { setMsg(''); if (await fn()) load(); else setMsg('Действие не выполнено.'); };
  return (
    <main className="wrap">
      <h1 className="screen-title rise">Админ-панель</h1>
      {msg && <p className="msg" role="status">{msg}</p>}
      <div className="sec-head"><h2>Заявки на бутик</h2></div>
      {roles.length ? roles.map((r) => (
        <div key={r.id} className="bcard"><strong>{r.boutique_name}</strong>
          <div className="row"><button type="button" className="link-u" onClick={act(() => api.reviewRoleRequest(r.id, true))}>Одобрить</button><button type="button" className="link-u" onClick={act(() => api.reviewRoleRequest(r.id, false))}>Отклонить</button></div></div>
      )) : <p className="muted">Новых заявок нет.</p>}
      <div className="sec-head"><h2>Заявки партнёров</h2></div>
      {partners.length ? partners.map((r) => (
        <div key={r.id} className="bcard"><strong>{r.brand_name}</strong><span className="muted">{CAT[r.category]} · {r.contact}</span>
          <div className="row"><button type="button" className="link-u" onClick={act(() => api.reviewPartnerRequest(r.id, true))}>Одобрить</button><button type="button" className="link-u" onClick={act(() => api.reviewPartnerRequest(r.id, false))}>Отклонить</button></div></div>
      )) : <p className="muted">Новых заявок нет.</p>}
      <div className="sec-head"><h2>Бутики</h2></div>
      {boutiques.length ? boutiques.map((b) => (
        <div key={b.id} className="bcard"><strong>{b.name}</strong><span className="muted">{b.is_approved ? 'одобрен' : 'скрыт'}</span>
          <div className="row"><button type="button" className="link-u" onClick={act(() => api.setBoutiqueApproved(b.id, !b.is_approved))}>{b.is_approved ? 'Скрыть' : 'Одобрить'}</button></div></div>
      )) : <p className="muted">Бутиков нет.</p>}
    </main>
  );
}
