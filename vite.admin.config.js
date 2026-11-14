import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Отдельная сборка админки: папка admin/ → dist-admin/. Код экранов общий с приложением (src/).
const BUILD = (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || 'dev-' + Date.now().toString(36);
const inlineCss = () => ({
  name: 'inline-css',
  enforce: 'post',
  transformIndexHtml: {
    order: 'post',
    handler(html, ctx) {
      if (!ctx.bundle) return html;
      return html.replace(/<link rel="stylesheet"[^>]*href="\/(assets\/[^"]+\.css)"[^>]*>/g, (tag, file) => {
        const a = ctx.bundle[file];
        return a && a.type === 'asset' ? '<style>' + String(a.source).replace(/<\/style/gi, '<\\/style') + '</style>' : tag;
      });
    },
  },
});

export default defineConfig({
  root: fileURLToPath(new URL('./admin', import.meta.url)),
  envDir: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: fileURLToPath(new URL('./public', import.meta.url)),
  plugins: [react(), inlineCss()],
  define: { __ADMIN_APP__: 'true', __BUILD__: JSON.stringify(BUILD), __BUILT_AT__: JSON.stringify(new Date().toISOString()) },
  build: { outDir: fileURLToPath(new URL('./dist-admin', import.meta.url)), emptyOutDir: true },
});
