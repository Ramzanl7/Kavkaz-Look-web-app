// Превью ссылок для WhatsApp, Telegram, VK и т. п.
// Роботы мессенджеров не запускают JavaScript, поэтому для них (только для них — см. vercel.json)
// отдаём ту же index.html, но с заголовком, описанием и картинкой нужной страницы.
const SUPA = process.env.VITE_SUPABASE_URL;
const KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT = {
  title: 'Kavkaz Look — одежда бутиков Грозного и Чечни',
  description: 'Вся одежда Грозного — в одном приложении. Доставка, самовывоз или примерка в бутике. Оплата при получении.',
  image: '/og/default.jpg',
};
const STATIC = {
  '/sell': { title: 'Новые покупатели для вашего бутика — каждый день · Kavkaz Look', description: 'Подключите бутик к Kavkaz Look: заказы онлайн, доставка или самовывоз, примерка, промокоды. Подключение бесплатно, заявка за минуту.', image: '/og/sell.jpg' },
  '/welcome': DEFAULT,
  '/catalog': { ...DEFAULT, title: 'Каталог · Kavkaz Look' },
  '/boutiques': { ...DEFAULT, title: 'Бутики Грозного и Чечни · Kavkaz Look' },
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cut = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };
const rub = (n) => Number(n).toLocaleString('ru-RU') + ' ₽';
const pub = (bucket, p) => (p ? `${SUPA}/storage/v1/object/public/${bucket}/${p}` : null);

async function row(table, id, select) {
  if (!SUPA || !KEY || !UUID.test(id)) return null;
  const r = await fetch(`${SUPA}/rest/v1/${table}?id=eq.${id}&select=${encodeURIComponent(select)}&limit=1`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }, signal: AbortSignal.timeout(2500),
  });
  if (!r.ok) return null;
  const [x] = await r.json();
  return x || null;
}

// Что показать в превью для адреса страницы
export async function metaFor(path) {
  const [, kind, id] = path.split('/');
  if (STATIC[path]) return STATIC[path];
  try {
    if (kind === 'product') {
      const p = await row('products', id, 'title,price_rub,old_price_rub,description,image_path,boutique:boutiques(name,city)');
      if (p) return {
        title: `${p.title} — ${rub(p.price_rub)}`,
        description: cut([p.boutique?.name && `${p.boutique.name}${p.boutique.city ? ', ' + p.boutique.city : ''}`, p.old_price_rub > p.price_rub && `Было ${rub(p.old_price_rub)}`, p.description].filter(Boolean).join(' · '), 190) || DEFAULT.description,
        image: pub('product-images', p.image_path) || DEFAULT.image, type: 'product',
      };
    }
    if (kind === 'boutiques') {
      const b = await row('boutiques', id, 'name,description,city,cover_path,logo_path');
      if (b) return {
        title: `${b.name}${b.city ? ' · ' + b.city : ''} — бутик в Kavkaz Look`,
        description: cut(b.description, 190) || 'Смотрите ассортимент бутика, заказывайте с доставкой или откладывайте на примерку.',
        image: pub('product-images', b.cover_path) || pub('product-images', b.logo_path) || DEFAULT.image,
      };
    }
    if (kind === 'collections') {
      const c = await row('collections', id, 'title,subtitle,cover_path');
      if (c) return { title: `${c.title} · Kavkaz Look`, description: cut(c.subtitle, 190) || DEFAULT.description, image: pub('brand-media', c.cover_path) || DEFAULT.image };
    }
  } catch { /* база не ответила вовремя — покажем общее превью */ }
  return DEFAULT;
}

export function inject(html, m, url) {
  const abs = (u) => (/^https?:/.test(u) ? u : new URL(u, url).href);
  const tags = [
    `<title>${esc(m.title)}</title>`,
    `<meta name="description" content="${esc(m.description)}" />`,
    `<meta property="og:type" content="${m.type === 'product' ? 'product' : 'website'}" />`,
    `<meta property="og:site_name" content="Kavkaz Look" />`,
    `<meta property="og:locale" content="ru_RU" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:title" content="${esc(m.title)}" />`,
    `<meta property="og:description" content="${esc(m.description)}" />`,
    `<meta property="og:image" content="${esc(abs(m.image))}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
  ].join('\n    ');
  // Заменяем общий блок превью из index.html (между <!--og--> и <!--/og-->) и заголовок вкладки
  const out = html.replace(/<!--og-->[\s\S]*?<!--\/og-->/, '').replace(/<title>[\s\S]*?<\/title>/, '');
  return out.replace('</head>', `    ${tags}\n  </head>`);
}

export default async function handler(req, res) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const origin = `https://${host}`;
  const path = ('/' + String(req.query?.p || '').replace(/^\/+/, '')).split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  const [m, html] = await Promise.all([
    metaFor(path),
    fetch(`${origin}/index.html`, { headers: { 'user-agent': 'kavkaz-look-share' }, signal: AbortSignal.timeout(2500) }).then((r) => (r.ok ? r.text() : null)).catch(() => null),
  ]);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=600, stale-while-revalidate=86400');
  res.status(200).send(inject(html || '<!doctype html><html lang="ru"><head><meta charset="utf-8"></head><body></body></html>', m, origin + path));
}
