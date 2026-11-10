import { useEffect, useRef, useState } from 'react';

const DURATION = 380;
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
// Safari (iPhone, iPad, Mac) — у него бывает ошибка перерисовки после анимаций.
const isSafari = /AppleWebKit/.test(navigator.userAgent) && !/Chrome|CriOS|Chromium|Android/.test(navigator.userAgent);

// Сцена переходов: новый экран въезжает, старый в это время плавно уезжает (а не исчезает мгновенно).
// dir: 'fwd' — вперёд/вправо, 'back' — назад/влево.
export default function PageStage({ pageKey, dir, children }) {
  const [exiting, setExiting] = useState([]);
  const prev = useRef({ key: pageKey, el: children });
  const current = useRef(null);

  // Смена экрана: запоминаем старый вместе с прокруткой, чтобы он уезжал с того же места.
  if (prev.current.key !== pageKey) {
    const old = prev.current;
    prev.current = { key: pageKey, el: children };
    if (!reduced()) setExiting((list) => [...list.filter((x) => x.key !== pageKey), { key: old.key, el: old.el, dir, y: window.scrollY }]);
  } else {
    prev.current.el = children;
  }

  useEffect(() => {
    if (!exiting.length) return undefined;
    const t = setTimeout(() => setExiting([]), DURATION);
    return () => clearTimeout(t);
  }, [exiting]);

  // Страховка для Safari: после окончания перехода заставляем его перерисовать экран.
  useEffect(() => {
    if (!isSafari || exiting.length) return undefined;
    const el = current.current; if (!el) return undefined;
    const id = requestAnimationFrame(() => {
      el.style.opacity = '0.999';
      requestAnimationFrame(() => { el.style.opacity = ''; });
    });
    return () => cancelAnimationFrame(id);
  }, [exiting, pageKey]);

  return (
    <div className="stage">
      {exiting.map((x) => (
        <div key={x.key} className={'page page-exit ' + x.dir} style={{ top: -x.y }} aria-hidden="true" inert>{x.el}</div>
      ))}
      <div key={pageKey} ref={current} className={'page page-enter ' + dir}>{children}</div>
    </div>
  );
}
