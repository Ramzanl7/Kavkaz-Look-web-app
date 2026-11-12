import { supabase } from '../lib/supabase.js';
import { cleanQuery, cleanText, escapeLike, isUuid } from '../lib/sanitize.js';
import { makeVariants } from '../lib/image.js';

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
const COLS = 'id,title,price_rub,category,image_path,garment_type,sizes,size_chart,is_published,rating_avg,rating_count,created_at,boutique_id,boutique:boutiques(name,city)';
export const PAGE = 20;
export const CITIES = ['Грозный', 'Аргун', 'Гудермес', 'Урус-Мартан', 'Шали', 'Курчалой', 'Ачхой-Мартан', 'Наурская', 'Ведено'];
const SORTS = { new: ['created_at', false], price_asc: ['price_rub', true], price_desc: ['price_rub', false], rating: ['rating_avg', false] };
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
});
const brandUrl = (path) => (path ? supabase.storage.from('brand-media').getPublicUrl(path).data.publicUrl : null);
const toBrand = (r) => ({ ...r, banner: brandUrl(r.banner_path), logo: brandUrl(r.logo_path) });
// Кэш на 60 секунд: каталог открывается мгновенно, данные обновляются в фоне.
const lists = new Map(), products = new Map();
const keyOf = (o) => [o.query ?? '', o.category ?? '', o.boutiqueId ?? '', o.sort ?? 'new', o.minPrice ?? '', o.maxPrice ?? '', o.size ?? '', o.city ?? ''].join('|');

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
  async listProducts({ query = '', category = '', boutiqueId = '', sort = 'new', page = 0, minPrice = '', maxPrice = '', size = '', city = '' } = {}) {
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
    const { data, error } = await req;
    if (error || !data) return page ? [] : null;
    const list = data.map(toProduct);
    if (!page) lists.set(keyOf({ query, category, boutiqueId, sort, minPrice, maxPrice, size, city }), { t: Date.now(), data: list });
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
    const url = (v) => { const t = cleanText(v, 300); return t ? (/^https:\/\/[^\s<>"]{3,300}$/.test(t) ? t : undefined) : null; };
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
      const { error } = await supabase.storage.from('brand-media').upload(path, kind === 'banner' ? v.main : v.thumb, { contentType: 'image/jpeg', upsert: true });
      if (error) return 'Не удалось загрузить изображение.';
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
    const { data } = await supabase.from('promotions').select('id,advertiser,advertiser_inn,erid,sort,product:products!inner(' + COLS + ')').order('sort').limit(10);
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
    if (error || !data) return null;
    const p = toProduct(data);
    products.set(p.id, p);
    return p;
  },
  async listBoutiques() {
    const { data, error } = await supabase.from('boutiques').select('id,name,description,city').eq('is_approved', true).order('created_at', { ascending: false }).limit(50);
    return error || !data ? [] : data;
  },
  async getBoutique(id) {
    if (!isUuid(id)) return null;
    const { data, error } = await supabase.from('boutiques').select('id,name,description,city').eq('id', id).eq('is_approved', true).maybeSingle();
    return error || !data ? null : data;
  },
  async listWishlist() {
    const { data, error } = await supabase.from('wishlist').select('product:products(' + COLS + ')').limit(100);
    return error || !data ? [] : data.map((r) => r.product).filter(Boolean).map(toProduct);
  },
  async listWishedIds() {
    const { data, error } = await supabase.from('wishlist').select('product_id').limit(500);
    return error || !data ? [] : data.map((r) => r.product_id);
  },
  async listReviews(productId) {
    if (!isUuid(productId)) return [];
    const { data, error } = await supabase.from('reviews').select('id,user_id,author_name,rating,body,created_at').eq('product_id', productId).order('created_at', { ascending: false }).limit(50);
    return error || !data ? [] : data;
  },
  async addReview(productId, stars, text) {
    if (!isUuid(productId) || !Number.isInteger(stars) || stars < 1 || stars > 5) return { ok: false, error: 'Проверьте оценку.' };
    const { error } = await supabase.rpc('add_review', { pid: productId, stars, txt: cleanText(text, 1000) });
    if (!error) return { ok: true };
    return { ok: false, error: String(error.message).includes('purchase') ? 'Отзыв можно оставить после заказа этого товара.' : 'Не удалось сохранить отзыв.' };
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
    const { data } = await supabase.from('boutiques').select('id,name,description,city,is_approved').eq('owner_id', userId).limit(1).maybeSingle();
    return data ?? null;
  },
  async createProduct({ boutiqueId, title, price, category, description, file, sizing }) {
    const t = cleanText(title, 120), d = cleanText(description, 2000), p = Number(price);
    if (!isUuid(boutiqueId) || t.length < 2 || !Number.isInteger(p) || p < 1 || p > 10000000 || !CATEGORIES.includes(category)) return { ok: false, error: 'Проверьте поля формы.' };
    let image_path = null;
    if (file) {
      if (!IMAGE_TYPES[file.type] || file.size > 25 * 1024 * 1024) return { ok: false, error: 'Фото: jpeg, png или webp.' };
      const v = await makeVariants(file);
      if (!v) return { ok: false, error: 'Не удалось обработать фото.' };
      const base = boutiqueId + '/' + crypto.randomUUID();
      const put = (name, blob) => supabase.storage.from('product-images').upload(name, blob, { contentType: 'image/jpeg', upsert: false });
      const [a, b] = await Promise.all([put(base + '.jpg', v.main), put(base + '_t.jpg', v.thumb)]);
      if (a.error || b.error) return { ok: false, error: 'Не удалось загрузить фото.' };
      image_path = base + '.jpg';
    }
    const { error } = await supabase.from('products').insert({ boutique_id: boutiqueId, title: t, description: d || null, price_rub: p, category, image_path, ...normalizeSizing(sizing) });
    return error ? { ok: false, error: 'Не удалось сохранить товар.' } : { ok: true };
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
  async listMyOrderItems() {
    const { data, error } = await supabase.from('order_items').select('id,title,qty,price_rub,order:orders(id,status,created_at)').limit(100);
    return error || !data ? [] : data;
  },
  // ===== Покупатель: заказы. Цену и сумму считает сервер =====
  // idem — ключ одной попытки оформления: повторная отправка (зависшая кнопка, плохой интернет) не создаст второй заказ.
  async createOrder(items, idem) {
    const payload = items.filter((i) => isUuid(i.id)).map((i) => ({ product_id: i.id, qty: i.qty }));
    if (!payload.length) return null;
    let { data, error } = await supabase.rpc('create_order', { items: payload, idem: isUuid(idem) ? idem : null });
    // База ещё без новой версии функции (переходный период) — оформляем по-старому
    if (error?.code === 'PGRST202') ({ data, error } = await supabase.rpc('create_order', { items: payload }));
    return error ? null : data;
  },
  async listMyOrders() {
    const { data, error } = await supabase.from('orders').select('id,status,total_rub,created_at,items:order_items(title,qty,price_rub)').order('created_at', { ascending: false }).limit(50);
    return error || !data ? [] : data;
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
  async adminUserDays(id) {
    if (!isUuid(id)) return [];
    const { data, error } = await supabase.rpc('admin_user_days', { target: id });
    return error || !data ? [] : data.map((r) => (typeof r === 'string' ? r : r.admin_user_days));
  },
  async adminSetBlocked(id, blocked, reason = '') {
    if (!isUuid(id)) return 'Неверный пользователь';
    const { error } = await supabase.rpc('admin_set_blocked', { target: id, blocked: !!blocked, reason: cleanText(reason, 200) || null });
    return error ? (error.message || 'Не удалось') : '';
  },
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
