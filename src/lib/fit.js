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
  none: { label: 'Не одежда (обувь, аксессуары)', zones: [] },
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
  if (p.category === 'Обувь' || p.category === 'Аксессуары') return 'none';
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
  return { gender, height, chest, waist, hips, shoulder, inseam, complete: !!(num(m?.chest_cm) && num(m?.hips_cm) && num(m?.height_cm)) };
}
const num = (v) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : 0; };

// Готовая вещь выбранного размера
export function garmentFor(product, type, size, gender) {
  const chart = product.sizeChart?.[size];
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
  const ease = EASE[type] || {};
  const zones = TYPES[type].zones.map((z) => {
    const delta = Math.round(garment[z] - body[z]);
    const over = delta - (ease[z] || 0) * 0.5; // запас сверх половины обычной свободы
    let status;
    if (delta < -1) status = 'tight';
    else if (delta < 2) status = 'snug';
    else if (over <= 10) status = 'good';
    else status = 'loose';
    return { zone: z, delta, status };
  });
  zones.push(lengthVerdict(body, garment, type));
  return zones;
}

function lengthVerdict(body, g, type) {
  const H = body.height;
  if (type === 'pants') {
    const d = Math.round(g.length - body.inseam);
    return { zone: 'length', delta: d, status: d > 4 ? 'loose' : d < -4 ? 'tight' : 'good', text: d > 4 ? `длиннее на ${d} см — будут складки внизу` : d < -4 ? `короче на ${-d} см — откроют щиколотку` : 'по длине в самый раз' };
  }
  const top = type === 'skirt' ? H * 0.62 : H * 0.82; // от талии или от плеч
  const hem = top - g.length;
  const knee = H * 0.28, mid = H * 0.18, ankle = H * 0.05, hip = H * 0.48;
  let text;
  if (type === 'top' || type === 'outer') text = hem > hip + 4 ? 'до талии' : hem > H * 0.4 ? 'до бёдер' : hem > knee + 6 ? 'до середины бедра' : 'ниже колена';
  else text = hem <= ankle + 3 ? 'в пол' : hem <= mid ? 'макси, до щиколотки' : hem <= knee - 6 ? 'миди, ниже колена' : hem <= knee + 6 ? 'до колена' : 'выше колена';
  return { zone: 'length', delta: 0, status: 'good', text, hem };
}

export const STATUS = {
  tight: { label: 'тесно', color: '#E5534B' },
  snug: { label: 'по фигуре', color: '#7FD79B' },
  good: { label: 'хорошо', color: '#4CC37A' },
  loose: { label: 'свободно', color: '#E6C34A' },
};

// Подбор лучшего размера из доступных: тесное штрафуем сильнее, чем свободное
export function bestSize(product, type, body, sizes) {
  let best = null;
  for (const s of sizes) {
    const g = garmentFor(product, type, s, body.gender);
    const score = evaluate(body, g, type).filter((z) => z.zone !== 'length').reduce((acc, z) => acc + (z.status === 'tight' ? 10 + Math.abs(z.delta) : z.status === 'loose' ? 2 + Math.max(0, z.delta - 12) / 2 : z.status === 'snug' ? 1 : 0)
      + Math.abs(z.delta - ((EASE[type] || {})[z.zone] || 0)) * 0.15, 0); // ближе к нормальной свободе — лучше
    if (!best || score < best.score) best = { size: s, score };
  }
  return best?.size ?? null;
}

// Текст для зоны: «свободно на 6 см», «тесно на 3 см»
export function zoneText(z) {
  if (z.zone === 'length') return z.text;
  if (z.status === 'tight') return `тесно на ${Math.abs(z.delta)} см`;
  if (z.status === 'snug') return 'сидит по фигуре';
  if (z.status === 'loose') return `свободно, запас ${z.delta} см`;
  return `хорошо, запас ${z.delta} см`;
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
