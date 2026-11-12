// Расчёт посадки одежды на фигуре покупателя.
// Тело — из «Моих мерок» (недостающее достраивается по росту и сетке).
// Вещь — из таблицы замеров продавца, а если её нет — из стандартной российской сетки + припуск на свободу.
// Все величины в сантиметрах. Это ориентир, а не гарантия: лекала у брендов разные.

export const TYPES = {
  dress: { label: 'Платье', zones: ['chest', 'waist', 'hips'] },
  top: { label: 'Рубашка, блузка, свитер', zones: ['chest', 'waist', 'hips'] },
  outer: { label: 'Верхняя одежда', zones: ['chest', 'waist', 'hips'] },
  pants: { label: 'Брюки', zones: ['waist', 'hips'] },
  skirt: { label: 'Юбка', zones: ['waist', 'hips'] },
  shoes: { label: 'Обувь', zones: [] },
  none: { label: 'Не примеряется (аксессуары)', zones: [] },
};
export const ZONE_LABEL = { chest: 'Грудь', waist: 'Талия', hips: 'Бёдра', length: 'Длина' };

// Свобода облегания готовой вещи относительно тела, см (обычная посадка)
const EASE = {
  dress: { chest: 6, waist: 6, hips: 6 },
  top: { chest: 8, waist: 10, hips: 8 },
  outer: { chest: 14, waist: 14, hips: 12 },
  pants: { waist: 2, hips: 6 },
  skirt: { waist: 2, hips: 6 },
};

export const GRID = { female: ['40', '42', '44', '46', '48', '50', '52', '54', '56'], male: ['44', '46', '48', '50', '52', '54', '56', '58'] };
export const SHOE_GRID = { female: ['35', '36', '37', '38', '39', '40', '41', '42'], male: ['39', '40', '41', '42', '43', '44', '45', '46'] };
export const gridFor = (type, gender) => (type === 'shoes' ? SHOE_GRID : GRID)[gender === 'male' ? 'male' : 'female'];

// Предпочтения из опросника: насколько свободнее обычного покупатель любит носить вещи
export const FIT_PREFS = {
  tight: { label: 'Облегающе', hint: 'по телу, без лишнего запаса', mult: 0.35, extra: 0 },
  regular: { label: 'По фигуре', hint: 'обычная посадка', mult: 1, extra: 0 },
  loose: { label: 'Свободно', hint: 'с запасом, не стесняет', mult: 1.7, extra: 4 },
  oversize: { label: 'Оверсайз', hint: 'заметно шире фигуры', mult: 2.2, extra: 12 },
};
const prefOf = (body) => FIT_PREFS[body?.pref?.fit] || FIT_PREFS.regular;
// Желаемая свобода по зоне с учётом предпочтения
const wantOf = (type, zone, body) => { const e = (EASE[type] || {})[zone] || 0; const p = prefOf(body); return zone === 'waist' && (type === 'pants' || type === 'skirt') ? e * Math.min(p.mult, 1.5) : e * p.mult + p.extra; };

// Тело стандартного российского размера N
export function standardBody(size, gender) {
  const n = Number(size);
  if (!Number.isFinite(n)) return null;
  const chest = 2 * n;
  return gender === 'male'
    ? { chest, waist: chest - 12, hips: chest + 4 }
    : { chest, waist: chest - 18, hips: chest + 8 };
}

// Длина вещи по умолчанию (для роста по сетке): платье — от плеча, верх — от плеча, юбка — от талии, брюки — по шаговому шву
function standardLength(type, gender) {
  const h = gender === 'male' ? 176 : 168;
  return { dress: h * 0.6, top: h * 0.4, outer: h * 0.5, skirt: h * 0.36, pants: h * (gender === 'male' ? 0.465 : 0.455) }[type];
}

// Определяем тип вещи по разделу и названию, если продавец его не указал
export function guessType(p) {
  if (p.garmentType) return p.garmentType;
  const t = (p.title || '').toLowerCase();
  if (p.category === 'Обувь' || /туфл|ботин|кроссов|сапог|кед(ы|ов|ах)?(?![а-яё])|сандал|лофер|мокасин|балетк|тапоч|сабо(?![а-яё])|мюли/.test(t)) return 'shoes';
  if (p.category === 'Аксессуары') return 'none';
  if (/плать|сарафан|абай|туник/.test(t)) return 'dress';
  if (/брюк|штан|джинс|шаровар/.test(t)) return 'pants';
  if (/юбк/.test(t)) return 'skirt';
  if (/куртк|пальто|плащ|пуховик|жакет|пиджак|бешмет|черкеск/.test(t)) return 'outer';
  if (/рубаш|блуз|футбол|свитер|кофт|водолаз|лонгслив|поло|топ\b/.test(t)) return 'top';
  if (p.category === 'Женское' || p.category === 'Национальное') return 'dress';
  if (p.category === 'Мужское') return 'top';
  return 'none';
}

