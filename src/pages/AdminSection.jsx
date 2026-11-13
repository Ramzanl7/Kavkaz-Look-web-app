import { useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import AdminStats from './AdminStats.jsx';
import AdminPromo from './AdminPromo.jsx';
import PromoManager from '../components/PromoManager.jsx';
import SupportEditor from '../components/SupportEditor.jsx';
import AdminSupport from '../components/AdminSupport.jsx';
import { RoleAndPartnerRequests, BoutiquesAdmin } from './Admin.jsx';
import { Products, Reviews, Reports, Orders, Broadcast, Leads, Unpaid, Invites, Finance, CollectionsAdmin } from './AdminTools.jsx';

function Moderation() {
  const [t, setT] = useState(() => { try { return sessionStorage.getItem('kl-mod-tab') || 'reports'; } catch { return 'reports'; } });
  const pick = (v) => { setT(v); try { sessionStorage.setItem('kl-mod-tab', v); } catch { /* приватный режим */ } };
  return <>
    <div className="chips">{[['reports', 'Жалобы'], ['products', 'Товары'], ['reviews', 'Отзывы']].map(([v, l]) => <button key={v} type="button" className={'chip' + (t === v ? ' on' : '')} onClick={() => pick(v)}>{l}</button>)}</div>
    {t === 'reports' && <Reports />}{t === 'products' && <Products />}{t === 'reviews' && <Reviews />}
  </>;
}
function Requests() { return <><div className="sec-head"><h2>С лендинга /sell</h2></div><Leads /><RoleAndPartnerRequests /></>; }

// Каждый раздел админки — отдельный экран. Старые ссылки /admin/tools/<вкладка> ведут сюда же.
const MAP = {
  support: ['Поддержка — чаты', AdminSupport],
  'support-contacts': ['Контакты поддержки', SupportEditor],
  requests: ['Заявки', Requests],
  leads: ['Заявки', Requests],
  boutiques: ['Бутики', BoutiquesAdmin],
  finance: ['Обороты', Finance],
  orders: ['Все заказы', Orders],
  unpaid: ['Неоплаты', Unpaid],
  moderation: ['Модерация', Moderation],
  products: ['Модерация', Moderation],
  reviews: ['Модерация', Moderation],
  reports: ['Модерация', Moderation],
  collections: ['Подборки', CollectionsAdmin],
  promos: ['Промокоды площадки', PromoManager],
  invites: ['Приглашения', Invites],
  broadcast: ['Рассылка', Broadcast],
};

export default function AdminSection() {
  const { section, tab, id } = useParams();
  const key = section || tab;
  if (key === 'support' && id) return <main className="chat-page"><AdminSupport /></main>;
  if (key === 'stats') return <AdminStats part="stats" />;
  if (key === 'users') return <AdminStats part="users" />;
  if (key === 'brands') return <AdminPromo part="brands" />;
  if (key === 'popular') return <AdminPromo part="promotions" />;
  const s = MAP[key];
  if (!s) return <Navigate to="/admin" replace />;
  const [title, Body] = s;
  return (
    <main className="wrap">
      <h1 className="screen-title rise">{title}</h1>
      <Body />
    </main>
  );
}
