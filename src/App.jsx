import { Routes, Route } from 'react-router-dom';
import AppLayout from './layouts/AppLayout.jsx';
import RequireRole from './auth/RequireRole.jsx';
import Welcome from './pages/Welcome.jsx';
import Catalog from './pages/Catalog.jsx';
import Nearby from './pages/Nearby.jsx';
import Product from './pages/Product.jsx';
import Cart from './pages/Cart.jsx';
import Login from './pages/Login.jsx';
import Profile from './pages/Profile.jsx';
import Boutiques from './pages/Boutiques.jsx';
import BoutiqueDetails from './pages/BoutiqueDetails.jsx';
import Wishlist from './pages/Wishlist.jsx';
import BecomeSeller from './pages/BecomeSeller.jsx';
import Partners from './pages/Partners.jsx';
import Orders from './pages/Orders.jsx';
import SellerHome from './pages/SellerHome.jsx';
import SellerProducts from './pages/SellerProducts.jsx';
import SellerProductNew from './pages/SellerProductNew.jsx';
import SellerOrders from './pages/SellerOrders.jsx';
import Admin from './pages/Admin.jsx';
import Stub from './pages/Stub.jsx';

const ANY = ['buyer', 'seller', 'admin'];

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Welcome />} />
      <Route element={<AppLayout />}>
        <Route path="/login" element={<Login />} />
        <Route path="/privacy" element={<Stub title="Политика конфиденциальности" hint="Документ готовится вместе с юристом." />} />
        <Route path="/catalog" element={<Catalog />} />
        <Route path="/nearby/:category" element={<Nearby />} />
        <Route path="/partners" element={<Partners />} />
        <Route path="/boutiques" element={<Boutiques />} />
        <Route path="/boutiques/:id" element={<BoutiqueDetails />} />
        <Route path="/product/:id" element={<Product />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/profile" element={<Profile />} />
        <Route element={<RequireRole roles={ANY} />}>
          <Route path="/wishlist" element={<Wishlist />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/become-seller" element={<BecomeSeller />} />
        </Route>
        <Route element={<RequireRole roles={['seller']} />}>
          <Route path="/seller" element={<SellerHome />} />
          <Route path="/seller/products" element={<SellerProducts />} />
          <Route path="/seller/products/new" element={<SellerProductNew />} />
          <Route path="/seller/orders" element={<SellerOrders />} />
        </Route>
        <Route element={<RequireRole roles={['admin']} />}>
          <Route path="/admin" element={<Admin />} />
        </Route>
        <Route path="*" element={<Stub title="Страница не найдена" hint="Проверьте адрес или вернитесь в каталог." />} />
      </Route>
    </Routes>
  );
}