// Полная фигура покупателя: введённые мерки + разумные значения для недостающих
export function bodyFrom(m) {
  const gender = m?.gender === 'male' ? 'male' : 'female';
  const height = num(m?.height_cm) || (gender === 'male' ? 176 : 166);
  const std = standardBody(gender === 'male' ? 48 : 46, gender);
  const chest = num(m?.chest_cm) || std.chest;
  const waist = num(m?.waist_cm) || (num(m?.chest_cm) ? chest - (gender === 'male' ? 12 : 18) : std.waist);
  const hips = num(m?.hips_cm) || (num(m?.chest_cm) ? chest + (gender === 'male' ? 4 : 8) : std.hips);
  const shoulder = num(m?.shoulder_cm) || Math.round(height * (gender === 'male' ? 0.26 : 0.235));
  const inseam = num(m?.inseam_cm) || Math.round(height * (gender === 'male' ? 0.465 : 0.455));
  const shoe = num(m?.shoe_eu);
  // длина стопы: по размеру обуви (EU ≈ длина стельки × 1,5; стелька ≈ стопа + 1,5 см), иначе — по росту
  const footLen = shoe ? Math.round((shoe / 1.5 - 1.5) * 10) / 10 : Math.round(height * 0.15 * 10) / 10;
  const pref = m?.fit_pref && typeof m.fit_pref === 'object' ? m.fit_pref : {};
  const weight = num(m?.weight_kg) || null;
  return { gender, height, weight, chest, waist, hips, shoulder, inseam, shoe, footLen, pref, complete: !!(num(m?.chest_cm) && num(m?.hips_cm) && num(m?.height_cm)) };
}
const num = (v) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : 0; };

// Готовая вещь выбранного размера
export function garmentFor(product, type, size, gender) {
  const chart = product.sizeChart?.[size];
  if (type === 'shoes') { const eu = Number(size); return { length: num(chart?.length) || Math.round((eu / 1.5) * 10) / 10, fromChart: !!num(chart?.length) }; }
  const base = standardBody(size, gender) || standardBody(gender === 'male' ? 48 : 46, gender);
  const ease = EASE[type] || {};
  const g = {};
  for (const z of TYPES[type].zones) g[z] = num(chart?.[z]) || base[z] + (ease[z] || 0);
  g.length = num(chart?.length) || standardLength(type, gender);
  g.fromChart = !!chart;
  return g;
}

// Оценка посадки по зонам: разница «вещь − тело» за вычетом нормальной свободы
export function evaluate(body, garment, type) {
  if (type === 'shoes') return [shoeVerdict(body, garment)];
  const zones = TYPES[type].zones.map((z) => {
    const delta = Math.round(garment[z] - body[z]);
    const want = wantOf(type, z, body);
    const over = delta - Math.max(want * 0.5, want - 6); // запас сверх желаемой свободы (с допуском)
    let status;
    if (delta < -1) status = 'tight';
    else if (delta < 2) status = prefOf(body) === FIT_PREFS.tight ? 'good' : 'snug';
    else if (over <= 10) status = 'good';
    else status = 'loose';
    // сравнение с тем, как покупатель любит носить
    const note = !body.pref?.fit || status === 'tight' ? '' : delta > want + 8 ? 'свободнее, чем вы любите' : delta < want - 6 && body.pref?.fit && body.pref.fit !== 'tight' ? 'плотнее, чем вы любите' : '';
    return { zone: z, delta, status, note };
  });
  zones.push(lengthVerdict(body, garment, type));
  return zones;
}

// Обувь: запас по длине стельки относительно стопы (норма 1–2 см)
function shoeVerdict(body, g) {
  const d = Math.round((g.length - body.footLen) * 10) / 10;
  const status = d < 0.6 ? 'tight' : d < 1 ? 'snug' : d <= 2.3 ? 'good' : 'loose';
  const cm = (v) => String(Math.abs(v)).replace('.', ',');
  const text = status === 'tight' ? (d < 0 ? `меньше стопы на ${cm(d)} см — будет давить` : `запас всего ${cm(d)} см — будет тесно в носке`)
    : status === 'snug' ? `запас ${cm(d)} см — впритык` : status === 'good' ? `запас ${cm(d)} см — удобно` : `запас ${cm(d)} см — нога будет болтаться`;
  return { zone: 'length', delta: d, status, text };
}

