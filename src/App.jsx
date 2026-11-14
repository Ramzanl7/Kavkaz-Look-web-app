import { lazy, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ADMIN_URL } from './lib/sites.js';
import AppLayout from './layouts/AppLayout.jsx';
import RequireRole from './auth/RequireRole.jsx';
import Welcome from './pages/Welcome.jsx';
import Home from './pages/Home.jsx';
import Stub from './pages/Stub.jsx';

// Остальные экраны грузятся только когда их открывают — покупатель не скачивает код админки и продавца.
const Catalog = lazy(() => import('./pages/Catalog.jsx'));
const Nearby = lazy(() => import('./pages/Nearby.jsx'));
const Product = lazy(() => import('./pages/Product.jsx'));
const Cart = lazy(() => import('./pages/Cart.jsx'));
const Login = lazy(() => import('./pages/Login.jsx'));
const Profile = lazy(() => import('./pages/Profile.jsx'));
const Boutiques = lazy(() => import('./pages/Boutiques.jsx'));
const BoutiqueDetails = lazy(() => import('./pages/BoutiqueDetails.jsx'));
const Wishlist = lazy(() => import('./pages/Wishlist.jsx'));
const Partners = lazy(() => import('./pages/Partners.jsx'));
const Orders = lazy(() => import('./pages/Orders.jsx'));
const SellerHome = lazy(() => import('./pages/SellerHome.jsx'));
const SellerProducts = lazy(() => import('./pages/SellerProducts.jsx'));
const SellerProductNew = lazy(() => import('./pages/SellerProductNew.jsx'));
const SellerOrders = lazy(() => import('./pages/SellerOrders.jsx'));
const Support = lazy(() => import('./pages/Support.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));
const Privacy = lazy(() => import('./pages/Privacy.jsx'));
const ResetPassword = lazy(() => import('./pages/ResetPassword.jsx'));
const CollectionPage = lazy(() => import('./pages/CollectionPage.jsx'));
const Following = lazy(() => import('./pages/Following.jsx'));
const SellerProfile = lazy(() => import('./pages/SellerProfile.jsx'));
const SellerStats = lazy(() => import('./pages/SellerStats.jsx'));
const SupportChat = lazy(() => import('./pages/SupportChat.jsx'));
const History = lazy(() => import('./pages/History.jsx'));
const Brands = lazy(() => import('./pages/Brands.jsx'));
const Measurements = lazy(() => import('./pages/Measurements.jsx'));
const Notifications = lazy(() => import('./pages/Notifications.jsx'));
const Stylist = lazy(() => import('./pages/Stylist.jsx'));
const SellerReviews = lazy(() => import('./pages/SellerReviews.jsx'));
const SellerPayments = lazy(() => import('./pages/SellerPayments.jsx'));
const SellerHelp = lazy(() => import('./pages/SellerHelp.jsx'));
const SellerPromos = lazy(() => import('./pages/SellerPromos.jsx'));
const Sell = lazy(() => import('./pages/Sell.jsx'));
const Invite = lazy(() => import('./pages/Invite.jsx'));
const TryOn = lazy(() => import('./pages/TryOn.jsx'));

// Когда главная уже показана и браузер свободен — заранее подгружаем экраны нижнего меню,
// чтобы переход по вкладкам был мгновенным.
const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1500));
idle(() => { import('./pages/Boutiques.jsx'); import('./pages/Wishlist.jsx'); import('./pages/Cart.jsx'); import('./pages/Profile.jsx'); import('./pages/Product.jsx'); });

const ANY = ['buyer', 'seller', 'admin'];
function ToAdminSite() {
  const { pathname, search } = useLocation();
  useEffect(() => { window.location.replace(ADMIN_URL + pathname + search); }, [pathname, search]);
  return <main className="wrap"><p className="lead">Открываем админку…</p></main>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Welcome />} />
      <Route path="/welcome" element={<Welcome />} />
      <Route element={<AppLayout />}>
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/home" element={<Home />} />
        <Route path="/catalog" element={<Catalog />} />
        <Route path="/nearby/:category" element={<Nearby />} />
        <Route path="/partners" element={<Partners />} />
        <Route path="/sell" element={<Sell />} />
        <Route path="/become-seller" element={<Navigate to="/sell" replace />} />
        <Route path="/boutiques" element={<Boutiques />} />
        <Route path="/boutiques/:id" element={<BoutiqueDetails />} />
        <Route path="/product/:id" element={<Product />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/support" element={<Support />} />
        <Route path="/stylist" element={<Stylist />} />
        <Route path="/history" element={<History />} />
        <Route path="/brands" element={<Brands />} />
        <Route path="/collections/:id" element={<CollectionPage />} />
        <Route path="/tryon/:id" element={<TryOn />} />
        <Route element={<RequireRole roles={ANY} />}>
          <Route path="/wishlist" element={<Wishlist />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/measurements" element={<Measurements />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/following" element={<Following />} />
          <Route path="/invite" element={<Invite />} />
          <Route path="/support/chat" element={<SupportChat />} />
        </Route>
        <Route element={<RequireRole roles={['seller']} />}>
          <Route path="/seller" element={<SellerHome />} />
          <Route path="/seller/products" element={<SellerProducts />} />
          <Route path="/seller/products/new" element={<SellerProductNew />} />
          <Route path="/seller/products/:id/edit" element={<SellerProductNew />} />
          <Route path="/seller/orders" element={<SellerOrders />} />
          <Route path="/seller/orders/:oid" element={<SellerOrders />} />
          <Route path="/seller/orders/:action/:oid" element={<SellerOrders />} />
          <Route path="/seller/profile" element={<SellerProfile />} />
          <Route path="/seller/stats" element={<SellerStats />} />
          <Route path="/seller/promos" element={<SellerPromos />} />
          <Route path="/seller/reviews" element={<SellerReviews />} />
          <Route path="/seller/payments" element={<SellerPayments />} />
          <Route path="/seller/help" element={<SellerHelp />} />
        </Route>
        {/* Админка — отдельный сайт; старые ссылки (в том числе из уведомлений) ведут туда */}
        <Route path="/admin/*" element={<ToAdminSite />} />
        <Route path="*" element={<Stub title="Страница не найдена" hint="Проверьте адрес или вернитесь на главную." />} />
      </Route>
    </Routes>
  );
}
