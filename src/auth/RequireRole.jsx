import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
// Закрыто по умолчанию: без нужной роли пускать некуда. Реальная защита всё равно в правилах базы.
export default function RequireRole({ roles }) {
  const { role, loading } = useAuth();
  const { pathname } = useLocation();
  if (loading) return null;
  if (roles.includes(role)) return <Outlet />;
  // Во время анимации перехода старый экран ещё мгновение на месте — не перенаправляем повторно.
  if (pathname === '/login') return null;
  return <Navigate to="/login" replace state={{ from: pathname }} />;
}