function lengthVerdict(body, g, type) {
  const H = body.height;
  if (type === 'pants') {
    const d = Math.round(g.length - body.inseam);
    const cropped = body.pref?.trousers === 'cropped', long = body.pref?.trousers === 'long';
    // любимая длина брюк из опросника
    if (cropped && d >= -2) return { zone: 'length', delta: d, status: 'loose', text: d > 4 ? `длиннее на ${d} см — длиннее, чем вы любите` : 'до обуви — длиннее, чем вы любите' };
    if (cropped && d >= -9) return { zone: 'length', delta: d, status: 'good', text: `короче на ${-d} см — укороченные, как вы любите` };
    if (long && d < -2) return { zone: 'length', delta: d, status: 'tight', text: `короче на ${-d} см — откроют щиколотку, а вы любите длинные` };
    return { zone: 'length', delta: d, status: d > 4 ? 'loose' : d < -4 ? 'tight' : 'good', text: d > 4 ? `длиннее на ${d} см — будут складки внизу` : d < -4 ? `короче на ${-d} см — откроют щиколотку` : 'по длине в самый раз' };
  }
  const top = type === 'skirt' ? H * 0.62 : H * 0.82; // от талии или от плеч
  const hem = top - g.length;
  const knee = H * 0.28, mid = H * 0.18, ankle = H * 0.05, hip = H * 0.48;
  let text;
  if (type === 'top' || type === 'outer') text = hem > hip + 4 ? 'до талии' : hem > H * 0.4 ? 'до бёдер' : hem > knee + 6 ? 'до середины бедра' : 'ниже колена';
  else text = hem <= ankle + 3 ? 'в пол' : hem <= mid ? 'макси, до щиколотки' : hem <= knee - 6 ? 'миди, ниже колена' : hem <= knee + 6 ? 'до колена' : 'выше колена';
  // любимая длина из опросника (для платьев и юбок)
  let status = 'good';
  if ((type === 'dress' || type === 'skirt') && body.pref?.length === 'maxi' && hem > mid) { status = 'loose'; text += ' — короче, чем вы любите'; }
  if ((type === 'dress' || type === 'skirt') && body.pref?.length === 'midi' && hem > knee + 6) { status = 'loose'; text += ' — короче, чем вы любите'; }
  return { zone: 'length', delta: 0, status, text, hem };
}

export const STATUS = {
  tight: { label: 'тесно', color: '#E5534B' },
  snug: { label: 'по фигуре', color: '#7FD79B' },
  good: { label: 'хорошо', color: '#4CC37A' },
  loose: { label: 'свободно', color: '#E6C34A' },
};

// Подбор лучшего размера из доступных: тесное штрафуем сильнее, чем свободное
// Подбор лучшего размера из доступных с учётом того, как покупатель любит носить; между размерами — по его выбору
export function bestSize(product, type, body, sizes) {
  const scored = sizes.map((s) => {
    const g = garmentFor(product, type, s, body.gender);
    if (type === 'shoes') { const d = g.length - body.footLen; return { size: s, score: d < 0.6 ? 10 + (0.6 - d) * 10 : Math.abs(d - 1.5) * 2 }; }
    const score = evaluate(body, g, type).filter((z) => z.zone !== 'length').reduce((acc, z) => {
      const want = wantOf(type, z.zone, body);
      return acc + (z.status === 'tight' ? 10 + Math.abs(z.delta) : 0) + Math.max(0, z.delta - want - 8) / 2 + Math.abs(z.delta - want) * 0.15;
    }, 0);
    return { size: s, score };
  }).sort((a, b) => a.score - b.score);
  if (!scored.length) return null;
  const [a, b] = scored;
  // почти равные варианты соседних размеров — решает ответ «между размерами»
  if (b && b.score - a.score < 0.8 && body.pref?.between) {
    const big = Number(b.size) > Number(a.size) ? b : a, small = big === a ? b : a;
    return (body.pref.between === 'bigger' ? big : small).size;
  }
  return a.size;
}

// Текст для зоны: «свободно на 6 см», «тесно на 3 см»
export function zoneText(z) {
  if (z.zone === 'length') return z.text;
  const tail = z.note ? ' — ' + z.note : '';
  if (z.status === 'tight') return `тесно на ${Math.abs(z.delta)} см`;
  if (z.status === 'snug') return 'сидит по фигуре' + tail;
  if (z.status === 'loose') return `свободно, запас ${z.delta} см` + tail;
  return (z.delta < 2 ? 'облегает, как вы любите' : `хорошо, запас ${z.delta} см`) + tail;
}

// Цвет вещи по названию товара (для манекена)
export function garmentColor(title = '') {
  // только целые слова: иначе «вечЕРНее» находит «черн»
  const t = ' ' + title.toLowerCase().replace(/[^а-яёa-z]+/g, ' ') + ' ';
  const w = (stem) => new RegExp(' (' + stem + ')');
  const map = [[w('чёрн|черн'), '#1d1d1f'], [w('бел|молоч|айвори'), '#efe9dc'], [w('красн|алый|алая|алое'), '#a8262c'], [w('бордо|вишн|марсал'), '#6b1d2a'], [w('син|navy|индиго'), '#22355e'], [w('голуб'), '#6f9bc7'], [w('изумруд|зелён|зелен'), '#1f6b46'], [w('беж|песоч|кэмел'), '#c9ad85'], [w('корич|шоколад'), '#5a3a26'], [w('сер[ыоа]|графит'), '#7a7d82'], [w('золот'), '#c9a24e'], [w('розов|пудр'), '#d9a3ad']];
  for (const [re, c] of map) if (re.test(t)) return c;
  return '#2E6B4A';
}
