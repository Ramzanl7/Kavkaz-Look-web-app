import { supabase } from '../lib/supabase.js';
import { cleanQuery, cleanText, escapeLike, isUuid } from '../lib/sanitize.js';
import { makeVariants, squareJpeg } from '../lib/image.js';

// Ответ сервера «слишком часто» (лимит частоты): показываем понятное сообщение один раз для всего приложения.
export const RATE_LIMIT_EVENT = 'kl:rate-limited';
const origFetch = window.fetch.bind(window);
window.fetch = async (...args) => {
  const r = await origFetch(...args);
  if (r.status === 429) window.dispatchEvent(new CustomEvent(RATE_LIMIT_EVENT));
  return r;
};
const CATEGORIES = ['Женское', 'Мужское', 'Национальное', 'Обувь', 'Аксессуары'];
const PARTNER_CATEGORIES = ['food', 'taxi', 'delivery', 'coffee'];
const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const COLS_BASE = 'id,title,price_rub,category,image_path,images,stock,moderation,moderation_reason,garment_type,sizes,size_chart,is_published,rating_avg,rating_count,created_at,boutique_id,boutique:boutiques(name,city)';
// Новые поля (скидка, цвет). Если база ещё не обновлена — один раз переходим на прежний набор, чтобы каталог не ломался.
let COLS = COLS_BASE + ',old_price_rub,color';
const downgrade = (error) => { if (error?.code === '42703' && COLS !== COLS_BASE) { COLS = COLS_BASE; return true; } return false; };
export const PAGE = 20;
export const CITIES = ['Грозный', 'Аргун', 'Гудермес', 'Урус-Мартан', 'Шали', 'Курчалой', 'Ачхой-Мартан', 'Наурская', 'Ведено'];
const SORTS = { new: ['created_at', false], popular: ['rating_count', false], discount: ['created_at', false], price_asc: ['price_rub', true], price_desc: ['price_rub', false], rating: ['rating_avg', false] };
export const COLORS = [['black', 'Чёрный', '#1d1d1f'], ['white', 'Белый', '#f2efe8'], ['beige', 'Бежевый', '#cdb38c'], ['brown', 'Коричневый', '#6b4429'], ['grey', 'Серый', '#8a8d92'], ['blue', 'Синий', '#2b4a86'], ['green', 'Зелёный', '#2f7d52'], ['red', 'Красный', '#b3312f'], ['burgundy', 'Бордовый', '#6b1d2a'], ['pink', 'Розовый', '#e0a3b0'], ['yellow', 'Жёлтый', '#e2c14a'], ['multi', 'Разноцветный', 'conic-gradient(#b3312f, #e2c14a, #2f7d52, #2b4a86, #b3312f)']];
const pub = (path) => supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl;
// Ссылки на фото товара по пути в хранилище (для ответов, где есть только image_path)
export const imageUrls = (path) => (path ? { image: pub(path), thumb: pub(path.replace(/\.jpg$/, '_t.jpg')) } : { image: null, thumb: null });
// Размеры и посадка товара → вид для базы (только числа в разумных пределах)
export function normalizeSizing(v = {}) {
  const types = ['dress', 'top', 'outer', 'pants', 'skirt', 'shoes', 'none'];
  const garment_type = types.includes(v.type) ? v.type : null;
  const sizes = (v.sizes || []).filter((s) => /^[0-9]{2}$/.test(s)).slice(0, 20);
  const chart = {};
  for (const s of sizes) {
    const row = {};
    for (const k of garment_type === 'shoes' ? ['length'] : ['chest', 'waist', 'hips', 'length']) {
      const n = Number(String(v.chart?.[s]?.[k] ?? '').replace(',', '.'));
      if (garment_type === 'shoes') { if (n >= 15 && n <= 35) row[k] = Math.round(n * 2) / 2; } // длина стельки, шаг 0,5 см
      else if (Number.isInteger(n) && n >= 20 && n <= 250) row[k] = n;
    }
    if (Object.keys(row).length) chart[s] = row;
  }
  return { garment_type, sizes: garment_type === 'none' ? [] : sizes, size_chart: garment_type !== 'none' && Object.keys(chart).length ? chart : null };
}
const toProduct = (r) => ({
  id: r.id, title: r.title, price: r.price_rub, category: r.category, description: r.description ?? '', boutique: r.boutique?.name ?? '', published: r.is_published,
  rating: Number(r.rating_avg) || 0, ratingCount: r.rating_count || 0, boutiqueId: r.boutique_id ?? null, city: r.boutique?.city ?? '',
  isNew: r.created_at ? Date.now() - new Date(r.created_at).getTime() < 14 * 864e5 : false,
  garmentType: r.garment_type ?? null, sizes: r.sizes ?? [], sizeChart: r.size_chart ?? null,
  image: r.image_path ? pub(r.image_path) : null, thumb: r.image_path ? pub(r.image_path.replace(/\.jpg$/, '_t.jpg')) : null,
  photos: (r.images?.length ? r.images : r.image_path ? [r.image_path] : []).map((x) => ({ path: x, image: pub(x), thumb: pub(x.replace(/\.jpg$/, '_t.jpg')) })),
  oldPrice: r.old_price_rub > r.price_rub ? r.old_price_rub : null, color: r.color || null,
  stock: r.stock && typeof r.stock === 'object' ? r.stock : null, blocked: r.moderation === 'blocked', blockReason: r.moderation_reason || '',
});
const BQ_COLS_BASE = 'id,name,description,city,logo_path,cover_path,address,hours,phone,whatsapp,telegram,delivery_pickup,delivery_courier,courier_note';
const BQ_LEVELS = [BQ_COLS_BASE + ',allow_reserve,delivery_fee_city,delivery_fee_region,free_delivery_from', BQ_COLS_BASE + ',allow_reserve', BQ_COLS_BASE];
let BQ_COLS = BQ_LEVELS[0];
const ORDER_LEVELS = [',hold_until,subtotal_rub,discount_rub,promo_code,discount_by,accepted_at,closed_at,closed_by,unpaid_at,unpaid_resolved_at,paid_claim_at,delivery_fee_rub', ',hold_until,subtotal_rub,discount_rub,promo_code,discount_by,accepted_at,closed_at,closed_by,unpaid_at,unpaid_resolved_at,paid_claim_at', ',hold_until,subtotal_rub,discount_rub,promo_code,discount_by', ',hold_until', ''];
let ORDER_EXTRA = ORDER_LEVELS[0];
// новые поля могут ещё отсутствовать в базе — тогда работаем без них
const downgradeBq = (error) => { const i = BQ_LEVELS.indexOf(BQ_COLS); if (error?.code === '42703' && i < BQ_LEVELS.length - 1) { BQ_COLS = BQ_LEVELS[i + 1]; return true; } return false; };
const downgradeOrders = (error) => { const i = ORDER_LEVELS.indexOf(ORDER_EXTRA); if (error?.code === '42703' && i < ORDER_LEVELS.length - 1) { ORDER_EXTRA = ORDER_LEVELS[i + 1]; return true; } return false; };
const toBoutique = (r) => ({ ...r, logo: r.logo_path ? pub(r.logo_path.replace(/\.jpg$/, '_t.jpg')) : null, cover: r.cover_path ? pub(r.cover_path) : null });
const PROMO_ERR = { invalid: 'Такого промокода нет или он закончился.', not_applicable: 'Промокод не действует на эти товары.', exhausted: 'Промокод закончился.', used: 'Вы уже использовали этот промокод.', first_order: 'Промокод только для первого заказа.', login: 'Войдите, чтобы применить промокод.' };
const toCollection = (r) => ({ ...r, cover: r.cover_path ? supabase.storage.from('brand-media').getPublicUrl(r.cover_path).data.publicUrl : null });
const brandUrl = (path) => (path ? supabase.storage.from('brand-media').getPublicUrl(path).data.publicUrl : null);
const toBrand = (r) => ({ ...r, banner: brandUrl(r.banner_path), logo: brandUrl(r.logo_path) });
// Кэш на 60 секунд: каталог открывается мгновенно, данные обновляются в фоне.
const lists = new Map(), products = new Map();
const keyOf = (o) => [o.query ?? '', o.category ?? '', o.boutiqueId ?? '', o.sort ?? 'new', o.minPrice ?? '', o.maxPrice ?? '', o.size ?? '', o.city ?? '', o.color ?? ''].join('|');

// Приводит контакты поддержки к виду, который принимает база. Пустое поле = канал скрыт.
const PHONE = /^\+?[0-9]{10,15}$/;
export function normalizeContacts(c = {}) {
  const phone = (x) => cleanText(x, 30).replace(/[\s()-]/g, '');
  const data = {
    telegram: cleanText(c.telegram, 40).replace(/^(https?:\/\/)?(t\.me\/)?@?/i, ''),
    whatsapp: phone(c.whatsapp), phone: phone(c.phone), sms: phone(c.sms),
    email: cleanText(c.email, 254), hours: cleanText(c.hours, 80),
  };
  if (data.telegram && !/^[A-Za-z0-9_]{5,32}$/.test(data.telegram)) return { error: 'Telegram: только латиница, цифры и _, от 5 до 32 символов' };
  for (const [k, n] of [['whatsapp', 'WhatsApp'], ['phone', 'Телефон'], ['sms', 'SMS']]) if (data[k] && !PHONE.test(data[k])) return { error: n + ': номер из 10–15 цифр, например +79281234567' };
  if (data.email && !/^[^@\s]{1,64}@[^@\s]{1,190}\.[A-Za-z]{2,}$/.test(data.email)) return { error: 'Почта указана неверно' };
  for (const k in data) if (!data[k]) data[k] = null;
  return { data };
}

