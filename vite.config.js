import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// Библиотеки — в отдельных файлах: они редко меняются и остаются в кэше браузера между обновлениями сайта.
export default defineConfig({
  plugins: [react()],
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
