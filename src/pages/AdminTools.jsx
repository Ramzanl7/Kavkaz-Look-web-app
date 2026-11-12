import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/index.js';
import { useAction } from '../lib/useAction.js';
import { useToast } from '../store/toast.jsx';
import { rub } from '../store/cart.jsx';
import { STATUS } from './Orders.jsx';
import PromoManager from '../components/PromoManager.jsx';

const TABS = [['leads', 'Заявки бутиков'], ['collections', 'Подборки'], ['products', 'Товары'], ['reviews', 'Отзывы'], ['reports', 'Жалобы'], ['orders', 'Заказы'], ['broadcast', 'Рассылка'], ['promos', 'Промокоды'], ['invites', 'Приглашения'], ['finance', 'Обороты']];
const REASON = { fake: 'Подделка/обман', prohibited: 'Запрещённый товар', offensive: 'Оскорбления', fraud: 'Мошенничество', other: 'Другое' };
const TARGET = { product: 'Товар', review: 'Отзыв', boutique: 'Бутик' };

// Модерация и управление платформой (только администратор)
export default function AdminTools() {
  const [tab, setTab] = useState(() => { const q = new URLSearchParams(location.search).get('tab'); if (q && TABS.some(([v]) => v === q)) return q; try { return sessionStorage.getItem('kl-admin-tab') || 'leads'; } catch { return 'leads'; } });
  const pick = (t) => { setTab(t); try { sessionStorage.setItem('kl-admin-tab', t); } catch { /* приватный режим */ } };
  return (
    <main className="wrap">
      <h1 className="screen-title rise">Модерация</h1>
      <div className="chips">{TABS.map(([v, l]) => <button key={v} type="button" className={'chip' + (tab === v ? ' on' : '')} onClick={() => pick(v)}>{l}</button>)}</div>
      {tab === 'leads' && <Leads />}
      {tab === 'collections' && <CollectionsAdmin />}
      {tab === 'products' && <Products />}
      {tab === 'reviews' && <Reviews />}
      {tab === 'reports' && <Reports />}
      {tab === 'orders' && <Orders />}
      {tab === 'broadcast' && <Broadcast />}
      {tab === 'promos' && <PromoManager />}
      {tab === 'invites' && <Invites />}
      {tab === 'finance' && <Finance />}
    </main>
  );
}

function Products() {
  const [q, setQ] = useState(''), [onlyBlocked, setOnly] = useState(false), [list, setList] = useState(null);
  const [busy, run] = useAction(); const toast = useToast();
  const load = useCallback(() => api.adminListProducts({ query: q, blocked: onlyBlocked }).then(setList), [q, onlyBlocked]);
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);
  const mod = (p, block) => run(async () => {
    let reason = null;
    if (block) { reason = window.prompt('Причина (её увидит продавец):', 'Не соответствует правилам площадки'); if (reason === null) return; }
    if (await api.adminModerateProduct(p.id, block, reason)) { toast(block ? 'Товар скрыт, продавец уведомлён' : 'Товар возвращён'); load(); } else toast('Не удалось');
  }, p.id);
  return <>
    <input className="search" type="search" placeholder="Поиск по названию" value={q} onChange={(e) => setQ(e.target.value)} />
    <label className="check"><input type="checkbox" checked={onlyBlocked} onChange={(e) => setOnly(e.target.checked)} /> Только скрытые модератором</label>
    {list === null ? <p className="lead">Загрузка…</p> : list.length ? list.map((p) => (
      <div key={p.id} className="bcard seller-item">
        {p.thumb ? <img className="seller-thumb" src={p.thumb} alt="" loading="lazy" /> : <span className="seller-thumb" />}
        <div className="grow">
          <Link to={'/product/' + p.id}><strong>{p.title}</strong></Link>
          <span className="muted block small">{p.boutique?.name} · {rub(p.price_rub)} · {p.is_published ? 'опубликован' : 'скрыт продавцом'}</span>
          {p.moderation === 'blocked' && <span className="msg block">Скрыт модератором{p.moderation_reason ? ': ' + p.moderation_reason : ''}</span>}
        </div>
        <div className="acts">{p.moderation === 'blocked'
          ? <button type="button" className="act ok press" disabled={busy === p.id} onClick={() => mod(p, false)}>Вернуть</button>
          : <button type="button" className="act danger press" disabled={busy === p.id} onClick={() => mod(p, true)}>Скрыть</button>}</div>
      </div>
    )) : <p className="muted">Ничего не найдено.</p>}
  </>;
}