// Слой данных. Запросы строятся только через параметры клиента Supabase, SQL из ввода не собирается.
export const api = {
  imageUrls,
  peekList(o = {}) { const v = lists.get(keyOf(o)); return v && Date.now() - v.t < 60000 ? v.data : null; },
  peekProduct(id) { return products.get(id) ?? null; },
  // Каталог: постранично (по PAGE), фильтры — раздел, цена, размер, город бутика; поиск — по названию товара и по бутику
  async listProducts({ query = '', category = '', boutiqueId = '', sort = 'new', page = 0, minPrice = '', maxPrice = '', size = '', city = '', color = '' } = {}) {
    const [col, asc] = SORTS[sort] || SORTS.new;
    const byCity = CITIES.includes(city);
    let req = supabase.from('products').select(byCity ? COLS.replace('boutique:boutiques(name,city)', 'boutique:boutiques!inner(name,city)') : COLS)
      .order(col, { ascending: asc }).order('id').range(page * PAGE, page * PAGE + PAGE - 1);
    const q = cleanQuery(query);
    if (q) {
      const like = '%' + escapeLike(q) + '%';
      const { data: bs } = await supabase.from('boutiques').select('id').eq('is_approved', true).ilike('name', like).limit(20);
      const ids = (bs || []).map((b) => b.id).filter(isUuid);
      req = ids.length ? req.or(`title.ilike.${JSON.stringify(like)},boutique_id.in.(${ids.join(',')})`) : req.ilike('title', like);
    }
    if (CATEGORIES.includes(category)) req = req.eq('category', category);
    if (isUuid(boutiqueId)) req = req.eq('boutique_id', boutiqueId);
    const lo = Math.max(0, Math.round(Number(minPrice) || 0)), hi = Math.round(Number(maxPrice) || 0);
    if (lo) req = req.gte('price_rub', lo);
    if (hi > 0) req = req.lte('price_rub', hi);
    if (/^[0-9]{2}$/.test(String(size))) req = req.contains('sizes', [String(size)]);
    if (byCity) req = req.eq('boutique.city', city);
    if (COLORS.some(([c]) => c === color) && COLS !== COLS_BASE) req = req.eq('color', color);
    if (sort === 'discount' && COLS !== COLS_BASE) req = req.not('old_price_rub', 'is', null);
    const { data, error } = await req;
    if (downgrade(error)) return api.listProducts(arguments[0]);
    if (error || !data) return page ? [] : null;
    const list = data.map(toProduct);
    if (!page) lists.set(keyOf({ query, category, boutiqueId, sort, minPrice, maxPrice, size, city, color }), { t: Date.now(), data: list });
    list.forEach((p) => products.set(p.id, p));
    return list;
  },
  // Подсказки поиска: товары, бутики и местные бренды по началу/части названия
  async suggest(query) {
    const q = cleanQuery(query);
    if (q.length < 2) return [];
    const like = '%' + escapeLike(q) + '%';
    const [p, b, l] = await Promise.all([
      supabase.from('products').select('id,title').ilike('title', like).limit(5),
      supabase.from('boutiques').select('id,name').eq('is_approved', true).ilike('name', like).limit(3),
      supabase.from('local_brands').select('id,name').ilike('name', like).limit(3),
    ]);
    return [
      ...(p.data || []).map((x) => ({ kind: 'product', id: x.id, label: x.title })),
      ...(b.data || []).map((x) => ({ kind: 'boutique', id: x.id, label: x.name })),
      ...(l.data || []).map((x) => ({ kind: 'brand', id: x.id, label: x.name })),
    ];
  },
  async listProductsByIds(ids) {
    const ok = (ids || []).filter(isUuid).slice(0, 50);
    if (!ok.length) return [];
    const { data, error } = await supabase.from('products').select(COLS).in('id', ok);
    if (downgrade(error)) return api.listProductsByIds(ids);
    if (error || !data) return [];
    const map = new Map(data.map((r) => [r.id, toProduct(r)]));
    return ok.map((id) => map.get(id)).filter(Boolean);
  },
  // ===== Админка: местные бренды и рекламные размещения =====
  async adminListBrands() {
    const { data, error } = await supabase.from('local_brands').select('*').order('sort').order('created_at', { ascending: false }).limit(100);
    return error || !data ? [] : data.map(toBrand);
  },
  async adminSaveBrand(b, files = {}) {
    const url = (v) => { let t = cleanText(v, 300); if (t && !/^https?:\/\//i.test(t)) t = 'https://' + t; t = t.replace(/^http:\/\//i, 'https://'); return t ? (/^https:\/\/[^\s<>"]{3,300}$/.test(t) ? t : undefined) : null; };
    const row = {
      name: cleanText(b.name, 60), description: cleanText(b.description, 140) || null,
      boutique_id: isUuid(b.boutique_id) ? b.boutique_id : null,
      site_url: url(b.site_url), ios_url: url(b.ios_url), android_url: url(b.android_url),
      starts_at: b.starts_at ? new Date(String(b.starts_at).length === 10 ? b.starts_at + 'T00:00:00' : b.starts_at).toISOString() : new Date().toISOString(),
      ends_at: b.ends_at ? new Date(String(b.ends_at).length === 10 ? b.ends_at + 'T23:59:59' : b.ends_at).toISOString() : null,
      is_approved: !!b.is_approved, sort: Math.max(-99, Math.min(99, Math.round(Number(b.sort) || 0))),
    };
    if (row.name.length < 2) return 'Укажите название бренда.';
    if ([row.site_url, row.ios_url, row.android_url].includes(undefined)) return 'Ссылки должны начинаться с https://';
    const id = isUuid(b.id) ? b.id : crypto.randomUUID();
    for (const kind of ['banner', 'logo']) {
      const f = files[kind];
      if (!f) continue;
      const v = await makeVariants(f);
      if (!v) return 'Не удалось обработать изображение.';
      const path = `brands/${id}-${kind}.jpg`;
      const { error } = await supabase.storage.from('brand-media').upload(path, kind === 'banner' ? v.main : v.thumb, { contentType: 'image/jpeg', upsert: !!b[kind + '_path'] });
      if (error) return 'Не удалось загрузить изображение' + (/policy|security|403|Unauthorized/i.test(error.message || '') ? ': нет прав (выполните последний SQL).' : '. Попробуйте фото поменьше.');
      row[kind + '_path'] = path;
    }
    const { error } = isUuid(b.id) ? await supabase.from('local_brands').update(row).eq('id', b.id) : await supabase.from('local_brands').insert({ id, ...row });
    return error ? (error.code === '23514' ? 'Проверьте даты и ссылки.' : 'Не удалось сохранить бренд.') : '';
  },
  async adminDeleteBrand(id) {
    if (!isUuid(id)) return false;
    await supabase.storage.from('brand-media').remove([`brands/${id}-banner.jpg`, `brands/${id}-logo.jpg`]);
    const { error } = await supabase.from('local_brands').delete().eq('id', id);
    return !error;
  },
  async adminListPromotions() {
    const { data, error } = await supabase.from('promotions').select('*,product:products(id,title,price_rub,is_published)').order('ends_at', { ascending: false }).limit(100);
    return error || !data ? [] : data;
  },
  async adminSavePromotion(p) {
    const row = {
      product_id: p.product_id, advertiser: cleanText(p.advertiser, 120), advertiser_inn: cleanText(p.advertiser_inn, 12) || null,
      erid: cleanText(p.erid, 40) || null, starts_at: p.starts_at ? new Date(String(p.starts_at).length === 10 ? p.starts_at + 'T00:00:00' : p.starts_at).toISOString() : new Date().toISOString(),
      ends_at: p.ends_at ? new Date(String(p.ends_at).length === 10 ? p.ends_at + 'T23:59:59' : p.ends_at).toISOString() : null, sort: Math.max(-99, Math.min(99, Math.round(Number(p.sort) || 0))),
    };
    if (!isUuid(row.product_id)) return 'Выберите товар.';
    if (row.advertiser.length < 2) return 'Укажите рекламодателя.';
    if (!row.ends_at) return 'Укажите дату окончания.';
    if (row.advertiser_inn && !/^[0-9]{10}([0-9]{2})?$/.test(row.advertiser_inn)) return 'ИНН — 10 или 12 цифр.';
    if (row.erid && !/^[A-Za-z0-9]{6,40}$/.test(row.erid)) return 'Токен erid — латинские буквы и цифры.';
    const { error } = isUuid(p.id) ? await supabase.from('promotions').update(row).eq('id', p.id) : await supabase.from('promotions').insert(row);
    return error ? (error.code === '23514' ? 'Дата окончания должна быть позже начала.' : 'Не удалось сохранить размещение.') : '';
  },
  async adminDeletePromotion(id) {
    if (!isUuid(id)) return false;
    const { error } = await supabase.from('promotions').delete().eq('id', id);
    return !error;
  },
  async adminFindProducts(query) {
    const q = cleanQuery(query);
    let req = supabase.from('products').select('id,title,price_rub,boutique:boutiques(name)').eq('is_published', true).order('created_at', { ascending: false }).limit(20);
    if (q) req = req.ilike('title', '%' + escapeLike(q) + '%');
    const { data } = await req;
    return data || [];
  },
  // «Сделано рядом»: одобренные бренды в сроке показа (сроки и модерацию проверяет база)
  async listLocalBrands() {
    const { data, error } = await supabase.from('local_brands').select('id,name,description,banner_path,logo_path,boutique_id,site_url,ios_url,android_url,sort').order('sort').order('created_at', { ascending: false }).limit(30);
    return error || !data ? [] : data.map(toBrand);
  },
  // «Популярное сейчас»: сначала оплаченные размещения (с маркировкой), затем самые популярные товары без рекламы
  async listPopular() {
    const { data, error } = await supabase.from('promotions').select('id,advertiser,advertiser_inn,erid,sort,product:products!inner(' + COLS + ')').order('sort').limit(10);
    if (downgrade(error)) return api.listPopular();
    const ads = (data || []).filter((r) => r.product?.is_published === true).map((r) => ({ ...toProduct(r.product), ad: { advertiser: r.advertiser, inn: r.advertiser_inn, erid: r.erid } }));
    const seen = new Set(ads.map((p) => p.id));
    const { data: top } = await supabase.from('products').select(COLS).eq('is_published', true).order('rating_count', { ascending: false }).order('created_at', { ascending: false }).limit(12);
    const organic = (top || []).map(toProduct).filter((p) => !seen.has(p.id));
    const list = [...ads, ...organic].slice(0, 12);
    list.forEach((p) => products.set(p.id, p));
    return list;
  },
  async getProduct(id) {
    if (!isUuid(id)) return null;
    const { data, error } = await supabase.from('products').select(COLS + ',description').eq('id', id).maybeSingle();
    if (downgrade(error)) return api.getProduct(id);
    if (error || !data) return null;
    const p = toProduct(data);
    products.set(p.id, p);
    return p;
  },
  async listBoutiques() {
    let { data, error } = await supabase.from('boutiques').select('id,name,description,city,logo_path,cover_path').eq('is_approved', true).order('created_at', { ascending: false }).limit(50);
    if (error?.code === '42703') ({ data, error } = await supabase.from('boutiques').select('id,name,description,city').eq('is_approved', true).order('created_at', { ascending: false }).limit(50));
    return error || !data ? [] : data.map(toBoutique);
  },
  async getBoutique(id) {
    if (!isUuid(id)) return null;
    let { data, error } = await supabase.from('boutiques').select(BQ_COLS).eq('id', id).eq('is_approved', true).maybeSingle();
    if (downgradeBq(error)) return api.getBoutique(id);
    if (error?.code === '42703') ({ data, error } = await supabase.from('boutiques').select('id,name,description,city').eq('id', id).eq('is_approved', true).maybeSingle());
    return error || !data ? null : toBoutique(data);
  },
  async listWishlist() {
    const { data, error } = await supabase.from('wishlist').select('product:products(' + COLS + ')').limit(100);
    if (downgrade(error)) return api.listWishlist();
    return error || !data ? [] : data.map((r) => r.product).filter(Boolean).map(toProduct);
  },
  async listWishedIds() {
    const { data, error } = await supabase.from('wishlist').select('product_id').limit(500);
    return error || !data ? [] : data.map((r) => r.product_id);
  },
  async listReviews(productId) {
    if (!isUuid(productId)) return [];
    let { data, error } = await supabase.from('reviews').select('id,user_id,author_name,rating,body,created_at,reply,reply_at').eq('product_id', productId).order('created_at', { ascending: false }).limit(50);
    if (error?.code === '42703') ({ data, error } = await supabase.from('reviews').select('id,user_id,author_name,rating,body,created_at').eq('product_id', productId).order('created_at', { ascending: false }).limit(50));
    return error || !data ? [] : data;
  },
  async addReview(productId, stars, text) {
    if (!isUuid(productId) || !Number.isInteger(stars) || stars < 1 || stars > 5) return { ok: false, error: 'Проверьте оценку.' };
    const { error } = await supabase.rpc('add_review', { pid: productId, stars, txt: cleanText(text, 1000) });
    if (!error) return { ok: true };
    return { ok: false, error: String(error.message).includes('purchase') ? 'Отзыв можно оставить после того, как заказ с этим товаром выполнен.' : 'Не удалось сохранить отзыв.' };
  },
  async deleteReview(id) {
    if (!isUuid(id)) return false;
    const { error } = await supabase.from('reviews').delete().eq('id', id);
    return !error;
  },
  async getProfileName(userId) {
    if (!isUuid(userId)) return '';
    const { data } = await supabase.from('profiles').select('display_name').eq('id', userId).maybeSingle();
    return data?.display_name ?? '';
  },
  async setProfileName(userId, name) {
    if (!isUuid(userId)) return false;
    const { error } = await supabase.from('profiles').update({ display_name: cleanText(name, 60) || null }).eq('id', userId);
    return !error;
  },
  // ===== Мой профиль: имя, телефон, город, адрес, аватарка =====
  async getMyProfile(userId) {
    if (!isUuid(userId)) return null;
    let { data, error } = await supabase.from('profiles').select('display_name,phone,city,address,avatar_path,created_at').eq('id', userId).maybeSingle();
    if (error?.code === '42703') ({ data, error } = await supabase.from('profiles').select('display_name,created_at').eq('id', userId).maybeSingle());
    if (error || !data) return null;
    let avatar = null;
    if (data.avatar_path) {
      const { data: u } = await supabase.storage.from('avatars').createSignedUrl(data.avatar_path, 3600);
      avatar = u?.signedUrl || null;
    }
    return { name: data.display_name || '', phone: data.phone || '', city: data.city || '', address: data.address || '', avatarPath: data.avatar_path || null, avatar, since: data.created_at, extended: 'phone' in data };
  },
  async saveMyProfile(userId, { name, phone, city, address }) {
    if (!isUuid(userId)) return 'Нужно войти в аккаунт';
    const digits = String(phone || '').replace(/\D/g, '');
    if (digits && digits.length !== 11) return 'Введите номер полностью или оставьте поле пустым';
    const a = cleanText(address, 200);
    if (a && a.length < 5) return 'Адрес слишком короткий';
    const row = { display_name: cleanText(name, 60) || null, phone: digits ? '+7' + digits.slice(1) : null, city: CITIES.includes(city) ? city : null, address: a || null };
    const { error } = await supabase.from('profiles').update(row).eq('id', userId);
    if (!error) return '';
    if (String(error.message).includes('rate')) return 'Имя меняли слишком часто — попробуйте позже';
    if (error.code === '42703') return 'Обновление ещё не включено на сервере';
    return 'Не удалось сохранить';
  },
  async setAvatar(userId, file, oldPath) {
    if (!isUuid(userId) || !file) return { error: 'Нет файла' };
    if (!/^image\//.test(file.type) || file.size > 25 * 1024 * 1024) return { error: 'Выберите фото (до 25 МБ)' };
    const blob = await squareJpeg(file, 512);
    if (!blob) return { error: 'Не удалось обработать фото' };
    const path = `${userId}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.jpg`;
    const { error: e1 } = await supabase.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (e1) return { error: 'Не удалось загрузить фото' };
    const { error: e2 } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', userId);
    if (e2) { await supabase.storage.from('avatars').remove([path]); return { error: 'Не удалось сохранить фото' }; }
    if (oldPath) await supabase.storage.from('avatars').remove([oldPath]);
    const { data: u } = await supabase.storage.from('avatars').createSignedUrl(path, 3600);
    return { path, url: u?.signedUrl || URL.createObjectURL(blob) };
  },
  async removeAvatar(userId, path) {
    if (!isUuid(userId)) return false;
    const { error } = await supabase.from('profiles').update({ avatar_path: null }).eq('id', userId);
    if (error) return false;
    if (path) await supabase.storage.from('avatars').remove([path]);
    return true;
  },
  async changePassword(pw) {
    if (String(pw).length < 8) return 'Пароль — не короче 8 символов';
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (!error) return '';
    if (/same/i.test(error.message)) return 'Новый пароль совпадает со старым';
    if (/weak|short|pwned/i.test(error.message)) return 'Пароль слишком простой — добавьте цифры и буквы';
    return 'Не удалось сменить пароль';
  },
  async setOrderStatus(orderId, status) {
    if (!isUuid(orderId) || !['confirmed', 'done', 'cancelled'].includes(status)) return false;
    const { error } = await supabase.rpc('set_order_status', { oid: orderId, new_status: status });
    return !error;
  },
  async isWished(productId) {
    if (!isUuid(productId)) return false;
    const { data } = await supabase.from('wishlist').select('product_id').eq('product_id', productId).maybeSingle();
    return !!data;
  },
  async setWished(productId, on) {
    if (!isUuid(productId)) return false;
    const { error } = on ? await supabase.from('wishlist').insert({ product_id: productId }) : await supabase.from('wishlist').delete().eq('product_id', productId);
    return !error;
  },
  async createRoleRequest(boutiqueName) {
    const name = cleanText(boutiqueName, 80);
    if (name.length < 2) return false;
    const { error } = await supabase.from('role_requests').insert({ boutique_name: name });
    return !error;
  },
  async createPartnerRequest({ brand, category, contact }) {
    const b = cleanText(brand, 80), c = cleanText(contact, 120);
    if (b.length < 2 || c.length < 3 || !PARTNER_CATEGORIES.includes(category)) return false;
    const { error } = await supabase.from('partner_requests').insert({ brand_name: b, category, contact: c });
    return !error;
  },
  async listPartners(category) {
    if (!PARTNER_CATEGORIES.includes(category)) return [];
    const { data, error } = await supabase.from('partners').select('id,name,description').eq('category', category).eq('is_approved', true).limit(50);
    return error || !data ? [] : data;
  },
  // ===== Продавец =====
  async getMyBoutique(userId) {
    if (!isUuid(userId)) return null;
    let { data, error } = await supabase.from('boutiques').select(BQ_COLS + ',is_approved').eq('owner_id', userId).limit(1).maybeSingle();
    if (downgradeBq(error)) return api.getMyBoutique(userId);
    if (error?.code === '42703') ({ data } = await supabase.from('boutiques').select('id,name,description,city,is_approved').eq('owner_id', userId).limit(1).maybeSingle());
    return data ? toBoutique(data) : null;
  },
  // Профиль бутика (владелец): описание, адрес, часы, контакты, доставка, логотип и обложка
  async saveBoutique(id, b) {
    if (!isUuid(id)) return 'Бутик не найден.';
    const digits = (v, min, max) => { const d = String(v || '').replace(/[^0-9]/g, ''); return d ? (d.length >= min && d.length <= max ? d : undefined) : null; };
    const phone = String(b.phone || '').replace(/[^0-9+]/g, '');
    const tg = String(b.telegram || '').trim().replace(/^@/, '').replace(/^https?:\/\/t\.me\//, '');
    const row = {
      description: cleanText(b.description, 1000) || null, city: CITIES.includes(b.city) ? b.city : null,
      address: cleanText(b.address, 200) || null, hours: cleanText(b.hours, 100) || null,
      phone: phone ? (/^\+?[0-9]{10,15}$/.test(phone) ? phone : undefined) : null,
      whatsapp: digits(b.whatsapp, 10, 15), telegram: tg ? (/^[A-Za-z0-9_]{5,32}$/.test(tg) ? tg : undefined) : null,
      delivery_pickup: !!b.delivery_pickup, delivery_courier: !!b.delivery_courier, courier_note: cleanText(b.courier_note, 150) || null,
    };
    if (BQ_COLS !== BQ_COLS_BASE && b.allow_reserve !== undefined) row.allow_reserve = !!b.allow_reserve;
    // цены доставки: пусто — «сообщит бутик»
    if (BQ_COLS === BQ_LEVELS[0]) {
      const num = (v, max) => { const d = String(v ?? '').replace(/[^0-9]/g, ''); if (!d) return null; const n = Number(d); return n <= max ? n : undefined; };
      row.delivery_fee_city = num(b.delivery_fee_city, 10000); row.delivery_fee_region = num(b.delivery_fee_region, 20000);
      const free = num(b.free_delivery_from, 1000000); row.free_delivery_from = free === 0 ? null : free;
      if ([row.delivery_fee_city, row.delivery_fee_region, row.free_delivery_from].includes(undefined)) return 'Проверьте цены доставки.';
    }
    if (row.phone === undefined) return 'Проверьте телефон.';
    if (row.whatsapp === undefined) return 'WhatsApp — номер из 10–15 цифр.';
    if (row.telegram === undefined) return 'Telegram — имя пользователя латиницей (5–32 символа).';
    if (!row.delivery_pickup && !row.delivery_courier) return 'Выберите хотя бы один способ получения.';
    for (const kind of ['logo', 'cover']) if (b[kind + '_path'] !== undefined) row[kind + '_path'] = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/.test(b[kind + '_path'] || '') ? b[kind + '_path'] : null;
    const { error } = await supabase.from('boutiques').update(row).eq('id', id);
    return error ? 'Не удалось сохранить.' : '';
  },
  // ===== Статистика продавца =====
  trackView(id) { if (isUuid(id)) supabase.rpc('track_view', { pid: id }).then(() => {}, () => {}); },
  async sellerStats(days = 30) {
    const { data, error } = await supabase.rpc('seller_stats', { days });
    return error ? null : data;
  },
  // ===== Жалобы =====
  async report(targetType, targetId, reason, body) {
    if (!['product', 'review', 'boutique'].includes(targetType) || !isUuid(targetId)) return 'Не удалось отправить.';
    const { error } = await supabase.from('reports').insert({ target_type: targetType, target_id: targetId, reason, body: cleanText(body, 500) || null });
    return error ? (error.code === '23505' ? 'Вы уже пожаловались — мы рассматриваем.' : 'Не удалось отправить.') : '';
  },
  // ===== Админ: модерация, заказы, жалобы, рассылка, обороты =====
  async adminListProducts({ query = '', blocked = false } = {}) {
    let req = supabase.from('products').select('id,title,price_rub,image_path,is_published,moderation,moderation_reason,created_at,boutique:boutiques(id,name)').order('created_at', { ascending: false }).limit(60);
    const q = cleanQuery(query);
    if (q) req = req.ilike('title', '%' + escapeLike(q) + '%');
    if (blocked) req = req.eq('moderation', 'blocked');
    const { data } = await req;
    return (data || []).map((r) => ({ ...r, ...imageUrls(r.image_path) }));
  },
  async adminModerateProduct(id, block, reason) {
    const { error } = await supabase.rpc('admin_moderate_product', { pid: id, block, reason: cleanText(reason, 300) || null });
    return !error;
  },
  async adminListReviews(onlyHidden = false) {
    let req = supabase.from('reviews').select('id,rating,body,author_name,hidden,created_at,product:products(id,title)').order('created_at', { ascending: false }).limit(60);
    if (onlyHidden) req = req.eq('hidden', true);
    const { data } = await req;
    return data || [];
  },
  async adminHideReview(id, hide) { const { error } = await supabase.rpc('admin_hide_review', { rid: id, hide }); return !error; },
  async adminListOrders(status = '') {
    let req = supabase.from('orders').select('id,status,total_rub,created_at,delivery,boutique:boutiques(id,name),items:order_items(title,qty,size)').order('created_at', { ascending: false }).limit(100);
    if (['new', 'confirmed', 'done', 'cancelled'].includes(status)) req = req.eq('status', status);
    const { data } = await req;
    return data || [];
  },
  async adminListReports(status = 'open') {
    const { data } = await supabase.from('reports').select('id,target_type,target_id,reason,body,status,created_at').eq('status', status).order('created_at', { ascending: false }).limit(100);
    return data || [];
  },
  async adminResolveReport(id, status) {
    const { error } = await supabase.from('reports').update({ status, resolved_at: new Date().toISOString() }).eq('id', id);
    return !error;
  },
  async adminBroadcast(title, body, audience, link) {
    const { data, error } = await supabase.rpc('admin_broadcast', { title: cleanText(title, 120), body: cleanText(body, 300), audience, link: /^\/[A-Za-z0-9/_-]*$/.test(link || '') ? link : '/home' });
    return error ? null : data;
  },
  async adminFinance(days = 30) {
    const since = new Date(Date.now() - days * 864e5).toISOString();
    const [{ data: orders }, { data: promos }] = await Promise.all([
      supabase.from('orders').select('status,total_rub' + (ORDER_EXTRA.includes('discount') ? ',discount_rub,discount_by' : '') + ',boutique:boutiques(id,name)').gte('created_at', since).limit(5000),
      supabase.from('promotions').select('advertiser,starts_at,ends_at,product:products(boutique_id)').gte('ends_at', since).limit(500),
    ]);
    const by = new Map();
    for (const o of orders || []) {
      const k = o.boutique?.id || '—';
      const r = by.get(k) || { id: k, name: o.boutique?.name || 'Без бутика', done: 0, revenue: 0, active: 0, cancelled: 0, promos: 0, owed: 0 };
      if (o.status === 'done') { r.done++; r.revenue += o.total_rub; if (o.discount_by === 'platform') r.owed += o.discount_rub || 0; } else if (o.status === 'cancelled') r.cancelled++; else r.active++;
      by.set(k, r);
    }
    for (const p of promos || []) { const r = by.get(p.product?.boutique_id); if (r) r.promos++; }
    return [...by.values()].sort((a, b) => b.revenue - a.revenue);
  },
  // Фото товара: сжимается на телефоне, основное + превью; путь — в папке бутика
  async uploadProductPhoto(boutiqueId, file) {
    if (!isUuid(boutiqueId) || !file) return { error: 'Нет фото.' };
    if (!IMAGE_TYPES[file.type] || file.size > 25 * 1024 * 1024) return { error: 'Фото: jpeg, png или webp.' };
    const v = await makeVariants(file);
    if (!v) return { error: 'Не удалось обработать фото.' };
    const base = boutiqueId + '/' + crypto.randomUUID();
    const put = (name, blob) => supabase.storage.from('product-images').upload(name, blob, { contentType: 'image/jpeg', upsert: false });
    const [a, b] = await Promise.all([put(base + '.jpg', v.main), put(base + '_t.jpg', v.thumb)]);
    if (a.error || b.error) return { error: 'Не удалось загрузить фото.' };
    return { path: base + '.jpg' };
  },
  async removeProductPhotos(paths) {
    const ok = (paths || []).filter((x) => /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/.test(x));
    if (ok.length) await supabase.storage.from('product-images').remove(ok.flatMap((x) => [x, x.replace(/\.jpg$/, '_t.jpg')]));
  },
  // Создание и правка товара: название, цена, раздел, описание, до 6 фото, размеры и остатки
  async saveProduct({ id, boutiqueId, title, price, category, description, photos = [], sizing, stock, oldPrice, color }) {
    const t = cleanText(title, 120), d = cleanText(description, 2000), p = Number(price);
    if (!isUuid(boutiqueId) || t.length < 2 || !Number.isInteger(p) || p < 1 || p > 10000000 || !CATEGORIES.includes(category)) return { ok: false, error: 'Проверьте название, цену и раздел.' };
    const images = photos.filter((x) => /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/.test(x)).slice(0, 6);
    const sz = normalizeSizing(sizing);
    // остатки: целые 0…9999 по размерам из списка (или «_» без размеров); пустые поля — не ведём
    let st = null;
    if (stock && typeof stock === 'object') {
      const keys = sz.sizes?.length ? sz.sizes : ['_'];
      const o = {};
      for (const k of keys) { const v = String(stock[k] ?? '').trim(); if (/^[0-9]{1,4}$/.test(v)) o[k] = Number(v); }
      st = Object.keys(o).length ? o : null;
    }
    const row = { title: t, description: d || null, price_rub: p, category, images, image_path: images[0] || null, stock: st, ...sz };
    const op = Number(oldPrice);
    if (oldPrice !== undefined && COLS !== COLS_BASE) {
      if (oldPrice !== '' && oldPrice != null && (!Number.isInteger(op) || op <= p)) return { ok: false, error: 'Старая цена должна быть больше новой.' };
      row.old_price_rub = Number.isInteger(op) && op > p ? op : null;
      row.color = COLORS.some(([c]) => c === color) ? color : null;
    }
    const { error } = isUuid(id) ? await supabase.from('products').update(row).eq('id', id) : await supabase.from('products').insert({ boutique_id: boutiqueId, ...row });
    if (error) return { ok: false, error: 'Не удалось сохранить товар.' };
    products.delete(id); lists.clear();
    return { ok: true };
  },
  async createProduct({ boutiqueId, title, price, category, description, file, sizing }) {
    let photos = [];
    if (file) { const r = await this.uploadProductPhoto(boutiqueId, file); if (r.error) return { ok: false, error: r.error }; photos = [r.path]; }
    return this.saveProduct({ boutiqueId, title, price, category, description, photos, sizing });
  },
  // ===== Заявки бутиков с лендинга /sell (без регистрации) =====
  async submitBoutiqueLead(f) {
    const phone = String(f.phone || '').replace(/[^0-9+]/g, '');
    if (cleanText(f.boutique, 80).length < 2) return 'Укажите название бутика.';
    if (!/^\+?[0-9]{10,15}$/.test(phone)) return 'Проверьте номер телефона.';
    const { error } = await supabase.rpc('submit_boutique_lead', {
      p_boutique: cleanText(f.boutique, 80), p_contact: cleanText(f.contact, 60), p_phone: phone,
      p_instagram: cleanText(f.instagram, 60), p_city: CITIES.includes(f.city) ? f.city : null,
      p_categories: Array.isArray(f.kinds) ? f.kinds.slice(0, 6) : [], p_comment: cleanText(f.comment, 500),
    });
    if (!error) return '';
    if (/too many/.test(error.message || '')) return 'Слишком много заявок подряд. Попробуйте через час или напишите в поддержку.';
    return 'Не удалось отправить заявку. Проверьте интернет и попробуйте ещё раз.';
  },
  async platformCounts() { const { data, error } = await supabase.rpc('platform_counts'); return error ? null : data; },
  async adminListLeads() {
    const { data, error } = await supabase.from('boutique_leads').select('*').order('created_at', { ascending: false }).limit(200);
    return error || !data ? [] : data;
  },
  async adminSetLead(id, patch) {
    if (!isUuid(id)) return false;
    const row = {};
    if (['new', 'contacted', 'done', 'rejected'].includes(patch.status)) row.status = patch.status;
    if (patch.admin_note !== undefined) row.admin_note = cleanText(patch.admin_note, 300) || null;
    const { error } = await supabase.from('boutique_leads').update(row).eq('id', id);
    return !error;
  },
  // ===== Оплата и автопилот заказов =====
  // Способы получения и оплаты у бутиков корзины
  async checkoutOptions(productIds) {
    const ids = [...new Set(productIds.filter(isUuid))];
    if (!ids.length) return [];
    const { data, error } = await supabase.rpc('checkout_options', { pids: ids });
    return error ? null : data || [];
  },
  async myTrust() { const { data, error } = await supabase.rpc('my_trust'); return error ? null : data; },
  async orderPayInfo(id) { if (!isUuid(id)) return null; const { data, error } = await supabase.rpc('order_pay_info', { oid: id }); return error ? null : data; },
  async myBoutiquePay(id) { if (!isUuid(id)) return null; const { data, error } = await supabase.rpc('my_boutique_pay', { bid: id }); return error ? null : data; },
  async saveBoutiquePay(id, p) {
    if (!isUuid(id)) return 'Бутик не найден.';
    const phone = String(p.sbp_phone || '').replace(/[^0-9+]/g, '');
    if (p.pay_prepay && !/^\+?[0-9]{10,15}$/.test(phone)) return 'Для предоплаты укажите номер телефона, привязанный к СБП.';
    if (!p.pay_cash && !p.pay_transfer && !p.pay_prepay) return 'Включите хотя бы один способ оплаты.';
    const row = { auto_accept: !!p.auto_accept, pay_cash: !!p.pay_cash, pay_transfer: !!p.pay_transfer, pay_prepay: !!p.pay_prepay, sbp_phone: phone || null, sbp_bank: cleanText(p.sbp_bank, 40) || null };
    const { error } = await supabase.from('boutiques').update(row).eq('id', id);
    return error ? (error.code === '42703' ? 'Настройки оплаты заработают после обновления базы.' : 'Не удалось сохранить настройки оплаты.') : '';
  },
  async orderUnpaid(id) { if (!isUuid(id)) return 'Заказ не найден.'; const { error } = await supabase.rpc('order_unpaid', { oid: id }); return error ? (/not allowed/.test(error.message) ? 'Сообщить о неоплате можно только по доставке с оплатой при получении, в течение 3 дней.' : 'Не удалось отправить. Попробуйте ещё раз.') : ''; },
  async orderPaid(id) { if (!isUuid(id)) return false; const { error } = await supabase.rpc('order_paid', { oid: id }); return !error; },
  async orderPaidClaim(id) { if (!isUuid(id)) return false; const { error } = await supabase.rpc('order_paid_claim', { oid: id }); return !error; },
  async buyerFlags(orderIds) {
    const ids = orderIds.filter(isUuid);
    if (!ids.length) return {};
    const { data, error } = await supabase.rpc('buyer_flags', { oids: ids });
    return error || !data ? {} : Object.fromEntries(data.map((r) => [r.order_id, r]));
  },
  async adminUnpaidList() { const { data, error } = await supabase.rpc('admin_unpaid_list'); return error ? null : data || []; },
  // ===== Поддержка в приложении (один диалог на человека) =====
  async supportThread() {
    let { data: t, error } = await supabase.from('support_threads').select('id,status,user_unread,admin_read_at').maybeSingle();
    if (error?.code === '42703') ({ data: t, error } = await supabase.from('support_threads').select('id,status,user_unread').maybeSingle());
    if (error) return error.code === '42P01' || error.code === 'PGRST205' ? null : undefined;
    if (!t) return { thread: null, messages: [] };
    return { thread: t, messages: await api.supportMessages(t.id) };
  },
  async supportMessages(threadId) {
    if (!isUuid(threadId)) return [];
    let { data, error } = await supabase.from('support_messages').select('id,author,body,order_id,image_path,created_at').eq('thread_id', threadId).order('created_at').limit(500);
    if (error?.code === '42703') ({ data } = await supabase.from('support_messages').select('id,author,body,order_id,created_at').eq('thread_id', threadId).order('created_at').limit(500));
    return data || [];
  },
  // Фото в чат: сжимаем, кладём в закрытую папку автора
  async supportUpload(file) {
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) return { error: 'Нужно войти.' };
    const v = await makeVariants(file);
    if (!v) return { error: 'Не удалось обработать фото.' };
    const path = `${uid}/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage.from('support-media').upload(path, v.main, { contentType: 'image/jpeg', upsert: false });
    return error ? { error: 'Не удалось загрузить фото.' } : { path };
  },
  async supportImageUrls(paths) {
    const list = [...new Set(paths.filter(Boolean))];
    if (!list.length) return {};
    const { data } = await supabase.storage.from('support-media').createSignedUrls(list, 3600);
    return Object.fromEntries((data || []).filter((x) => x.signedUrl).map((x) => [x.path, x.signedUrl]));
  },
  async supportSend(body, orderId, file) {
    const txt = String(body || '').trim().slice(0, 2000);
    if (!txt && !file) return 'Напишите сообщение.';
    let image = null;
    if (file) { const u = await api.supportUpload(file); if (u.error) return u.error; image = u.path; }
    const { error } = await supabase.rpc('support_send', { body: txt, order_id: isUuid(orderId) ? orderId : null, ...(image ? { image } : {}) });
    return error ? (/Слишком много|rate/i.test(error.message) ? 'Слишком много сообщений подряд. Подождите немного.' : 'Не удалось отправить. Проверьте интернет.') : '';
  },
  async supportRead(threadId) { await supabase.rpc('support_read', { thread: isUuid(threadId) ? threadId : null }); },
  async supportUnread() { const { data } = await supabase.from('support_threads').select('user_unread').maybeSingle(); return data?.user_unread || 0; },
  async adminSupportThreads() { const { data, error } = await supabase.rpc('admin_support_threads'); return error ? null : data || []; },
  async adminSupportThread(threadId) {
    if (!isUuid(threadId)) return null;
    let { data, error } = await supabase.from('support_threads').select('id,user_id,status,user_read_at').eq('id', threadId).maybeSingle();
    if (error?.code === '42703') ({ data } = await supabase.from('support_threads').select('id,user_id,status').eq('id', threadId).maybeSingle());
    return data;
  },
  adminSupportMessages(threadId) { return api.supportMessages(threadId); },
  async supportReply(threadId, body, file) {
    const txt = String(body || '').trim().slice(0, 2000);
    if ((!txt && !file) || !isUuid(threadId)) return 'Напишите сообщение.';
    let image = null;
    if (file) { const u = await api.supportUpload(file); if (u.error) return u.error; image = u.path; }
    const { error } = await supabase.rpc('support_reply', { thread: threadId, body: txt, ...(image ? { image } : {}) });
    return error ? 'Не удалось отправить.' : '';
  },
  async supportSetStatus(threadId, closed) { const { error } = await supabase.rpc('support_set_status', { thread: threadId, closed: !!closed }); return !error; },
  async adminUserOrders(uid) { if (!isUuid(uid)) return []; const { data, error } = await supabase.rpc('admin_user_orders', { uid }); return error ? [] : data || []; },
  async adminCounters() { const { data, error } = await supabase.rpc('admin_counters'); return error ? {} : data || {}; },
  async adminOrder(id) {
    if (!isUuid(id)) return null;
    const { data } = await supabase.from('orders').select('id,status,total_rub,created_at,delivery,payment,phone,address,boutique:boutiques(name),items:order_items(title,qty,size,price_rub)').eq('id', id).maybeSingle();
    return data;
  },
  // ===== Отзывы на товары бутика и ответы на них =====
  async sellerReviews() { const { data, error } = await supabase.rpc('seller_reviews', { lim: 200 }); return error ? null : data || []; },
  async replyReview(id, text) {
    if (!isUuid(id)) return 'Отзыв не найден.';
    const { error } = await supabase.rpc('reply_review', { rid: id, txt: cleanText(text, 1000) });
    return error ? 'Не удалось сохранить ответ.' : '';
  },
  // ===== Промокоды =====
  // проверка кода для корзины: { discount, by, title } или { error }
  async promoQuote(code, items) {
    const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
    if (c.length < 4) return { error: 'Введите промокод.' };
    const payload = items.filter((i) => isUuid(i.id)).map((i) => ({ product_id: i.id, qty: i.qty }));
    const { data, error } = await supabase.rpc('promo_quote', { code: c, items: payload });
    if (error) return { error: error.code === 'PGRST202' ? 'Промокоды скоро заработают.' : 'Не удалось проверить промокод.' };
    if (!data?.ok) return { error: data?.error === 'min_order' ? `Промокод действует от ${data.min_order} ₽` : PROMO_ERR[data?.error] || 'Промокод не подходит.' };
    return { code: c, discount: data.discount, by: data.by, title: data.title, kind: data.kind, value: data.value };
  },
  async listPromos(boutiqueId) {
    let req = supabase.from('promo_codes').select('*').order('created_at', { ascending: false }).limit(100);
    req = isUuid(boutiqueId) ? req.eq('boutique_id', boutiqueId) : req.is('boutique_id', null);
    const { data } = await req;
    return data || [];
  },
  async promoStats(id) { const { data } = await supabase.rpc('promo_stats', { pid: id }); return data || null; },
  async savePromo(p, boutiqueId) {
    const code = String(p.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const num = (v) => (v === '' || v == null ? null : Math.round(Number(v)));
    const row = {
      title: cleanText(p.title, 80) || null, kind: p.kind === 'fixed' ? 'fixed' : 'percent', value: num(p.value),
      min_order: num(p.min_order) || 0, max_discount: p.kind === 'percent' ? num(p.max_discount) : null,
      starts_at: p.starts_at ? new Date(p.starts_at + 'T00:00:00').toISOString() : new Date().toISOString(),
      ends_at: p.ends_at ? new Date(p.ends_at + 'T23:59:59').toISOString() : null,
      usage_limit: num(p.usage_limit), per_user: Math.max(1, num(p.per_user) || 1), first_order_only: !!p.first_order_only, is_active: p.is_active !== false,
    };
    if (!isUuid(p.id) && !/^[A-Z0-9]{4,20}$/.test(code)) return 'Код — 4–20 латинских букв и цифр.';
    if (!row.value || row.value < 1 || (row.kind === 'percent' && row.value > 90)) return row.kind === 'percent' ? 'Скидка — от 1 до 90%.' : 'Укажите сумму скидки.';
    const { error } = isUuid(p.id) ? await supabase.from('promo_codes').update(row).eq('id', p.id)
      : await supabase.from('promo_codes').insert({ ...row, code, boutique_id: isUuid(boutiqueId) ? boutiqueId : null });
    return error ? (error.code === '23505' ? 'Такой код уже есть — придумайте другой.' : error.code === '23514' ? 'Проверьте значения и даты.' : 'Не удалось сохранить.') : '';
  },
  async deletePromo(id) { if (!isUuid(id)) return false; const { error } = await supabase.from('promo_codes').delete().eq('id', id); return !error; },
  // ===== Приглашения друзей =====
  async myReferralCode() { const { data, error } = await supabase.rpc('my_referral_code'); return error ? null : data; },
  async myReferrals() { const { data, error } = await supabase.rpc('my_referrals'); return error ? null : data; },
  async claimReferral(code) { const { data } = await supabase.rpc('claim_referral', { code: String(code).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) }); return !!data; },
  async adminReferralTop() { const { data } = await supabase.rpc('admin_referral_top', { lim: 50 }); return data || []; },
  // ===== Подборки =====
  async listCollections() {
    const { data, error } = await supabase.from('collections').select('id,title,subtitle,cover_path,sort').order('sort').order('created_at', { ascending: false }).limit(20);
    return error || !data ? [] : data.map(toCollection);
  },
  async getCollection(id) {
    if (!isUuid(id)) return null;
    const { data, error } = await supabase.from('collections').select('id,title,subtitle,cover_path,items:collection_items(sort,product:products(' + COLS + '))').eq('id', id).maybeSingle();
    if (downgrade(error)) return api.getCollection(id);
    if (error || !data) return null;
    const items = (data.items || []).filter((i) => i.product?.is_published).sort((a, b) => a.sort - b.sort).map((i) => toProduct(i.product));
    return { ...toCollection(data), products: items };
  },
  async adminListCollections() {
    const { data } = await supabase.from('collections').select('*,items:collection_items(product_id,sort,product:products(id,title))').order('sort').order('created_at', { ascending: false }).limit(50);
    return (data || []).map(toCollection);
  },
  async adminSaveCollection(c, cover) {
    const row = {
      title: cleanText(c.title, 60), subtitle: cleanText(c.subtitle, 120) || null, is_published: !!c.is_published,
      sort: Math.max(-99, Math.min(99, Math.round(Number(c.sort) || 0))),
      starts_at: c.starts_at ? new Date(c.starts_at + 'T00:00:00').toISOString() : new Date().toISOString(),
      ends_at: c.ends_at ? new Date(c.ends_at + 'T23:59:59').toISOString() : null,
    };
    if (row.title.length < 2) return { error: 'Укажите название подборки.' };
    const id = isUuid(c.id) ? c.id : crypto.randomUUID();
    if (cover) {
      const v = await makeVariants(cover);
      if (!v) return { error: 'Не удалось обработать обложку.' };
      const path = `collections/${id}.jpg`;
      const { error } = await supabase.storage.from('brand-media').upload(path, v.main, { contentType: 'image/jpeg', upsert: !!c.cover_path });
      if (error) return { error: 'Не удалось загрузить обложку.' };
      row.cover_path = path;
    }
    const { error } = isUuid(c.id) ? await supabase.from('collections').update(row).eq('id', c.id) : await supabase.from('collections').insert({ id, ...row });
    if (error) return { error: error.code === '23514' ? 'Проверьте даты.' : 'Не удалось сохранить подборку.' };
    // состав подборки: заменяем целиком
    const ids = (c.productIds || []).filter(isUuid).slice(0, 60);
    await supabase.from('collection_items').delete().eq('collection_id', id);
    if (ids.length) {
      const { error: e2 } = await supabase.from('collection_items').insert(ids.map((pid, i) => ({ collection_id: id, product_id: pid, sort: i })));
      if (e2) return { error: 'Подборка сохранена, но товары не добавились.' };
    }
    return { id };
  },
  async adminDeleteCollection(id) {
    if (!isUuid(id)) return false;
    await supabase.storage.from('brand-media').remove([`collections/${id}.jpg`]);
    const { error } = await supabase.from('collections').delete().eq('id', id);
    return !error;
  },
  // ===== Подписка на бутик =====
  async followState(boutiqueId, userId) {
    if (!isUuid(boutiqueId)) return { on: false, count: 0 };
    const [{ data: cnt }, mine] = await Promise.all([
      supabase.rpc('boutique_followers', { bid: boutiqueId }),
      isUuid(userId) ? supabase.from('boutique_follows').select('boutique_id').eq('boutique_id', boutiqueId).eq('user_id', userId).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    return { on: !!mine.data, count: Number(cnt) || 0 };
  },
  async setFollow(boutiqueId, on) {
    if (!isUuid(boutiqueId)) return false;
    const { error } = on ? await supabase.from('boutique_follows').insert({ boutique_id: boutiqueId }) : await supabase.from('boutique_follows').delete().eq('boutique_id', boutiqueId);
    return !error || error.code === '23505';
  },
  async listMyFollows() {
    const { data, error } = await supabase.from('boutique_follows').select('boutique:boutiques(' + BQ_COLS_BASE + ')').order('created_at', { ascending: false }).limit(100);
    return error || !data ? [] : data.map((r) => r.boutique).filter(Boolean).map(toBoutique);
  },
  // Похожие: тот же раздел; «Ещё из бутика»: тот же продавец
  async related(p) {
    if (!p?.id) return { same: [], shop: [] };
    const base = () => supabase.from('products').select(COLS).eq('is_published', true).neq('id', p.id).limit(10);
    const [a, b] = await Promise.all([
      CATEGORIES.includes(p.category) ? base().eq('category', p.category).order('rating_count', { ascending: false }) : Promise.resolve({ data: [] }),
      isUuid(p.boutiqueId) ? base().eq('boutique_id', p.boutiqueId).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
    ]);
    const shop = (b.data || []).map(toProduct);
    const shopIds = new Set(shop.map((x) => x.id));
    return { same: (a.data || []).map(toProduct).filter((x) => !shopIds.has(x.id)), shop };
  },
  // «Сообщить, когда появится размер»
  async stockAlert(productId, size) {
    if (!isUuid(productId)) return 'Не удалось.';
    const { error } = await supabase.from('stock_alerts').insert({ product_id: productId, size: size || '_' });
    return !error || error.code === '23505' ? '' : 'Не удалось подписаться.';
  },
  // Все товары своего бутика (без постраничного ограничения каталога)
  async listMyProducts(boutiqueId) {
    if (!isUuid(boutiqueId)) return [];
    const { data, error } = await supabase.from('products').select(COLS + ',description').eq('boutique_id', boutiqueId).order('created_at', { ascending: false }).limit(500);
    if (downgrade(error)) return api.listMyProducts(boutiqueId);
    return error || !data ? [] : data.map(toProduct);
  },
  async setProductSizing(id, sizing) {
    if (!isUuid(id)) return false;
    const { error } = await supabase.from('products').update(normalizeSizing(sizing)).eq('id', id);
    return !error;
  },
  async setProductPublished(id, on) {
    if (!isUuid(id)) return false;
    const { error } = await supabase.from('products').update({ is_published: !!on }).eq('id', id);
    return !error;
  },
  async deleteProduct(id) {
    if (!isUuid(id)) return false;
    const { error } = await supabase.from('products').delete().eq('id', id);
    return !error;
  },
  // Заказы бутика: каждый заказ — один бутик; контакт покупателя виден, пока заказ не выполнен или не отменён
  async listSellerOrders(boutiqueId) {
    if (!isUuid(boutiqueId)) return [];
    const { data, error } = await supabase.from('orders').select('id,status,total_rub,created_at,delivery,phone,address,comment,payment' + ORDER_EXTRA + ',items:order_items(title,qty,price_rub,size,product_id)').eq('boutique_id', boutiqueId).order('created_at', { ascending: false }).limit(200);
    if (downgradeOrders(error)) return api.listSellerOrders(boutiqueId);
    return error || !data ? [] : data;
  },
  // ===== Покупатель: заказы. Цену, наличие и сумму считает сервер =====
  // idem — ключ одной попытки оформления: повторная отправка не создаст второй заказ.
  async placeOrder(items, contact, idem) {
    const payload = items.filter((i) => isUuid(i.id)).map((i) => ({ product_id: i.id, qty: i.qty, ...(i.size ? { size: String(i.size) } : {}) }));
    if (!payload.length) return { error: 'Корзина пуста.' };
    const c = { phone: String(contact.phone || '').replace(/[^0-9+]/g, '').slice(0, 16), delivery: ['courier', 'reserve'].includes(contact.delivery) ? contact.delivery : 'pickup', address: cleanText(contact.address, 200), comment: cleanText(contact.comment, 300), day: contact.day === 'tomorrow' ? 'tomorrow' : 'today', payment: ['cash', 'transfer', 'prepay'].includes(contact.payment) ? contact.payment : 'cash', ...(contact.promo ? { promo: String(contact.promo).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20) } : {}) };
    const { data, error } = await supabase.rpc('place_order', { items: payload, contact: c, idem: isUuid(idem) ? idem : null });
    if (!error) return { ids: data || [] };
    const m = String(error.message || '');
    if (m.startsWith('promo ')) return { error: PROMO_ERR[m.slice(6)] || 'Промокод не применился. Уберите его и попробуйте снова.', promo: true };
    if (m.includes('unpaid debt')) return { error: 'У вас есть неоплаченный заказ — новые заказы недоступны, пока вопрос не решится. Откройте «Мои заказы».', debt: true };
    if (m.includes('cod limit')) { const [, n, sum] = m.match(/cod limit (\d+) (\d+)/) || []; return { error: `С оплатой при получении сейчас доступно ${n || 1} ${Number(n) === 1 ? 'заказ' : 'заказа'} с доставкой до ${Number(sum || 10000).toLocaleString('ru-RU')} ₽ одновременно. Лимит растёт с каждым оплаченным заказом. Выберите предоплату, самовывоз или дождитесь получения прошлых заказов.`, limit: true }; }
    if (m.includes('payment unavailable')) return { error: 'Этот способ оплаты недоступен у одного из бутиков. Выберите другой.' };
    return { error: m.includes('reserve limit') ? 'Можно отложить не больше 3 вещей одного бутика и держать не больше 3 броней одновременно.' : m.includes('bad delivery') ? 'Бронь пока недоступна. Попробуйте позже.' : m.includes('out of stock') ? 'Одного из товаров уже нет в нужном количестве. Уменьшите количество или выберите другой размер.'
      : m.includes('unavailable') ? 'Один из товаров больше не продаётся или выбран размер, которого нет. Обновите корзину.'
        : m.includes('bad phone') ? 'Проверьте номер телефона.' : m.includes('address') ? 'Укажите адрес доставки.'
          : 'Не удалось оформить заказ. Проверьте интернет и нажмите ещё раз — повторный заказ не создастся.' };
  },
  async listMyOrders(userId) {
    if (!isUuid(userId)) return [];
    const { data, error } = await supabase.from('orders').select('id,status,total_rub,created_at,delivery,address,comment,payment' + ORDER_EXTRA + ',boutique:boutiques(id,name,whatsapp,phone,address,city,hours),items:order_items(title,qty,price_rub,size,product_id)').eq('buyer_id', userId).order('created_at', { ascending: false }).limit(50);
    if (downgradeOrders(error)) return api.listMyOrders(userId);
    return error || !data ? [] : data;
  },
  // ===== Восстановление пароля =====
  async resetPassword(email) {
    const e = String(email || '').trim().slice(0, 120);
    if (!/^\S+@\S+\.\S+$/.test(e)) return 'Введите почту.';
    const { error } = await supabase.auth.resetPasswordForEmail(e, { redirectTo: window.location.origin + '/reset-password' });
    return error ? (error.status === 429 ? 'Слишком часто. Попробуйте через минуту.' : 'Не удалось отправить письмо.') : '';
  },
  async updatePassword(pw) {
    if (String(pw).length < 8 || String(pw).length > 72) return 'Пароль — от 8 до 72 символов.';
    const { error } = await supabase.auth.updateUser({ password: pw });
    return error ? (String(error.message).includes('different') ? 'Новый пароль должен отличаться от старого.' : 'Ссылка устарела. Запросите письмо ещё раз.') : '';
  },
  // ===== Поддержка и аккаунт =====
  async getSupportContacts() {
    const { data, error } = await supabase.from('support_contacts').select('telegram,whatsapp,phone,sms,email,hours').eq('id', 1).maybeSingle();
    return error || !data ? {} : data;
  },
  async saveSupportContacts(c) {
    const v = normalizeContacts(c);
    if (v.error) return v.error;
    const { data, error } = await supabase.from('support_contacts').update({ ...v.data, updated_at: new Date().toISOString() }).eq('id', 1).select('id');
    // Если правила доступа не пустили, база не вернёт ошибку, а просто ничего не изменит.
    if (!error) return data?.length ? '' : 'Нет прав на изменение. Войдите как администратор.';
    if (error.code === '42501') return 'Нет прав на изменение. Войдите как администратор.';
    if (error.code === '23514') return 'База отклонила данные. Проверьте формат номеров и почты.';
    return 'Не удалось сохранить: ' + (error.message || 'ошибка сети');
  },
  async deleteMyAccount() {
    // фото профиля удаляем заранее — после удаления аккаунта доступа к папке уже не будет
    try { const uid = (await supabase.auth.getUser()).data.user?.id; if (uid) { const { data } = await supabase.storage.from('avatars').list(uid); if (data?.length) await supabase.storage.from('avatars').remove(data.map((f) => `${uid}/${f.name}`)); } } catch { /* не мешаем удалению */ }
    const { error } = await supabase.rpc('delete_my_account', { confirm: 'УДАЛИТЬ' });
    if (error) return error.message || 'Не удалось удалить аккаунт';
    await supabase.auth.signOut();
    return '';
  },
  // ===== Согласие, активность, бан =====
  async giveConsent(version) {
    const { error } = await supabase.rpc('give_consent', { version });
    return !error;
  },
  async touch(guestFirstToday = false) {
    await supabase.rpc('touch_activity', { guest_first_today: !!guestFirstToday });
  },
  async adminStats(days) {
    const { data, error } = await supabase.rpc('admin_stats', { days });
    return error ? null : data;
  },
  async adminListUsers({ search = '', limit = 50, offset = 0 } = {}) {
    const { data, error } = await supabase.rpc('admin_list_users', { search: cleanQuery(search), lim: limit, off: offset });
    return error || !data ? null : data;
  },
  async adminSetBlocked(id, blocked, reason = '') {
    if (!isUuid(id)) return 'Неверный пользователь';
    const { error } = await supabase.rpc('admin_set_blocked', { target: id, blocked: !!blocked, reason: cleanText(reason, 200) || null });
    return error ? (error.message || 'Не удалось') : '';
  },
  async adminDeleteUser(id) {
    if (!isUuid(id)) return 'Неверный пользователь';
    // сначала фото профиля — после удаления аккаунта папку уже не найти
    try { const { data } = await supabase.storage.from('avatars').list(id); if (data?.length) await supabase.storage.from('avatars').remove(data.map((f) => `${id}/${f.name}`)); } catch { /* не мешаем удалению */ }
    const { error } = await supabase.rpc('admin_delete_user', { target: id, confirm: 'УДАЛИТЬ' });
    if (!error) return '';
    if (error.code === 'PGRST202') return 'Удаление ещё не включено на сервере';
    return error.message || 'Не удалось удалить';
  },
  // ===== Курьеры =====
  async listDeliveryServices() {
    const { data, error } = await supabase.from('delivery_services').select('id,name,kind,mode,phone,whatsapp,telegram,app_url,cities,note,is_active,sort').order('sort').order('name');
    return error ? (error.code === '42P01' ? [] : null) : data || [];
  },
  // вызвать курьера: вернёт данные для заявки (откуда, куда, телефон покупателя, сколько взять)
  async callCourier(orderId, serviceId, note = '') {
    if (!isUuid(orderId) || !isUuid(serviceId)) return { error: 'Неверные данные' };
    const { data, error } = await supabase.rpc('seller_call_courier', { oid: orderId, sid: serviceId, note: cleanText(note, 200) || null });
    if (!error) return data;
    const m = String(error.message || '');
    return { error: m.includes('already') ? 'Курьер по этому заказу уже вызван' : m.includes('not confirmed') ? 'Сначала примите заказ' : m.includes('not courier') ? 'Этот заказ без доставки' : m.includes('service') ? 'Служба сейчас недоступна' : 'Не удалось вызвать курьера' };
  },
  async setDeliveryStatus(deliveryId, status, { courierName = '', courierPhone = '', note = '' } = {}) {
    if (!isUuid(deliveryId) || !['assigned', 'picked_up', 'delivered', 'failed', 'cancelled'].includes(status)) return 'Неверные данные';
    const { error } = await supabase.rpc('seller_delivery_status', { did: deliveryId, st: status, courier_name: cleanText(courierName, 60) || null, courier_phone: String(courierPhone || '').replace(/[^0-9+]/g, '') || null, note: cleanText(note, 200) || null });
    return error ? (String(error.message).includes('closed') ? 'Доставка уже завершена' : 'Не удалось сохранить') : '';
  },
  async orderDeliveries(orderIds) {
    const ids = (orderIds || []).filter(isUuid).slice(0, 200);
    if (!ids.length) return [];
    const { data, error } = await supabase.from('deliveries').select('id,order_id,service_name,status,courier_name,courier_phone,tracking_url,fee_rub,cod_rub,note,created_at,updated_at').in('order_id', ids).order('created_at', { ascending: false });
    return error ? [] : data || [];
  },
  async adminSaveDeliveryService(s) {
    const row = { name: cleanText(s.name, 60), kind: s.kind === 'taxi' ? 'taxi' : 'delivery', phone: String(s.phone || '').replace(/[^0-9+]/g, '') || null,
      whatsapp: String(s.whatsapp || '').replace(/[^0-9]/g, '') || null, telegram: String(s.telegram || '').trim().replace(/^@/, '') || null,
      app_url: /^https:\/\//.test(s.app_url || '') ? s.app_url.trim() : null, note: cleanText(s.note, 200) || null, is_active: s.is_active !== false, sort: Number(s.sort) || 0 };
    if (!row.name || row.name.length < 2) return 'Укажите название';
    const q = isUuid(s.id) ? supabase.from('delivery_services').update(row).eq('id', s.id) : supabase.from('delivery_services').insert(row);
    const { error } = await q;
    return error ? (error.code === '23514' ? 'Проверьте телефон, WhatsApp, Telegram или ссылку' : 'Не удалось сохранить') : '';
  },
  async adminDeleteDeliveryService(id) { if (!isUuid(id)) return false; const { error } = await supabase.from('delivery_services').delete().eq('id', id); return !error; },
  async adminDeliveryKey(id) { if (!isUuid(id)) return null; const { data, error } = await supabase.rpc('admin_delivery_key', { sid: id }); return error ? null : data; },
  // ===== Мои мерки (видит и меняет только владелец) =====
  async getMeasurements() {
    const { data, error } = await supabase.from('measurements').select('gender,height_cm,weight_kg,chest_cm,waist_cm,hips_cm,shoulder_cm,inseam_cm,shoe_eu,fit_pref,updated_at').maybeSingle();
    return error ? null : data;
  },
  async saveMeasurements(userId, m) {
    if (!isUuid(userId)) return 'Нужно войти';
    const row = { user_id: userId, gender: ['female', 'male'].includes(m.gender) ? m.gender : null, updated_at: new Date().toISOString() };
    for (const k of ['height_cm', 'weight_kg', 'chest_cm', 'waist_cm', 'hips_cm', 'shoulder_cm', 'inseam_cm']) { const v = Math.round(Number(String(m[k] ?? '').replace(',', '.'))); row[k] = m[k] === '' || m[k] == null || !Number.isFinite(v) ? null : v; }
    const shoe = Number(String(m.shoe_eu ?? '').replace(',', '.'));
    row.shoe_eu = m.shoe_eu === '' || m.shoe_eu == null || !Number.isFinite(shoe) ? null : Math.round(shoe * 2) / 2;
    const { error } = await supabase.from('measurements').upsert(row, { onConflict: 'user_id' });
    if (!error) return '';
    return error.code === '23514' ? 'Проверьте значения: одно из них вне допустимого диапазона.' : 'Не удалось сохранить. Попробуйте ещё раз.';
  },
  // Ответы опросника о посадке (как любит носить, что брать между размерами, любимая длина)
  async saveFitPref(userId, pref) {
    if (!isUuid(userId)) return 'Нужно войти';
    const ok = { fit: ['tight', 'regular', 'loose', 'oversize'], between: ['smaller', 'bigger'], length: ['maxi', 'midi', 'any'], trousers: ['long', 'cropped', 'any'] };
    const fit_pref = {};
    for (const [k, vals] of Object.entries(ok)) if (vals.includes(pref?.[k])) fit_pref[k] = pref[k];
    const { error } = await supabase.from('measurements').upsert({ user_id: userId, fit_pref, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    return error ? 'Не удалось сохранить ответы. Попробуйте ещё раз.' : '';
  },
  // Пол для манекена и размерной сетки: выбирает сам пользователь
  async saveGender(userId, gender) {
    if (!isUuid(userId) || !['female', 'male'].includes(gender)) return 'Нужно войти';
    const { error } = await supabase.from('measurements').upsert({ user_id: userId, gender, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    return error ? 'Не удалось сохранить. Попробуйте ещё раз.' : '';
  },
  async clearMeasurements(userId) {
    if (!isUuid(userId)) return false;
    const { error } = await supabase.from('measurements').delete().eq('user_id', userId);
    return !error;
  },
  // ===== Уведомления (создаёт только база; клиент читает свои и отмечает прочитанными) =====
  async listNotifications() {
    const { data, error } = await supabase.from('notifications').select('id,kind,title,body,link,created_at,read_at').order('created_at', { ascending: false }).limit(50);
    return error || !data ? [] : data;
  },
  async unreadNotifications() {
    const { count, error } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
    return error ? 0 : count || 0;
  },
  async markNotificationsRead() {
    const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null);
    return !error;
  },
  // ===== Администратор (права проверяет база) =====
  async listPendingRoleRequests() {
    const { data, error } = await supabase.from('role_requests').select('id,boutique_name,created_at').eq('status', 'pending').order('created_at').limit(50);
    return error || !data ? [] : data;
  },
  async reviewRoleRequest(id, approve) {
    if (!isUuid(id)) return false;
    const { error } = await supabase.rpc('admin_review_role_request', { rid: id, approve: !!approve });
    return !error;
  },
  async listPendingPartnerRequests() {
    const { data, error } = await supabase.from('partner_requests').select('id,brand_name,category,contact,created_at').eq('status', 'pending').order('created_at').limit(50);
    return error || !data ? [] : data;
  },
  async reviewPartnerRequest(id, approve) {
    if (!isUuid(id)) return false;
    const { error } = await supabase.rpc('admin_review_partner_request', { rid: id, approve: !!approve });
    return !error;
  },
  async listAllBoutiques() {
    const { data, error } = await supabase.from('boutiques').select('id,name,is_approved').order('created_at', { ascending: false }).limit(100);
    return error || !data ? [] : data;
  },
  async setBoutiqueApproved(id, ok) {
    if (!isUuid(id)) return false;
    const { error } = await supabase.rpc('admin_set_boutique_approved', { bid: id, ok: !!ok });
    return !error;
  },
};
