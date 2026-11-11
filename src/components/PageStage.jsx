import { useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Переходы между экранами через встроенные View Transitions браузера:
// браузер сам снимает «снимок» старого экрана и анимирует его вместе с новым.
// В самой странице всегда живёт ОДИН экран — это убирает ошибку перерисовки в Safari на iPhone.
// Где View Transitions нет — экран просто сменяется без анимации.
export default function PageStage({ pageKey, dir, children }) {
  const [shownKey, setShownKey] = useState(pageKey);
  const last = useRef(children);
  // Пока переход не начался, показываем прежний экран (нужно для «снимка» старого состояния).
  if (shownKey === pageKey) last.current = children;

  useLayoutEffect(() => {
    if (shownKey === pageKey) return;
    const apply = () => { flushSync(() => setShownKey(pageKey)); window.scrollTo(0, 0); };
    if (!document.startViewTransition || reduced()) { apply(); return; }
    const root = document.documentElement;
    root.dataset.nav = dir;
    const vt = document.startViewTransition(apply);
    vt.finished.finally(() => { if (root.dataset.nav === dir) delete root.dataset.nav; });
  }, [pageKey, shownKey, dir]);

  return <div className="page">{shownKey === pageKey ? children : last.current}</div>;
}
