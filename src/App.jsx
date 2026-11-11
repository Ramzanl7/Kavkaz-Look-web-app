import { lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import AppLayout from './layouts/AppLayout.jsx';
import RequireRole from './auth/RequireRole.jsx';
import Welcome from './pages/Welcome.jsx';
import Catalog from './pages/Catalog.jsx';
import Stub from './pages/Stub.jsx';

// Остальные экраны грузятся только когда их открывают — покупатель не скачивает код админки и продавца.
const Nearby = lazy(() => import('./pages/Nearby.jsx'));
const Product = lazy(() => import('./pages/Product.jsx'));
const Cart = lazy(() => import('./pages/Cart.jsx'));
const Login = lazy(() => import('./pages/Login.jsx'));
const Profile = lazy(() => import('./pages/Profile.jsx'));
const Boutiques = lazy(() => import('./pages/Boutiques.jsx'));
const BoutiqueDetails = lazy(() => import('./pages/BoutiqueDetails.jsx'));
const Wishlist = lazy(() => import('./pages/Wishlist.jsx'));
const BecomeSeller = lazy(() => import('./pages/BecomeSeller.jsx'));
const Partners = lazy(() => import('./pages/Partners.jsx'));
const Orders = lazy(() => import('./pages/Orders.jsx'));
const SellerHome = lazy(() => import('./pages/SellerHome.jsx'));
const SellerProducts = lazy(() => import('./pages/SellerProducts.jsx'));
const SellerProductNew = lazy(() => import('./pages/SellerProductNew.jsx'));
const SellerOrders = lazy(() => import('./pages/SellerOrders.jsx'));
const Admin = lazy(() => import('./pages/Admin.jsx'));
const Support = lazy(() => import('./pages/Support.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));
const Privacy = lazy(() => import('./pages/Privacy.jsx'));
const AdminStats = lazy(() => import('./pages/AdminStats.jsx'));
const Measurements = lazy(() => import('./pages/Measurements.jsx'));

// Когда главная уже показана и браузер свободен — заранее подгружаем экраны нижнего меню,
// чтобы переход по вкладкам был мгновенным.
const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1500));
idle(() => { import('./pages/Boutiques.jsx'); import('./pages/Wishlist.jsx'); import('./pages/Cart.jsx'); import('./pages/Profile.jsx'); import('./pages/Product.jsx'); });

const ANY = ['buyer', 'seller', 'admin'];

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Welcome />} />
      <Route element={<AppLayout />}>
        <Route path="/login" element={<Login />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/catalog" element={<Catalog />} />
        <Route path="/nearby/:category" element={<Nearby />} />
        <Route path="/partners" element={<Partners />} />
        <Route path="/boutiques" element={<Boutiques />} />
        <Route path="/boutiques/:id" element={<BoutiqueDetails />} />
        <Route path="/product/:id" element={<Product />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/support" element={<Support />} />
        <Route element={<RequireRole roles={ANY} />}>
          <Route path="/wishlist" element={<Wishlist />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/become-seller" element={<BecomeSeller />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/measurements" element={<Measurements />} />
          <Route path="/notifications" element={<Stub title="Уведомления" hint="Скоро здесь появятся уведомления о заказах." />} />
        </Route>
        <Route element={<RequireRole roles={['seller']} />}>
          <Route path="/seller" element={<SellerHome />} />
          <Route path="/seller/products" element={<SellerProducts />} />
          <Route path="/seller/products/new" element={<SellerProductNew />} />
          <Route path="/seller/orders" element={<SellerOrders />} />
        </Route>
        <Route element={<RequireRole roles={['admin']} />}>
          <Route path="/admin" element={<Admin />} />
          <Route path="/admin/stats" element={<AdminStats />} />
        </Route>
        <Route path="*" element={<Stub title="Страница не найдена" hint="Проверьте адрес или вернитесь в каталог." />} />
      </Route>
    </Routes>
  );
}