function Reviews() {
  const [hidden, setHidden] = useState(false), [list, setList] = useState(null);
  const [busy, run] = useAction();
  const load = useCallback(() => api.adminListReviews(hidden).then(setList), [hidden]);
  useEffect(() => { load(); }, [load]);
  return <>
    <label className="check"><input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} /> Только скрытые</label>
    {list === null ? <p className="lead">Загрузка…</p> : list.length ? list.map((r) => (
      <div key={r.id} className="bcard">
        <span className="stars">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)} <span className="muted small">{r.author_name} · {new Date(r.created_at).toLocaleDateString('ru-RU')}</span></span>
        {r.product && <Link className="small" to={'/product/' + r.product.id}>{r.product.title}</Link>}
        {r.body && <span>{r.body}</span>}
        <div className="acts"><button type="button" className={'act press' + (r.hidden ? ' ok' : ' danger')} disabled={busy === r.id}
          onClick={() => run(async () => { if (await api.adminHideReview(r.id, !r.hidden)) load(); }, r.id)}>{r.hidden ? 'Показать' : 'Скрыть'}</button></div>
      </div>
    )) : <p className="muted">Отзывов нет.</p>}
  </>;
}

function Reports() {
  const [status, setStatus] = useState('open'), [list, setList] = useState(null);
  const [busy, run] = useAction();
  const load = useCallback(() => api.adminListReports(status).then(setList), [status]);
  useEffect(() => { load(); }, [load]);
  const link = (r) => (r.target_type === 'product' ? '/product/' + r.target_id : r.target_type === 'boutique' ? '/boutiques/' + r.target_id : null);
  return <>
    <div className="chips">{[['open', 'Новые'], ['resolved', 'Решённые'], ['rejected', 'Отклонённые']].map(([v, l]) => <button key={v} type="button" className={'chip' + (status === v ? ' on' : '')} onClick={() => setStatus(v)}>{l}</button>)}</div>
    {list === null ? <p className="lead">Загрузка…</p> : list.length ? list.map((r) => (
      <div key={r.id} className="bcard">
        <strong>{TARGET[r.target_type]} · {REASON[r.reason]}</strong>
        <span className="muted small">{new Date(r.created_at).toLocaleString('ru-RU')}</span>
        {r.body && <span>«{r.body}»</span>}
        {link(r) ? <Link className="link-u" to={link(r)}>Открыть</Link> : <span className="muted small">Отзыв — найдите во вкладке «Отзывы»</span>}
        {status === 'open' && <div className="acts">
          <button type="button" className="act ok press" disabled={busy === r.id} onClick={() => run(async () => { if (await api.adminResolveReport(r.id, 'resolved')) load(); }, r.id)}>Меры приняты</button>
          <button type="button" className="act press" disabled={busy === r.id} onClick={() => run(async () => { if (await api.adminResolveReport(r.id, 'rejected')) load(); }, r.id)}>Отклонить</button>
        </div>}
      </div>
    )) : <p className="muted">Жалоб нет.</p>}
  </>;
}

function Orders() {
  const [status, setStatus] = useState(''), [list, setList] = useState(null);
  const [busy, run] = useAction(); const toast = useToast();
  const load = useCallback(() => api.adminListOrders(status).then(setList), [status]);
  useEffect(() => { load(); }, [load]);
  const set = (o, st) => run(async () => { if (!window.confirm(`Перевести заказ в «${STATUS[st]}»?`)) return; if (await api.setOrderStatus(o.id, st)) load(); else toast('Не удалось'); }, o.id);
  return <>
    <div className="chips">{[['', 'Все'], ['new', 'Новые'], ['confirmed', 'Подтверждённые'], ['done', 'Выполненные'], ['cancelled', 'Отменённые']].map(([v, l]) => <button key={v} type="button" className={'chip' + (status === v ? ' on' : '')} onClick={() => setStatus(v)}>{l}</button>)}</div>
    {list === null ? <p className="lead">Загрузка…</p> : list.length ? list.map((o) => (
      <div key={o.id} className="bcard">
        <strong>№ {o.id.slice(0, 8)} · {STATUS[o.status]} · {rub(o.total_rub)}</strong>
        <span className="muted small">{o.boutique?.name || 'Без бутика'} · {new Date(o.created_at).toLocaleString('ru-RU')}</span>
        <span className="small">{o.items.map((i) => `${i.title}${i.size ? ' (' + i.size + ')' : ''} × ${i.qty}`).join(', ')}</span>
        {['new', 'confirmed'].includes(o.status) && <div className="acts">
          {o.status === 'new' && <button type="button" className="act ok press" disabled={busy === o.id} onClick={() => set(o, 'confirmed')}>Подтвердить</button>}
          <button type="button" className="act ok press" disabled={busy === o.id} onClick={() => set(o, 'done')}>Выполнен</button>
          <button type="button" className="act danger press" disabled={busy === o.id} onClick={() => set(o, 'cancelled')}>Отменить</button>
        </div>}
      </div>
    )) : <p className="muted">Заказов нет.</p>}
  </>;
}

