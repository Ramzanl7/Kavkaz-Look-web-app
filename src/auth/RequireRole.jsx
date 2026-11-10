import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
// Закрыто по умолчанию: без нужной роли пускать некуда. Реальная защита всё равно в правилах базы.
export default function RequireRole({ roles }) {
  const { role, loading } = useAuth();
  if (loading) return null;
  return roles.includes(role) ? <Outlet /> : <Navigate to="/login" replace />;
}
