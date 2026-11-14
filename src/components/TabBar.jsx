import { useEffect, useLayoutEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { Icon } from './Icons.jsx';

export const TABS = [['/home', 'Главная', 'home'], ['/catalog', 'Каталог', 'catalog'], ['/wishlist', 'Избранное', 'heart'], ['/cart', 'Корзина', 'bag'], ['/profile', 'Профиль', 'user']];

// К какой вкладке относится экран: товар — к каталогу, заказы и настройки — к профилю и т.д.
export function tabIndexOf(path) {
  const exact = TABS.findIndex(([to]) => to === path);
  if (exact >= 0) return exact;
  if (/^\/(product|nearby|partners|brands)\b/.test(path)) return 0;
  if (/^\/(boutiques|stylist|collections|tryon)\b/.test(path)) return 1;
  return 4; // профиль, заказы, настройки, поддержка, вход, админка, кабинет продавца
}

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// «Жидкая» капля: при смене вкладки вытягивается в сторону движения, перетекает,
// слегка проскакивает цель и упруго садится на место.
export default function TabBar({ active, count, unread = 0, wished = 0 }) {
  const bar = useRef(null);
  const blob = useRef(null);
  const tabs = useRef([]);
  const last = useRef(null);

  const geometry = (i) => {
    const el = tabs.current[i];
    if (!el) return null;
    const inset = 5;
    return { x: el.offsetLeft + inset, w: el.offsetWidth - inset * 2 };
  };

  useLayoutEffect(() => {
    const b = blob.current; const g = geometry(active);
    if (!b || !g) return;
    b.style.width = g.w + 'px';
    const from = last.current;
    last.current = g.x;
    b.style.transform = `translateX(${g.x}px)`;
    if (from == null || from === g.x || reduced() || !b.animate) return;
    const d = g.x - from, dir = Math.sign(d), dist = Math.abs(d) / g.w;
    const stretch = Math.min(0.35 + dist * 0.28, 1.4);
    b.getAnimations().forEach((a) => a.cancel());
    b.animate([
      { transform: `translateX(${from}px) scale(1, 1)` },
      { transform: `translateX(${from + d * 0.05}px) scale(1.1, 0.9)`, offset: 0.16 },
      { transform: `translateX(${from + d * 0.55}px) scale(${1 + stretch}, 0.8)`, offset: 0.5 },
      { transform: `translateX(${g.x + dir * 7}px) scale(0.92, 1.08)`, offset: 0.8 },
      { transform: `translateX(${g.x - dir * 2}px) scale(1.03, 0.97)`, offset: 0.92 },
      { transform: `translateX(${g.x}px) scale(1, 1)` },
    ], { duration: 620 + Math.min(dist, 4) * 40, easing: 'cubic-bezier(.3,.7,.35,1)' });
  }, [active]);

  // При повороте экрана и изменении размера капля переезжает без анимации.
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      const g = geometry(active); const b = blob.current;
      if (!g || !b) return;
      b.style.width = g.w + 'px'; b.style.transform = `translateX(${g.x}px)`; last.current = g.x;
    });
    if (bar.current) ro.observe(bar.current);
    return () => ro.disconnect();
  }, [active]);

  return (
    <nav className="tabbar" ref={bar} aria-label="Основная навигация">
      <span className="tab-blob" ref={blob} aria-hidden="true" />
      {TABS.map(([to, label, ic], i) => (
        <NavLink key={to} to={to} ref={(el) => { tabs.current[i] = el; }}
          className={i === active ? 'active' : ''} aria-current={i === active ? 'page' : undefined}>
          <span className="tab-ic" key={i === active ? 'on' : 'off'}><Icon name={ic} /></span>
          <span className="tab-label">{label}</span>
          {to === '/cart' && count > 0 && <i className="badge">{count > 99 ? '99+' : count}</i>}
          {to === '/wishlist' && wished > 0 && <i className="badge">{wished > 99 ? '99+' : wished}</i>}
          {to === '/profile' && unread > 0 && <i className="badge" aria-label={unread + ' новых уведомлений'}>{unread > 9 ? '9+' : unread}</i>}
        </NavLink>
      ))}
    </nav>
  );
}
