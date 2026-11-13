// Картинки-превью для ссылок (WhatsApp, Telegram): public/og/*.jpg, 1200×630. Запуск: node scripts/render-og.cjs
const { chromium } = require('playwright'); const fs = require('fs'); const os = require('os'); const path = require('path');
const R = path.resolve(__dirname, '..');
let belt;
const font = (f) => 'data:font/woff2;base64,' + fs.readFileSync(R + '/node_modules/@fontsource/' + f).toString('base64');
const hero = 'data:image/jpeg;base64,' + fs.readFileSync(R + '/src/assets/home-hero.jpg').toString('base64');
const page = (eyebrow, h1, gold, sub) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:KLSerif;src:url(${font('noto-serif-display/files/noto-serif-display-cyrillic-400-normal.woff2')});unicode-range:U+0400-04FF}
@font-face{font-family:KLSerif;src:url(${font('noto-serif-display/files/noto-serif-display-latin-400-normal.woff2')});unicode-range:U+0000-00FF,U+2000-206F}
@font-face{font-family:KLSans;font-weight:600;src:url(${font('noto-sans/files/noto-sans-cyrillic-600-normal.woff2')});unicode-range:U+0400-04FF}
@font-face{font-family:KLSans;font-weight:600;src:url(${font('noto-sans/files/noto-sans-latin-600-normal.woff2')});unicode-range:U+0000-00FF,U+2000-206F}
@font-face{font-family:KLSans;font-weight:700;src:url(${font('noto-sans/files/noto-sans-cyrillic-700-normal.woff2')});unicode-range:U+0400-04FF}
@font-face{font-family:KLSans;font-weight:700;src:url(${font('noto-sans/files/noto-sans-latin-700-normal.woff2')});unicode-range:U+0000-00FF,U+2000-206F}
body{margin:0;width:1200px;height:630px;overflow:hidden;background:#061A13;font-family:KLSans}
.bg{position:absolute;inset:0;background:linear-gradient(90deg,#061A13 0%,rgba(6,26,19,.94) 48%,rgba(6,26,19,.5) 74%,rgba(6,26,19,.2) 100%),linear-gradient(0deg,rgba(6,26,19,.9),transparent 42%)}
.ph{position:absolute;right:-160px;top:-70px;height:780px;opacity:.95}
.c{position:absolute;left:80px;top:70px;right:80px}
.brand{display:flex;align-items:center;gap:16px;color:#D9B765;font-weight:700;font-size:26px;letter-spacing:.2em;text-transform:uppercase}
.brand i{width:46px;height:2px;background:#D9B765}
h1{font-family:KLSerif;font-weight:400;color:#F5F2E9;font-size:74px;line-height:1.08;margin:34px 0 0;max-width:820px}
h1 em{font-style:normal;color:#D9B765}
p{color:#E7E2D3;font-size:30px;font-weight:600;margin:28px 0 0}
.orn{position:absolute;left:80px;right:80px;bottom:56px;display:flex;align-items:center;gap:22px}
.orn i{flex:1;height:2px;background:linear-gradient(90deg,transparent,rgba(217,183,101,.75))}.orn i:last-child{background:linear-gradient(270deg,transparent,rgba(217,183,101,.75))}
</style></head><body><img class="ph" src="${hero}"><div class="bg"></div><div class="c"><div class="brand"><i></i>${eyebrow}</div><h1>${h1} <em>${gold}</em></h1><p>${sub}</p></div>
<div class="orn"><i></i><svg viewBox="0 0 ${belt.w} ${belt.h}" width="190" height="${Math.round(190 * belt.h / belt.w)}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F4E7C0"/><stop offset=".5" stop-color="#D6B56A"/><stop offset="1" stop-color="#B38B45"/></linearGradient></defs><path d="${belt.d}" fill="url(#g)" fill-rule="evenodd"/></svg><i></i></div></body></html>`;
(async () => {
  ({ BELT: belt } = await import(path.join(R, 'src/components/ornamentPaths.js')));
  const br = await chromium.launch(); const p = await br.newPage({ viewport: { width: 1200, height: 630 } });
  for (const [name, args] of Object.entries({
    default: ['Kavkaz Look · Стиль Кавказа', 'Вся одежда Грозного&nbsp;—', 'в одном приложении', 'Бутики Чечни · доставка, самовывоз, примерка'],
    sell: ['Kavkaz Look · для бутиков', 'Новые покупатели для вашего бутика&nbsp;—', 'каждый день', 'Подключение бесплатно · заявка за минуту'],
  })) {
    const f = path.join(os.tmpdir(), 'kl-og-' + name + '.html'); fs.writeFileSync(f, page(...args));
    await p.goto('file://' + f); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
    await p.screenshot({ path: R + '/public/og/' + name + '.jpg', type: 'jpeg', quality: 86 });
  }
  await br.close();
})();
