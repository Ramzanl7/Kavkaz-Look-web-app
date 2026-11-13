// Страховка оформления: при плохой связи файл стилей может не скачаться, и Safari покажет страницу «голой».
// Проверяем, применились ли стили; если нет — перекачиваем файл (до 2 раз), иначе один раз перезагружаем страницу.
const applied = () => getComputedStyle(document.documentElement).getPropertyValue('--gold').trim() !== '';

export function guardStyles() {
  if (import.meta.env.DEV) return;
  const check = (attempt) => {
    if (applied()) return;
    const link = document.querySelector('link[rel="stylesheet"][href*="/assets/"]');
    if (link && attempt < 2) {
      const fresh = link.cloneNode();
      fresh.href = link.href.split('?')[0] + '?r=' + Date.now();
      fresh.onload = () => link.remove();
      document.head.appendChild(fresh);
      setTimeout(() => check(attempt + 1), 4000);
      return;
    }
    let tried = false;
    try { tried = sessionStorage.getItem('kl-css-reload') === '1'; sessionStorage.setItem('kl-css-reload', '1'); } catch { /* приватный режим */ }
    if (!tried) window.location.reload();
  };
  setTimeout(() => check(0), 1500);
  // Запуск прошёл нормально — в следующий раз снова разрешаем одну перезагрузку
  setTimeout(() => { if (applied()) try { sessionStorage.removeItem('kl-css-reload'); } catch { /* приватный режим */ } }, 20000);
}
