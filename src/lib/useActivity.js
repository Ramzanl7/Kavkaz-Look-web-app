import { useEffect } from 'react';
import { api } from '../api/index.js';
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' });
// Отмечает «был в сети». Вошедший — при открытии и каждые 4 минуты, пока вкладка видна.
// Гость — один раз в день с устройства, только как число (в браузере хранится лишь дата последнего учёта).
export function useActivity(user) {
  useEffect(() => {
    if (!user) {
      let seen = null;
      try { seen = localStorage.getItem('kl_guest_day'); } catch { /* приватный режим */ }
      if (seen !== today()) {
        try { localStorage.setItem('kl_guest_day', today()); } catch { /* приватный режим */ }
        api.touch(true);
      }
      return undefined;
    }
    const ping = () => { if (document.visibilityState === 'visible') api.touch(); };
    ping();
    const id = setInterval(ping, 4 * 60 * 1000);
    document.addEventListener('visibilitychange', ping);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', ping); };
  }, [user]);
}
