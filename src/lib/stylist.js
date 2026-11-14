import { supabase } from './supabase.js';
import { api } from '../api/index.js';
import { rub } from '../store/cart.jsx';

// Стилист Kavkaz Look: собирает образ из товаров каталога по ответам на вопросы или по запросу своими словами.
// Если на сервере подключена нейросеть — сначала спрашиваем её, иначе собираем образ прямо на устройстве.

export const QUESTIONS = [
  { key: 'who', text: 'Для кого подбираем?', options: [['self', 'Для себя'], ['gift', 'В подарок']] },
  { key: 'gender', text: 'Какой образ?', options: [['m', 'Мужской'], ['f', 'Женский']] },
  { key: 'occasion', text: 'Какой повод?', options: [['daily', 'На каждый день'], ['wedding', 'Свадьба'], ['toy', 'Той'], ['holiday', 'Праздник'], ['work', 'Работа'], ['study', 'Учёба'], ['guests', 'В гости']] },
  { key: 'style', text: 'Какой стиль ближе?', options: [['classic', 'Классика'], ['modest', 'Сдержанно'], ['bright', 'Ярко'], ['sport', 'Спортивно'], ['national', 'Национальное'], ['any', 'Не важно']] },
  { key: 'budget', text: 'Какой бюджет на весь образ?', options: [[5000, 'до 5 000 ₽'], [10000, 'до 10 000 ₽'], [20000, 'до 20 000 ₽'], [50000, 'до 50 000 ₽'], [0, 'Не важно']] },
];
export const labelOf = (key, val) => QUESTIONS.find((q) => q.key === key)?.options.find(([v]) => v === val)?.[1] || '';

// Слова, по которым узнаём подходящие вещи (ищем в названии и цвете товара)
const OCC = {
  daily: ['повседнев', 'футболк', 'джинс', 'худи', 'свитшот', 'кроссов', 'базов', 'лонгслив', 'кардиган'],
  wedding: ['свадеб', 'вечерн', 'празднич', 'нарядн', 'костюм', 'платье', 'туфл', 'черкес', 'шёлк', 'шелк', 'атлас', 'клатч'],
  toy: ['той', 'празднич', 'нарядн', 'костюм', 'платье', 'туфл', 'атлас', 'клатч', 'рубаш'],
  holiday: ['празднич', 'нарядн', 'национал', 'абай', 'платок', 'черкес', 'папах', 'платье', 'костюм'],
  work: ['рубаш', 'брюк', 'пиджак', 'блуз', 'классич', 'офис', 'юбк', 'туфл', 'лофер', 'жакет'],
  study: ['рубаш', 'брюк', 'свитер', 'джемпер', 'юбк', 'рюкзак', 'кроссов', 'кардиган'],
  guests: ['нарядн', 'платье', 'рубаш', 'костюм', 'блуз', 'юбк', 'туфл'],
};
const STYLE = {
  classic: ['классич', 'костюм', 'рубаш', 'пиджак', 'брюк', 'туфл', 'лофер', 'чёрн', 'черн', 'бел'],
  modest: ['закрыт', 'длин', 'макси', 'свобод', 'абай', 'платок', 'хиджаб', 'миди'],
  bright: ['ярк', 'красн', 'цвет', 'принт', 'золот', 'жёлт', 'желт', 'зелён', 'зелен', 'син'],
  sport: ['спорт', 'кроссов', 'худи', 'трениров', 'джоггер', 'свитшот', 'кепк'],
  national: ['национал', 'черкес', 'папах', 'абай', 'платок', 'традиц', 'бешмет'],
};
const IMMODEST = ['мини', 'коротк', 'открыт', 'декольт', 'прозрач', 'топ '];
const FEMALE = /женск|платье|юбк|блуз|туфл[ия] на|каблук|абай|хиджаб|платок|палантин|клатч|сумочк|серьг|бусы|колье/i;
const MALE = /мужск|черкес|папах|галстук|запонк/i;

