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
const COLS = 'id,title,price_rub,category,image_path,is_published,rating_avg,rating_count,boutique:boutiques(name)';
const SORTS = { new: ['created_at', false], price_asc: ['price_rub', true], price_desc: ['price_rub', false], rating: ['rating_avg', false] };
const pub = (path) => supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl;
const toProduct = (r) => ({
  id: r.id, title: r.title, price: r.price_rub, category: r.category, description: r.description ?? '', boutique: r.boutique?.name ?? '', published: r.is_published,
  rating: Number(r.rating_avg) || 0, ratingCount: r.rating_count || 0,
  image: r.image_path ? pub(r.image_path) : null, thumb: r.image_path ? pub(r.image_path.replace(/\.jpg$/, '_t.jpg')) : null,
});
// Кэш на 60 секунд: каталог открывается мгновенно, данные обновляются в фоне.
const lists = new Map(), products = new Map();
const keyOf = (o) => [o.query ?? '', o.category ?? '', o.boutiqueId ?? '', o.sort ?? 'new'].join('|');

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
  peekList(o = {}) { const v = lists.get(keyOf(o)); return v && Date.now() - v.t < 60000 ? v.data : null; },
  peekProduct(id) { return products.get(id) ?? null; },
  async listProducts({ query = '', category = '', boutiqueId = '', sort = 'new' } = {}) {
    const [col, asc] = SORTS[sort] || SORTS.new;
    let req = supabase.from('products').select(COLS).order(col, { ascending: asc }).limit(50);
    const q = cleanQuery(query);
    if (q) req = req.ilike('title', '%' + escapeLike(q) + '%');
    if (CATEGORIES.includes(category)) req = req.eq('category', category);
    if (isUuid(boutiqueId)) req = req.eq('boutique_id', boutiqueId);
    const { data, error } = await req;
    if (error || !data) return [];
    const list = data.map(toProduct);
    lists.set(keyOf({ query, category, boutiqueId, sort }), { t: Date.now(), data: list });
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
  async createProduct({ boutiqueId, title, price, category, description, file }) {
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
    const { error } = await supabase.from('products').insert({ boutique_id: boutiqueId, title: t, description: d || null, price_rub: p, category, image_path });
    return error ? { ok: false, error: 'Не удалось сохранить товар.' } : { ok: true };
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
    const { data, error } = await supabase.from('measurements').select('gender,height_cm,chest_cm,waist_cm,hips_cm,shoe_eu,updated_at').maybeSingle();
    return error ? null : data;
  },
  async saveMeasurements(userId, m) {
    if (!isUuid(userId)) return 'Нужно войти';
    const row = { user_id: userId, gender: ['female', 'male'].includes(m.gender) ? m.gender : null, updated_at: new Date().toISOString() };
    for (const k of ['height_cm', 'chest_cm', 'waist_cm', 'hips_cm']) { const v = Math.round(Number(m[k])); row[k] = m[k] === '' || m[k] == null || !Number.isFinite(v) ? null : v; }
    const shoe = Number(String(m.shoe_eu ?? '').replace(',', '.'));
    row.shoe_eu = m.shoe_eu === '' || m.shoe_eu == null || !Number.isFinite(shoe) ? null : Math.round(shoe * 2) / 2;
    const { error } = await supabase.from('measurements').upsert(row, { onConflict: 'user_id' });
    if (!error) return '';
    return error.code === '23514' ? 'Проверьте значения: одно из них вне допустимого диапазона.' : 'Не удалось сохранить. Попробуйте ещё раз.';
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
