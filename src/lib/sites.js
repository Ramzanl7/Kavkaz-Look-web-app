// Адреса двух сайтов: приложение для покупателей и отдельная админка
export const SITE_URL = (import.meta.env.VITE_SITE_URL || 'https://kavkaz-look.vercel.app').replace(/\/$/, '');
export const ADMIN_URL = (import.meta.env.VITE_ADMIN_URL || 'https://kavkaz-look-admin.vercel.app').replace(/\/$/, '');