function Broadcast() {
  const [f, setF] = useState({ title: '', body: '', audience: 'all', link: '/catalog' });
  const [busy, run] = useAction(); const toast = useToast();
  const send = (e) => { e.preventDefault(); return run(async () => {
    if (!window.confirm('Отправить уведомление получателям: ' + { all: 'всем', buyers: 'покупателям', sellers: 'продавцам' }[f.audience] + '?')) return;
    const n = await api.adminBroadcast(f.title, f.body, f.audience, f.link);
    if (n === null) toast('Не удалось отправить'); else { toast(`Отправлено: ${n}`); setF({ ...f, title: '', body: '' }); }
  }); };
  return (
    <form className="form" onSubmit={send}>
      <div className="seg">{[['all', 'Всем'], ['buyers', 'Покупателям'], ['sellers', 'Продавцам']].map(([v, l]) => <button key={v} type="button" className={'chip' + (f.audience === v ? ' on' : '')} onClick={() => setF({ ...f, audience: v })}>{l}</button>)}</div>
      <div className="field"><label htmlFor="bt">Заголовок</label><input id="bt" maxLength={120} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Скидки к Ураза-Байраму" /></div>
      <div className="field"><label htmlFor="bb">Текст</label><textarea id="bb" rows={3} maxLength={300} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></div>
      <div className="field"><label htmlFor="bl">Куда ведёт уведомление</label><input id="bl" maxLength={80} value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} placeholder="/catalog" /></div>
      <p className="hint">Придёт в «Уведомления» и пушем тем, у кого они включены. Не чаще 5 рассылок в час.</p>
      <button className="btn btn-primary press" type="submit" disabled={!!busy || f.title.trim().length < 2}>{busy ? 'Отправляем…' : 'Отправить'}</button>
    </form>
  );
}

