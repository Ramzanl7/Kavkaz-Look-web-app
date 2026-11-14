import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Номер сборки: короткий хэш коммита на Vercel (или время сборки локально).
const BUILD = (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || 'dev-' + Date.now().toString(36);
const BUILT_AT = new Date().toISOString();

// Кладёт version.json рядом с сайтом: приложение сверяет его со своей версией и обновляется само.
const versionFile = () => ({
  name: 'version-file',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD, builtAt: BUILT_AT }) });
  },
});

// Встраивает основные стили прямо в страницу: оформление приходит вместе с HTML,
// и при медленной связи приложение не показывается «голым», пока догружается файл стилей.
const inlineCss = () => ({
  name: 'inline-css',
  enforce: 'post',
  transformIndexHtml: {
    order: 'post',
    handler(html, ctx) {
      if (!ctx.bundle) return html;
      return html.replace(/<link rel="stylesheet"[^>]*href="\/(assets\/[^"]+\.css)"[^>]*>/g, (tag, file) => {
        const asset = ctx.bundle[file];
        if (!asset || asset.type !== 'asset') return tag;
        return '<style>' + String(asset.source).replace(/<\/style/gi, '<\\/style') + '</style>';
      });
    },
  },
});

// Библиотеки — в отдельных файлах: они редко меняются и остаются в кэше браузера между обновлениями сайта.
export default defineConfig({
  plugins: [react(), versionFile(), inlineCss()],
  define: { __ADMIN_APP__: 'false', __BUILD__: JSON.stringify(BUILD), __BUILT_AT__: JSON.stringify(BUILT_AT) },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler|cookie|set-cookie-parser)[\\/]/ },
            { name: 'supabase', test: /node_modules[\\/]@supabase[\\/]/ },
          ],
        },
      },
    },
  },
});
