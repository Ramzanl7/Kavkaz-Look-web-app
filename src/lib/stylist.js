import { supabase } from './supabase.js';
import { api } from '../api/index.js';

// ИИ-стилист: сначала спрашиваем ИИ на сервере; если ИИ не настроен или недоступен —
// простой подборщик прямо на устройстве (по разделу, поводу и бюджету из запроса).
export async function askStylist(query) {
  try {
    const { data, error } = await supabase.functions.invoke('stylist', { body: { query } });
    if (!error && data && Array.isArray(data.looks)) return { ...data, looks: data.looks.map(withImages) };
    const status = error?.context?.status;
    if (status === 429) return { error: 'Слишком много запросов подряд. Попробуйте через час.' };
  } catch { /* сеть или функция недоступна — идём в простой подборщик */ }
  return basicStylist(query);
}

const withImages = (l) => ({ ...l, items: l.items.map((p) => ({ ...p, ...api.imageUrls(p.image_path) })) });

const RULES = [
  [/женск|девушк|жене|маме|сестр|подруг|невест/i, ['Женское']],
  [/мужск|парн|муж[ау]?\b|отц|пап|брат|жених/i, ['Мужское']],
  [/национал|традиц|свадьб|той|праздн/i, ['Национальное']],
  [/обув|туфл|ботин|кроссов|сапог/i, ['Обувь']],
  [/аксессуар|сумк|платок|шарф|украш|ремен/i, ['Аксессуары']],
];

export function parseBudget(q) {
  const m = q.replace(/\s/g, '').match(/(?:до|не\s?дороже|бюджет|за)?(\d{3,7})(тыс|т\.|к)?/i)
    || q.match(/(\d{1,3})\s?(тыс|т\.|к)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return m[2] ? n * 1000 : n;
}

async function basicStylist(query) {
  const all = await api.listProducts({ sort: 'rating' });
  if (!all.length) return { intro: 'В каталоге пока нет товаров — подбирать не из чего.', looks: [], ai: false };
  const cats = RULES.filter(([re]) => re.test(query)).flatMap(([, c]) => c);
  const budget = parseBudget(query);
  const words = query.toLowerCase().split(/[^а-яёa-z]+/).filter((w) => w.length > 3);
  const score = (p) => (cats.includes(p.category) ? 3 : 0)
    + words.filter((w) => (p.title + ' ' + p.description).toLowerCase().includes(w.slice(0, 5))).length * 2 + p.rating / 5;
  const ranked = all.map((p) => ({ p, s: score(p) })).sort((a, b) => b.s - a.s).map((x) => x.p);
  // один образ: разные разделы, в пределах бюджета
  const look = []; let sum = 0;
  for (const p of ranked) {
    if (look.length >= 3) break;
    if (look.some((x) => x.category === p.category)) continue;
    if (budget && sum + p.price > budget) continue;
    look.push(p); sum += p.price;
  }
  const intro = `Подобрал по ${cats.length ? 'разделам «' + [...new Set(cats)].join('», «') + '»' : 'популярным товарам'}${budget ? ' в пределах ' + budget.toLocaleString('ru-RU') + ' ₽' : ''}.`;
  return {
    intro, ai: false,
    looks: look.length ? [{ title: 'Образ из каталога', why: `Итого ${sum.toLocaleString('ru-RU')} ₽. Это простой подбор без ИИ.`, items: look.map((p) => ({ id: p.id, title: p.title, price: p.price, category: p.category, boutique: p.boutique, image: p.image, thumb: p.thumb })) }] : [],
  };
}
