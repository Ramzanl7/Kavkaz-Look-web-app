import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import EmptyState from '../components/EmptyState.jsx';
import { Icon } from '../components/Icons.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { useToast } from '../store/toast.jsx';
import { api } from '../api/index.js';
import { buildLabel } from '../lib/updater.js';
import { useAction } from '../lib/useAction.js';
import { useNotifications } from '../store/notifications.jsx';

const ROLES = { buyer: 'Покупатель', seller: 'Продавец', admin: 'Администратор' };

const Item = ({ to, icon, label, d, badge }) => (
  <Link className="menu-item press" to={to} style={{ '--d': d }}>
    <span className="menu-ic"><Icon name={icon} /></span>
    <span className="grow">{label}</span>
    {badge > 0 && <i className="pill-count">{badge > 99 ? '99+' : badge}</i>}
    <span className="menu-arrow"><Icon name="chevron" /></span>
  </Link>
);

export default function Profile() {
  const { user, role, loading, signOut } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const { unread } = useNotifications();
  const [name, setName] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, run] = useAction();
  useEffect(() => { if (user) api.getProfileName(user.id).then(setName); }, [user]);

  if (loading) return <main className="wrap"><p className="lead">Загрузка…</p></main>;
  if (!user) return (
    <main className="wrap">
      <h1 className="screen-title">Профиль</h1>
      <EmptyState title="Вы не вошли" action={<Link className="btn btn-primary press" to="/login">Войти</Link>} />
      <div className="menu"><Item to="/support" icon="chat" label="Поддержка" /><Item to="/privacy" icon="shield" label="Политика конфиденциальности" /></div>
    </main>
  );

  const shown = name || user.email?.split('@')[0] || 'Пользователь';
  const isAdmin = role === 'admin';
  const removeAccount = () => run(async () => {
    const err = await api.deleteMyAccount();
    if (err) { toast(err); return; }
    toast('Аккаунт удалён');
    nav('/catalog', { replace: true });
  });

  return (
    <main className="wrap">
      <section className="profile-head rise">
        <div className="avatar" aria-hidden="true">{shown[0].toUpperCase()}</div>
        <h1 className="profile-name">{shown}</h1>
        <span className={isAdmin ? 'role-badge gold' : 'role-badge'}>{ROLES[role] || ROLES.buyer}</span>
      </section>

      {isAdmin && (
        <Link className="admin-card press rise" to="/admin" style={{ '--d': 1 }}>
          <span className="menu-ic"><Icon name="star" /></span>
          <span className="grow"><strong>Панель администратора</strong><small>Статистика, пользователи, заявки, поддержка</small></span>
          <Icon name="chevron" />
        </Link>
      )}

      <nav className="menu rise" style={{ '--d': 2 }} aria-label="Меню профиля">
        <Item to="/orders" icon="box" label="Мои заказы" />
        <Item to="/measurements" icon="ruler" label="Мои мерки" />
        <Item to="/wishlist" icon="heart" label="Избранное" />
        <Item to="/following" icon="store" label="Мои бутики" />
        <Item to="/support" icon="chat" label="Поддержка" />
        <Item to="/notifications" icon="bell" label="Уведомления" badge={unread} />
        <Item to="/settings" icon="sliders" label="Настройки" />
        <Item to="/privacy" icon="shield" label="Политика конфиденциальности" />
        {role === 'seller'
          ? <Item to="/seller" icon="store" label="Кабинет продавца" />
          : !isAdmin && <Item to="/become-seller" icon="store" label="Стать партнёром" />}
      </nav>

      <div className="profile-foot rise" style={{ '--d': 3 }}>
        <button type="button" className="link-muted" onClick={() => setConfirming(true)}>Удалить аккаунт</button>
        <button type="button" className="logout press" onClick={signOut}><Icon name="logout" />Выйти</button>
      </div>

      <p className="version">Версия {buildLabel()}</p>

      {confirming && createPortal(
        <div className="sheet-bg" role="presentation" onClick={() => !busy && setConfirming(false)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="del-t" onClick={(e) => e.stopPropagation()}>
            <h2 id="del-t">Удалить аккаунт?</h2>
            <p className="lead">Аккаунт, имя, избранное и отзывы будут удалены навсегда. Заказы останутся у продавцов без вашего имени и почты. Отменить это нельзя.</p>
            <button type="button" className="btn btn-danger press" disabled={busy} onClick={removeAccount}>{busy ? 'Удаляем…' : 'Да, удалить навсегда'}</button>
            <button type="button" className="btn btn-secondary press" disabled={busy} onClick={() => setConfirming(false)}>Отмена</button>
          </div>
        </div>,
        document.body,
      )}
    </main>
  );
}
