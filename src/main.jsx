import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
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
import App from './App.jsx';
import { startUpdater } from './lib/updater.js';

startUpdater();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter><AuthProvider><CartProvider><ToastProvider><WishlistProvider><App /></WishlistProvider></ToastProvider></CartProvider></AuthProvider></BrowserRouter>
  </StrictMode>
);
