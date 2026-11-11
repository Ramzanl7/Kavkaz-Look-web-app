import { Suspense, useRef } from 'react';
import { useLocation, useNavigate, useNavigationType, useOutlet } from 'react-router-dom';
import { Icon } from '../components/Icons.jsx';
import TabBar, { TABS, tabIndexOf } from '../components/TabBar.jsx';
import PageStage from '../components/PageStage.jsx';
import { useCart } from '../store/cart.jsx';
import { useNotifications } from '../store/notifications.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { ConsentGate, BlockedScreen } from '../components/Gates.jsx';
import { useActivity } from '../lib/useActivity.js';

const ROOTS = TABS.map(([to]) => to);
const Fallback = () => (
  <main className="wrap"><div className="skeleton" style={{ height: 32, width: '50%', borderRadius: 8 }} /><div className="skeleton" style={{ height: 160, borderRadius: 16 }} /></main>
);

export default function AppLayout() {
  const { pathname, state } = useLocation();
  // Экран входа, куда отправили с вкладки (например, «Избранное»), — капля остаётся на этой вкладке.
  const tabPath = pathname === '/login' && typeof state?.from === 'string' ? state.from : pathname;
  const navType = useNavigationType();
  const nav = useNavigate();
  const outlet = useOutlet();
  const { items } = useCart();
  const count = items.reduce((s, i) => s + i.qty, 0);
  const { unread } = useNotifications();
  const root = ROOTS.includes(pathname);
  const { user, blocked, needsConsent } = useAuth();
  useActivity(user?.id ?? null);

  // Направление перехода: между вкладками — по их порядку, иначе «назад» = кнопка назад/жест.
  const prevPath = useRef(pathname);
  const dirRef = useRef('fwd');
  if (prevPath.current !== pathname) {
    const a = ROOTS.indexOf(prevPath.current), b = ROOTS.indexOf(pathname);
    dirRef.current = a >= 0 && b >= 0 ? (b > a ? 'fwd' : 'back') : navType === 'POP' ? 'back' : 'fwd';
    prevPath.current = pathname;
  }

  const open = ['/privacy', '/support'].includes(pathname);
  const gate = user && !open ? (blocked ? <BlockedScreen reason={blocked.reason} /> : needsConsent ? <ConsentGate /> : null) : null;
  const back = () => (window.history.state?.idx > 0 ? nav(-1) : nav('/catalog'));
  // Кнопка «назад» — часть экрана: она меняется вместе с ним в анимации перехода.
  const screen = (
    <div className={root ? '' : 'has-bar'}>
      {!root && <header className="appbar"><button type="button" className="back press" onClick={back} aria-label="Назад"><Icon name="back" /></button></header>}
      {gate || <Suspense fallback={<Fallback />}>{outlet}</Suspense>}
    </div>
  );
  return (
    <>
      <svg className="bgpattern" width="100%" height="100%" aria-hidden="true">
        <defs><pattern id="bgp" width="56" height="56" patternUnits="userSpaceOnUse">
          <path d="M28 4 L52 28 L28 52 L4 28 Z" fill="none" stroke="currentColor" />
          <path d="M28 16 L40 28 L28 40 L16 28 Z" fill="none" stroke="currentColor" />
        </pattern></defs>
        <rect width="100%" height="100%" fill="url(#bgp)" />
      </svg>
      <PageStage pageKey={pathname} dir={dirRef.current}>{screen}</PageStage>
      <TabBar active={tabIndexOf(tabPath)} count={count} unread={unread} />
    </>
  );
}