const LEAD_ST = { new: 'Новая', contacted: 'Связались', done: 'Подключён', rejected: 'Отказ' };
function Leads() {
  const [list, setList] = useState(null), [f, setF] = useState('new');
  const [busy, run] = useAction();
  const load = () => api.adminListLeads().then(setList);
  useEffect(() => { load(); }, []);
  const wa = (ph) => { const d = String(ph).replace(/\D/g, ''); return d.length === 11 && d[0] === '8' ? '7' + d.slice(1) : d; };
  const shown = (list || []).filter((l) => f === 'all' || l.status === f);
  return <>
    <p className="hint">Заявки с лендинга <Link className="link-u" to="/sell">/sell</Link> — ссылку можно отправлять владельцам бутиков. Позвоните, помогите зарегистрироваться и одобрите бутик в «Заявках на бутик» на панели администратора.</p>
    <div className="chips">{[['new', 'Новые'], ['contacted', 'Связались'], ['done', 'Подключены'], ['rejected', 'Отказ'], ['all', 'Все']].map(([v, l]) => <button key={v} type="button" className={'chip' + (f === v ? ' on' : '')} onClick={() => setF(v)}>{l}{v === 'new' && list ? ` · ${list.filter((x) => x.status === 'new').length}` : ''}</button>)}</div>
    {list === null ? <p className="lead">Загрузка…</p> : shown.length ? shown.map((l) => (
      <div key={l.id} className="bcard">
        <strong>{l.boutique_name} <span className={'status' + (l.status === 'done' ? ' ok' : '')}>{LEAD_ST[l.status]}</span></strong>
        <span className="small">{[l.contact_name, l.city, l.categories?.join(', ')].filter(Boolean).join(' · ')}</span>
        {l.instagram && <a className="link-u small" href={'https://instagram.com/' + l.instagram} target="_blank" rel="noopener noreferrer">@{l.instagram}</a>}
        {l.comment && <span className="muted small">«{l.comment}»</span>}
        <span className="muted small">{new Date(l.created_at).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}{l.user_id ? ' · есть аккаунт' : ''}</span>
        <div className="acts">
          <a className="act ok press" href={'tel:' + l.phone}>Позвонить</a>
          <a className="act press" href={'https://wa.me/' + wa(l.phone) + '?text=' + encodeURIComponent('Здравствуйте! Это Kavkaz Look, вы оставили заявку на подключение бутика «' + l.boutique_name + '».')} target="_blank" rel="noopener noreferrer">WhatsApp</a>
          <select className="lead-status" aria-label="Статус заявки" value={l.status} disabled={!!busy} onChange={(e) => run(async () => { if (await api.adminSetLead(l.id, { status: e.target.value })) load(); })}>
            {Object.entries(LEAD_ST).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </div>
      </div>
    )) : <p className="muted">{f === 'new' ? 'Новых заявок нет. Отправьте владельцам бутиков ссылку на /sell.' : 'Пусто.'}</p>}
  </>;
}

function Invites() {
  const [list, setList] = useState(null);
  useEffect(() => { api.adminReferralTop().then(setList); }, []);
  return list === null ? <p className="lead">Загрузка…</p> : <>
    <p className="hint">Кто больше всех пригласил друзей. «С покупкой» — друзья, у которых есть выполненный заказ: по этому числу честнее разыгрывать призы.</p>
    {list.length ? <div className="tbl-wrap"><table className="tbl">
      <thead><tr><th>#</th><th>Пользователь</th><th>Пригласил</th><th>С покупкой</th></tr></thead>
      <tbody>{list.map((r, i) => <tr key={r.user_id}><td>{i + 1}</td><td>{r.name || '—'}<br /><small className="muted">{r.email}</small></td><td>{r.invited}</td><td><b>{r.qualified}</b></td></tr>)}</tbody>
    </table></div> : <p className="muted">Пока никто никого не пригласил.</p>}
  </>;
}

function Finance() {
  const [days, setDays] = useState(30), [list, setList] = useState(null);
  useEffect(() => { setList(null); api.adminFinance(days).then(setList); }, [days]);
  const sum = (list || []).reduce((a, r) => a + r.revenue, 0);
  return <>
    <div className="chips">{[[7, '7 дней'], [30, '30 дней'], [90, '3 месяца']].map(([v, l]) => <button key={v} type="button" className={'chip' + (days === v ? ' on' : '')} onClick={() => setDays(v)}>{l}</button>)}</div>
    {list === null ? <p className="lead">Загрузка…</p> : <>
      <div className="stat-grid"><div className="stat"><b>{rub(sum)}</b><span>оборот площадки (выполненные)</span></div><div className="stat"><b>{list.reduce((a, r) => a + r.done, 0)}</b><span>выполнено заказов</span></div></div>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>Бутик</th><th>Выполн.</th><th>Оборот</th><th>В работе</th><th>Отмен.</th><th>Реклама</th><th>К возмещению</th></tr></thead>
        <tbody>{list.map((r) => <tr key={r.id}><td>{r.name}</td><td>{r.done}</td><td>{rub(r.revenue)}</td><td>{r.active}</td><td>{r.cancelled}</td><td>{r.promos}</td><td>{r.owed ? rub(r.owed) : '—'}</td></tr>)}</tbody>
      </table></div>
      {list.some((r) => r.owed) && <p className="hint">«К возмещению» — скидки по промокодам площадки в выполненных заказах: эти деньги площадка должна бутику.</p>}
      <p className="hint">Комиссию площадки пока не считаем — когда решите её размер, добавлю расчёт «к оплате бутиком».</p>
    </>}
  </>;
}

const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
function CollectionsAdmin() {
  const [list, setList] = useState(null), [ed, setEd] = useState(null), [cover, setCover] = useState(null);
  const [q, setQ] = useState(''), [found, setFound] = useState([]);
  const [busy, run] = useAction(); const toast = useToast();
  const load = () => api.adminListCollections().then(setList);
  useEffect(() => { load(); }, []);
  useEffect(() => { if (ed) { const t = setTimeout(() => api.adminFindProducts(q).then(setFound), 250); return () => clearTimeout(t); } return undefined; }, [q, !!ed]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = (c) => { setCover(null); setQ(''); setEd(c ? { ...c, starts_at: day(c.starts_at), ends_at: day(c.ends_at), picked: (c.items || []).sort((a, b) => a.sort - b.sort).map((i) => ({ id: i.product_id, title: i.product?.title || 'Товар' })) } : { title: '', subtitle: '', is_published: true, sort: 0, starts_at: day(new Date()), ends_at: '', picked: [] }); };
  const toggle = (p) => setEd((e) => ({ ...e, picked: e.picked.some((x) => x.id === p.id) ? e.picked.filter((x) => x.id !== p.id) : [...e.picked, { id: p.id, title: p.title }] }));
  const save = () => run(async () => {
    const r = await api.adminSaveCollection({ ...ed, productIds: ed.picked.map((x) => x.id) }, cover);
    if (r.error) { toast(r.error); return; }
    toast('Подборка сохранена'); setEd(null); load();
  });
  return <>
    <button type="button" className="btn btn-primary press" onClick={() => open(null)}>Новая подборка</button>
    <p className="hint">Подборки показываются на главной после «Популярного». Например: «К Ураза-Байраму», «Свадебный сезон», «Школьная форма».</p>
    {list === null ? <p className="lead">Загрузка…</p> : list.length ? list.map((c) => (
      <div key={c.id} className="bcard promo-row">
        {c.cover ? <img src={c.cover} alt="" /> : <span className="promo-thumb" />}
        <div className="grow"><strong>{c.title}</strong><small className="muted block">{c.is_published ? 'Опубликована' : 'Черновик'} · товаров: {c.items?.length || 0}{c.ends_at ? ' · до ' + day(c.ends_at) : ''}</small></div>
        <div className="acts">
          <button type="button" className="act press" onClick={() => open(c)}>Изменить</button>
          <button type="button" className="act danger press" disabled={!!busy} onClick={() => run(async () => { if (window.confirm('Удалить подборку «' + c.title + '»?') && (await api.adminDeleteCollection(c.id))) load(); })}>Удалить</button>
        </div>
      </div>
    )) : <p className="muted">Подборок пока нет.</p>}
    {ed && (
      <div className="sheet-bg" onClick={() => setEd(null)}>
        <div className="sheet form" role="dialog" aria-modal="true" aria-labelledby="col-t" onClick={(e) => e.stopPropagation()}>
          <h2 id="col-t">{ed.id ? 'Подборка' : 'Новая подборка'}</h2>
          <div className="field"><label htmlFor="ct">Название</label><input id="ct" maxLength={60} value={ed.title} onChange={(e) => setEd({ ...ed, title: e.target.value })} placeholder="К Ураза-Байраму" /></div>
          <div className="field"><label htmlFor="cs">Подзаголовок</label><input id="cs" maxLength={120} value={ed.subtitle || ''} onChange={(e) => setEd({ ...ed, subtitle: e.target.value })} placeholder="Нарядное для всей семьи" /></div>
          <div className="field"><label htmlFor="cc">Обложка (широкое фото)</label><input id="cc" type="file" accept="image/*" onChange={(e) => setCover(e.target.files?.[0] || null)} /></div>
          <div className="row">
            <div className="field"><label htmlFor="c1">Начало</label><input id="c1" type="date" value={ed.starts_at} onChange={(e) => setEd({ ...ed, starts_at: e.target.value })} /></div>
            <div className="field"><label htmlFor="c2">Окончание</label><input id="c2" type="date" value={ed.ends_at || ''} onChange={(e) => setEd({ ...ed, ends_at: e.target.value })} /></div>
          </div>
          <label className="check"><input type="checkbox" checked={ed.is_published} onChange={(e) => setEd({ ...ed, is_published: e.target.checked })} /> Опубликовать</label>
          <span className="muted">Товары в подборке: {ed.picked.length}</span>
          {ed.picked.length > 0 && <div className="chips wrapchips">{ed.picked.map((x) => <button key={x.id} type="button" className="chip on" onClick={() => toggle(x)}>{x.title} ✕</button>)}</div>}
          <div className="field"><label htmlFor="cq">Добавить товары</label><input id="cq" placeholder="Поиск по названию" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="pick-list">{found.map((x) => (
            <button key={x.id} type="button" className={'drop-item' + (ed.picked.some((p) => p.id === x.id) ? ' on' : '')} onClick={() => toggle(x)}>
              <span className="grow">{x.title} <small className="muted">· {x.boutique?.name}</small></span><b>{rub(x.price_rub)}</b>
            </button>
          ))}</div>
          <button type="button" className="btn btn-primary press" disabled={!!busy} onClick={save}>{busy ? 'Сохраняем…' : 'Сохранить'}</button>
        </div>
      </div>
    )}
  </>;
}