// Запрос своими словами → те же ответы, что и на кнопках
export function parseText(q) {
  const s = q.toLowerCase(), a = { text: q };
  if (/подар|маме|сестр|жене|мужу|брату|отцу|папе|подруг/.test(s)) a.who = 'gift';
  if (/женск|девушк|жене|маме|сестр|подруг|невест|платье/.test(s)) a.gender = 'f';
  else if (/мужск|парн|мужу|отцу|папе|брат|жених|себе.*муж/.test(s)) a.gender = 'm';
  if (/свадьб/.test(s)) a.occasion = 'wedding'; else if (/\bто[йя]\b|тое/.test(s)) a.occasion = 'toy';
  else if (/праздн|байрам|ураз|курбан|мавлид|выпускн/.test(s)) a.occasion = 'holiday';
  else if (/работ|офис/.test(s)) a.occasion = 'work'; else if (/учёб|учеб|школ|универ/.test(s)) a.occasion = 'study';
  else if (/гост/.test(s)) a.occasion = 'guests'; else if (/кажд|повседн/.test(s)) a.occasion = 'daily';
  if (/скромн|сдержан|закрыт/.test(s)) a.style = 'modest'; else if (/классик|строг/.test(s)) a.style = 'classic';
  else if (/ярк/.test(s)) a.style = 'bright'; else if (/спорт/.test(s)) a.style = 'sport'; else if (/национал|традиц/.test(s)) a.style = 'national';
  const b = parseBudget(q); if (b) a.budget = b;
  a.words = s.split(/[^а-яёa-z]+/).filter((w) => w.length > 3).map((w) => w.slice(0, 5));
  return a;
}
export function parseBudget(q) {
  const m = q.replace(/\s/g, '').match(/(?:до|недороже|бюджет|за)?(\d{3,7})(тыс|т\.|к)?/i) || q.match(/(\d{1,3})\s?(тыс|т\.|к)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return m[2] ? n * 1000 : n;
}

// Товары для подбора: до 60 лучших, запоминаем на 5 минут
let pool = { t: 0, list: [] };
export async function loadPool() {
  if (Date.now() - pool.t < 300000 && pool.list.length) return pool.list;
  const pages = await Promise.all([0, 1, 2].map((page) => api.listProducts({ sort: 'rating', page })));
  const seen = new Set(), list = [];
  for (const p of pages.flat()) if (p && !seen.has(p.id) && !p.blocked) { seen.add(p.id); list.push(p); }
  pool = { t: Date.now(), list };
  return list;
}

// Место вещи в образе
const slotOf = (p) => {
  if (p.category === 'Обувь' || p.garmentType === 'shoes') return 'shoes';
  if (p.category === 'Аксессуары' || p.garmentType === 'none') return 'acc';
  if (p.garmentType === 'pants' || p.garmentType === 'skirt') return 'bottom';
  if (p.garmentType === 'dress') return 'dress';
  if (p.garmentType === 'outer') return 'outer';
  return 'top';
};
// Размер человека для вещи: обувь — по размеру обуви, аксессуары — без размера. size = { wear: '46 (M)', shoes: '42' }
const want = (p, size) => { const sl = slotOf(p); return !size || sl === 'acc' ? null : sl === 'shoes' ? size.shoes : size.wear; };
const match = (p, w) => p.sizes.filter((s) => (slotOf(p) === 'shoes' ? String(s) === w : w.split(/[\s()]+/).includes(String(s).toUpperCase())));
// Подходит ли размер: у вещи нет размеров, либо есть нужный (и он в наличии, если продавец ведёт остатки)
const fits = (p, size) => {
  const w = want(p, size);
  if (!w || !p.sizes?.length) return true;
  const ok = match(p, w);
  if (!ok.length) return false;
  return !p.stock || ok.some((s) => (p.stock[s] ?? 1) > 0);
};
export const sizeFor = (p, size) => { const w = want(p, size); return w && p.sizes?.length ? match(p, w)[0] || null : null; };

const has = (p, words) => { const t = (p.title + ' ' + (p.color || '') + ' ' + (p.description || '')).toLowerCase(); return words.filter((w) => t.includes(w)).length; };
const rand = (seed, id) => { let h = seed; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return (h % 1000) / 1000; };

function score(p, a, seed) {
  let s = (p.rating || 0) / 5 + rand(seed, p.id) * 1.2;
  if (a.occasion) s += has(p, OCC[a.occasion]) * 1.5;
  if (a.style && STYLE[a.style]) s += has(p, STYLE[a.style]) * 1.5;
  if (a.words?.length) s += has(p, a.words) * 2;
  if (a.modest || a.style === 'modest' || ['wedding', 'toy', 'holiday'].includes(a.occasion)) s -= has(p, IMMODEST) * 3;
  const t = p.title;
  if (a.gender === 'f') { if (p.category === 'Женское') s += 3; if (MALE.test(t)) s -= 6; if (FEMALE.test(t)) s += 1; }
  if (a.gender === 'm') { if (p.category === 'Мужское') s += 3; if (FEMALE.test(t)) s -= 6; if (MALE.test(t)) s += 1; }
  if (p.category === 'Национальное' && (a.style === 'national' || a.occasion === 'holiday')) s += 3;
  return s;
}

// Собираем образ: главная вещь → низ (если нужен) → обувь → аксессуар, в пределах бюджета
export function buildLook(list, a, { seed = 1, exclude = new Set(), size = null } = {}) {
  const ok = list.filter((p) => !exclude.has(p.id) && fits(p, size)
    && !(a.gender === 'f' && (p.category === 'Мужское' || MALE.test(p.title))) && !(a.gender === 'm' && (p.category === 'Женское' || FEMALE.test(p.title))));
  const ranked = ok.map((p) => ({ p, s: score(p, a, seed) })).sort((x, y) => y.s - x.s).map((x) => x.p);
  const clothes = ranked.filter((p) => ['Женское', 'Мужское', 'Национальное'].includes(p.category));
  const by = (slot) => ranked.filter((p) => slotOf(p) === slot);
  const look = []; let left = a.budget || Infinity;
  const cheapest = (arr) => (arr.length ? Math.min(...arr.map((p) => p.price)) : 0);
  const take = (arr, reserve = 0) => { const p = arr.find((x) => !look.includes(x) && x.price <= left - reserve); if (p) { look.push(p); left -= p.price; } return p; };
  const shoes = by('shoes'), acc = by('acc');
  const main = take(clothes, cheapest(shoes));
  if (main && slotOf(main) === 'top') take(by('bottom').filter((p) => p.category !== 'Обувь'), cheapest(shoes));
  if (main && slotOf(main) === 'bottom') take(clothes.filter((p) => ['top', 'outer'].includes(slotOf(p))), cheapest(shoes));
  take(shoes);
  take(acc);
  if (!look.length) take(ranked);
  return look;
}

// Замена одной вещи на похожую (то же место в образе, бюджет сохраняется)
export function replaceItem(list, a, look, item, { seen = new Set(), size = null } = {}) {
  const rest = look.filter((p) => p.id !== item.id), sum = rest.reduce((s, p) => s + p.price, 0);
  const left = a.budget ? a.budget - sum : Infinity;
  const pick = list.filter((p) => slotOf(p) === slotOf(item) && p.id !== item.id && !(a.gender === 'm' && FEMALE.test(p.title)) && !(a.gender === 'f' && MALE.test(p.title)) && !seen.has(p.id) && !rest.some((x) => x.id === p.id) && p.price <= left && fits(p, size))
    .map((p) => ({ p, s: score(p, a, Date.now() % 997) + (p.category === item.category ? 2 : 0) })).sort((x, y) => y.s - x.s)[0]?.p;
  return pick ? look.map((p) => (p.id === item.id ? pick : p)) : null;
}

export function lookTitle(a) {
  const parts = [a.occasion && labelOf('occasion', a.occasion), a.style && a.style !== 'any' && labelOf('style', a.style)].filter(Boolean);
  return parts.length ? parts.join(' · ') : a.gender === 'f' ? 'Женский образ' : a.gender === 'm' ? 'Мужской образ' : 'Образ';
}
export const queryOf = (a) => [a.gender === 'f' ? 'Женский образ' : a.gender === 'm' ? 'Мужской образ' : 'Образ', a.who === 'gift' && 'в подарок',
  a.occasion && labelOf('occasion', a.occasion).toLowerCase(), a.style && a.style !== 'any' && labelOf('style', a.style).toLowerCase(), a.budget && 'до ' + rub(a.budget), a.text].filter(Boolean).join(', ');

// Нейросеть на сервере (если подключена): отвечает образами из каталога. null — значит собираем сами.
let serverOff = false;
export async function askServer(query) {
  if (serverOff) return null;
  try {
    const { data, error } = await supabase.functions.invoke('stylist', { body: { query } });
    if (!error && data && Array.isArray(data.looks)) return { intro: data.intro, looks: data.looks.map((l) => ({ ...l, items: l.items.map((p) => ({ ...p, ...api.imageUrls(p.image_path) })) })) };
    const st = error?.context?.status;
    if (st === 503 || st === 404 || st === 401) serverOff = true;
    if (st === 429) return { error: 'Слишком много запросов подряд. Попробуйте через час.' };
  } catch { serverOff = true; }
  return null;
}
