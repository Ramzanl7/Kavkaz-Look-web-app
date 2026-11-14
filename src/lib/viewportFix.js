// iPhone: после закрытия клавиатуры или смены экрана Safari иногда «забывает» настоящую высоту экрана —
// нижняя панель и фон с орнаментом съезжают вверх, а снизу остаётся пустая полоса (особенно на коротких экранах).
// Лечение: заставляем браузер пересчитать размеры окна. На других устройствах ничего не меняется.
const typing = () => { const a = document.activeElement; return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable); };

const IOS = typeof navigator !== 'undefined' && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

export function healViewport() {
  if (!IOS || typing()) return;
  const html = document.documentElement, x = window.scrollX, y = window.scrollY;
  html.style.minHeight = 'calc(100% + 1px)';
  void html.offsetHeight; // принудительный пересчёт
  window.scrollTo(x, y + 1);
  requestAnimationFrame(() => { html.style.minHeight = ''; window.scrollTo(x, y); });
}

let t1, t2;
export const later = () => { clearTimeout(t1); clearTimeout(t2); t1 = setTimeout(healViewport, 120); t2 = setTimeout(healViewport, 450); };

export function installViewportFix() {
  if (!IOS) return;
  document.addEventListener('focusout', later);
  window.visualViewport?.addEventListener('resize', later);
  window.addEventListener('orientationchange', later);
  window.addEventListener('pageshow', later);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) later(); });
}
