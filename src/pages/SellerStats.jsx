import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/index.js';
import { rub } from '../store/cart.jsx';

const PERIODS = [[7, '7 дней'], [30, '30 дней'], [90, '3 месяца']];

// Статистика бутика: просмотры, избранное, заказы, выручка — по товарам и за период
export default function SellerStats() {
  const [days, setDays] = useState(30);
  const [s, setS] = useState(undefined);
  useEffect(() => { setS(undefined); api.sellerStats(days).then(setS); }, [days]);
  const o = s?.orders || {};
  const max = Math.max(1, ...(s?.days || []).map((d) => d.views));
  const conv = s && s.views ? Math.round(((o.done || 0) + (o.confirmed || 0) + (o.new || 0)) / s.views * 1000) / 10 : 0;
  return (
    <main className="wrap">
      <h1 className="screen-title rise">Статистика</h1>
      <div className="chips">{PERIODS.map(([v, l]) => <button key={v} type="button" className={'chip' + (days === v ? ' on' : '')} onClick={() => setDays(v)}>{l}</button>)}</div>
      {s === undefined ? <div className="skeleton" style={{ height: 200, borderRadius: 16 }} /> : s === null ? <p className="msg">Не удалось загрузить статистику.</p> : <>
        <div className="stat-grid">
          <div className="stat"><b>{rub(o.revenue || 0)}</b><span>выручка (выполненные)</span></div>
          <div className="stat"><b>{o.done || 0}</b><span>выполнено заказов</span></div>
          <div className="stat"><b>{(o.new || 0) + (o.confirmed || 0)}</b><span>в работе</span></div>
          <div className="stat"><b>{o.cancelled || 0}</b><span>отменено</span></div>
          <div className="stat"><b>{s.views}</b><span>просмотров товаров</span></div>
          <div className="stat"><b>{conv}%</b><span>просмотры → заказы</span></div>
        </div>
        {s.days.length > 0 && (
          <section className="bcard">
            <strong>Просмотры по дням</strong>
            <div className="mini-chart" role="img" aria-label="Просмотры по дням">
              {s.days.map((d) => <i key={d.day} style={{ height: Math.max(4, (d.views / max) * 100) + '%' }} title={new Date(d.day).toLocaleDateString('ru-RU') + ': ' + d.views} />)}
            </div>
          </section>
        )}
        <section className="bcard">
          <strong>Товары</strong>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Товар</th><th>Просм.</th><th>В избр.</th><th>Продано</th><th>Выручка</th></tr></thead>
            <tbody>{s.products.map((p) => <tr key={p.id}><td><Link to={'/product/' + p.id}>{p.title}</Link></td><td>{p.views}</td><td>{p.wished}</td><td>{p.sold}</td><td>{rub(p.revenue)}</td></tr>)}</tbody>
          </table></div>
          {!s.products.length && <p className="muted">Добавьте товары — здесь появится их статистика.</p>}
        </section>
        <p className="hint">Просмотры считаются по открытию страницы товара. Выручка — по выполненным заказам.</p>
      </>}
    </main>
  );
}
