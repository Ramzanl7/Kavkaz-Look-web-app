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

// Библиотеки — в отдельных файлах: они редко меняются и остаются в кэше браузера между обновлениями сайта.
export default defineConfig({
  plugins: [react(), versionFile()],
  define: { __BUILD__: JSON.stringify(BUILD), __BUILT_AT__: JSON.stringify(BUILT_AT) },
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
