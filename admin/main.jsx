import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource/noto-sans/cyrillic-400.css';
import '@fontsource/noto-sans/latin-400.css';
import '@fontsource/noto-sans/cyrillic-600.css';
import '@fontsource/noto-sans/latin-600.css';
import '@fontsource/noto-sans/cyrillic-700.css';
import '@fontsource/noto-sans/latin-700.css';
import '@fontsource/noto-serif-display/cyrillic-400.css';
import '@fontsource/noto-serif-display/latin-400.css';
import '../src/design/global.css';
import '../src/design/shop.css';
import '../src/design/forms.css';
import '../src/design/ui.css';
import './admin.css';
import { AuthProvider } from '../src/auth/AuthContext.jsx';
import { ToastProvider } from '../src/store/toast.jsx';
import ErrorBoundary from '../src/components/ErrorBoundary.jsx';
import AdminApp from './AdminApp.jsx';

// Отдельный сайт админки Kavkaz Look: те же экраны, что были в приложении, но со своим входом и рабочим местом под компьютер
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter><AuthProvider><ToastProvider><ErrorBoundary><AdminApp /></ErrorBoundary></ToastProvider></AuthProvider></BrowserRouter>
  </StrictMode>,
);
