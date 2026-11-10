import { useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icons.jsx';
import { useCart } from '../store/cart.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { ConsentGate, BlockedScreen } from '../components/Gates.jsx';
import { useActivity } from '../lib/useActivity.js';
const ROOTS = ['/catalog', '/boutiques', '/wishlist', '/cart', '/profile'];
const tabs = [['/catalog', 'Каталог', 'catalog'], ['/boutiques', 'Бутики', 'shop'], ['/wishlist', 'Избранное', 'heart'], ['/cart', 'Корзина', 'bag'], ['/profile', 'Профиль', 'user']];
export default function AppLayout() {
  const { pathname } = useLocation();
  const nav = useNavigate();
  const { items } = useCart();
  const count = items.reduce((s, i) => s + i.qty, 0);
  const root = ROOTS.includes(pathname);
  const { user, blocked, needsConsent } = useAuth();
  useActivity(user?.id ?? null);
  const open = ['/privacy', '/support'].includes(pathname);
  const gate = user && !open ? (blocked ? <BlockedScreen reason={blocked.reason} /> : needsConsent ? <ConsentGate /> : null) : null;
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  const back = () => (window.history.state?.idx > 0 ? nav(-1) : nav('/catalog'));
  return (
    <div className={root ? '' : 'has-bar'}>
      <svg className="bgpattern" width="100%" height="100%" aria-hidden="true">
        <defs><pattern id="bgp" width="56" height="56" patternUnits="userSpaceOnUse">
          <path d="M28 4 L52 28 L28 52 L4 28 Z" fill="none" stroke="currentColor" />
          <path d="M28 16 L40 28 L28 40 L16 28 Z" fill="none" stroke="currentColor" />
        </pattern></defs>
        <rect width="100%" height="100%" fill="url(#bgp)" />
      </svg>
      {!root && <header className="appbar"><button type="button" className="back press" onClick={back} aria-label="Назад"><Icon name="back" /></button></header>}
      <div className="page" key={pathname}>{gate || <Outlet />}</div>
      <nav className="tabbar" aria-label="Основная навигация">
        {tabs.map(([to, label, ic]) => (
          <NavLink key={to} to={to}><Icon name={ic} /><span>{label}</span>{to === '/cart' && count > 0 && <i className="badge">{count}</i>}</NavLink>
        ))}
      </nav>
    </div>
  );
}
