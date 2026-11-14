import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { installViewportFix } from './lib/viewportFix.js';
// Только кириллица и латиница: другие алфавиты приложению не нужны.
import '@fontsource/noto-sans/cyrillic-400.css';
import '@fontsource/noto-sans/latin-400.css';
import '@fontsource/noto-sans/cyrillic-600.css';
import '@fontsource/noto-sans/latin-600.css';
import '@fontsource/noto-sans/cyrillic-700.css';
import '@fontsource/noto-sans/latin-700.css';
import '@fontsource/noto-serif-display/cyrillic-400.css';
import '@fontsource/noto-serif-display/latin-400.css';
import './design/global.css';
import './design/shop.css';
import './design/forms.css';
import './design/ui.css';
import { AuthProvider } from './auth/AuthContext.jsx';
import { CartProvider } from './store/cart.jsx';
import { ToastProvider } from './store/toast.jsx';
import { WishlistProvider } from './store/wishlist.jsx';
import { NotificationsProvider } from './store/notifications.jsx';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { startUpdater } from './lib/updater.js';
import { guardStyles } from './lib/cssGuard.js';
import { keepPushWorker } from './lib/push.js';

startUpdater();
guardStyles();
// Приложение запустилось нормально — разрешаем снова одну автоперезагрузку при сбое загрузки экрана
setTimeout(() => { try { sessionStorage.removeItem('kl-chunk-reload'); } catch { /* приватный режим */ } }, 15000);
// Если у фото товара нет уменьшенной копии (_t.jpg — например, товар загружен до появления превью),
// на любом экране подставляем основное фото.
addEventListener('error', (e) => {
  const img = e.target;
  if (img?.tagName === 'IMG' && /_t\.jpg(\?|$)/.test(img.src)) img.src = img.src.replace(/_t\.jpg(\?|$)/, '.jpg$1');
}, true);
// Ссылка-приглашение ?ref=КОД: запоминаем код до входа, засчитываем после (AuthContext)
try { const ref = new URLSearchParams(location.search).get('ref'); if (ref && /^[A-Za-z0-9]{6,10}$/.test(ref)) localStorage.setItem('kl-ref', ref.toUpperCase()); } catch { /* приватный режим */ }
keepPushWorker();

installViewportFix();
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter><AuthProvider><CartProvider><ToastProvider><WishlistProvider><NotificationsProvider><ErrorBoundary><App /></ErrorBoundary></NotificationsProvider></WishlistProvider></ToastProvider></CartProvider></AuthProvider></BrowserRouter>
  </StrictMode>
);
