import { createClient } from '@supabase/supabase-js';
// Здесь только публичный (publishable) ключ. Секретные ключи в браузер попадать не должны никогда.
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error('Не заданы VITE_SUPABASE_URL и VITE_SUPABASE_PUBLISHABLE_KEY');
// Запросы к базе с ограничением по времени: при плохой связи запрос прерывается через 15 секунд,
// и экран показывает ошибку, а не бесконечную «Загрузку…». Загрузку файлов (фото) не ограничиваем.
const timedFetch = (input, init = {}) => {
  const u = typeof input === 'string' ? input : input?.url || '';
  if (init.signal || /\/storage\/v1\/object\/(?!public|sign)|\/functions\/v1\//.test(u)) return fetch(input, init);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  return fetch(input, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(t));
};
export const supabase = createClient(url, key, { global: { fetch: timedFetch } });
