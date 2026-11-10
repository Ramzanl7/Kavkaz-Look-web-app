import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import EmptyState from '../components/EmptyState.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { useToast } from '../store/toast.jsx';
import { api } from '../api/index.js';
const roles = { buyer: 'Покупатель', seller: 'Продавец', admin: 'Администратор' };
export default function Profile() {
  const { user, role, loading, signOut } = useAuth();
  const toast = useToast();
  const [name, setName] = useState('');
  useEffect(() => { if (user) api.getProfileName(user.id).then(setName); }, [user]);
  if (loading) return <main className="wrap"><p className="lead">Загрузка…</p></main>;
  if (!user) return <main className="wrap"><h1 className="screen-title">Профиль</h1><EmptyState title="Вы не вошли" action={<Link className="btn btn-primary press" to="/login">Войти</Link>} /></main>;
  const save = async () => { toast((await api.setProfileName(user.id, name)) ? 'Имя сохранено' : 'Не удалось сохранить'); };
  return (
    <main className="wrap">
      <h1 className="screen-title rise">Профиль</h1>
      <div className="bcard"><strong>{user.email}</strong><span className="muted">{roles[role] || 'Покупатель'}</span></div>
      <div className="field"><label htmlFor="nm">Имя для отзывов</label><input id="nm" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} /></div>
      <button type="button" className="btn btn-secondary press" onClick={save}>Сохранить имя</button>
      <div className="list">
        <Link className="tile press" to="/wishlist">Избранное</Link>
        <Link className="tile press" to="/orders">Мои заказы</Link>
        {role === 'buyer' && <Link className="tile press" to="/become-seller">Подать заявку на бутик</Link>}
        {role === 'seller' && <Link className="tile press" to="/seller">Кабинет продавца</Link>}
        {role === 'admin' && <Link className="tile press" to="/admin">Админ-панель</Link>}
      </div>
      <button type="button" className="btn btn-secondary press" onClick={signOut}>Выйти</button>
    </main>
  );
}
