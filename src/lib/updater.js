/* global __BUILD__, __BUILT_AT__ */
// Автообновление. Приложение с главного экрана iPhone может долго жить в памяти со старым кодом.
// Когда его снова открывают (и раз в 10 минут), сверяем версию с сервером и при расхождении перезагружаемся.
export const BUILD = __BUILD__;
export const BUILT_AT = __BUILT_AT__;
export const buildLabel = () => {
  const d = new Date(BUILT_AT);
  return `${BUILD} · ${d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`;
};

let checking = false;
async function check() {
  if (checking || document.visibilityState !== 'visible' || !navigator.onLine) return;
  checking = true;
  try {
    const r = await fetch('/version.json', { cache: 'no-store' });
    if (r.ok) {
      const { build } = await r.json();
      // Не зацикливаемся: одна попытка перезагрузки на одну новую версию.
      let tried = null;
      try { tried = sessionStorage.getItem('kl_reload_for'); } catch { /* приватный режим */ }
      if (build && build !== BUILD && tried !== build) {
        try { sessionStorage.setItem('kl_reload_for', build); } catch { /* приватный режим */ }
        window.location.reload();
      }
    }
  } catch { /* нет сети — проверим позже */ } finally { checking = false; }
}

export function startUpdater() {
  if (import.meta.env.DEV) return;
  document.addEventListener('visibilitychange', check);
  window.addEventListener('pageshow', (e) => { if (e.persisted) check(); });
  setInterval(check, 10 * 60 * 1000);
  setTimeout(check, 3000);
}
