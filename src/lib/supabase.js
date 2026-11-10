import { createClient } from '@supabase/supabase-js';
// Здесь только публичный (publishable) ключ. Секретные ключи в браузер попадать не должны никогда.
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error('Не заданы VITE_SUPABASE_URL и VITE_SUPABASE_PUBLISHABLE_KEY');
export const supabase = createClient(url, key);
