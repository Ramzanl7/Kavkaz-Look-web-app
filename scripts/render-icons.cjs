// Перерисовывает PNG-иконки из brand/*.svg. Запускать вручную после правки логотипа:
//   node scripts/render-icons.cjs
// Нужен Playwright с Chromium (в сборку на Vercel не входит, PNG лежат в public/ готовыми).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const jobs = [
  ['brand/logo-square.svg', 'public/apple-touch-icon.png', 180],
  ['brand/logo.svg', 'public/icon-192.png', 192],
  ['brand/logo.svg', 'public/icon-512.png', 512],
  ['brand/logo-maskable.svg', 'public/icon-maskable-512.png', 512],
];
(async () => {
  const br = await chromium.launch();
  for (const [src, out, size] of jobs) {
    const p = await br.newPage({ viewport: { width: size, height: size } });
    const svg = fs.readFileSync(path.join(root, src), 'utf8');
    await p.setContent(`<style>html,body{margin:0;background:transparent}</style><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${size}" height="${size}">`);
    await p.waitForTimeout(100);
    await p.screenshot({ path: path.join(root, out), omitBackground: true });
    await p.close();
    console.log('готово:', out);
  }
  fs.copyFileSync(path.join(root, 'brand/logo.svg'), path.join(root, 'public/favicon.svg'));
  await br.close();
})();
