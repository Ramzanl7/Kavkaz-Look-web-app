import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import EmptyState from '../components/EmptyState.jsx';
import { Icon } from '../components/Icons.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { useToast } from '../store/toast.jsx';
import { api } from '../api/index.js';
import { ADMIN_URL } from '../lib/sites.js';
import { buildLabel } from '../lib/updater.js';
import { useAction } from '../lib/useAction.js';
import { useNotifications } from '../store/notifications.jsx';
import { useWishlist } from '../store/wishlist.jsx';
import { useMyProfile } from '../store/profile.js';
import { history } from '../lib/local.js';
import Avatar from '../components/Avatar.jsx';
import ProductCard from '../components/ProductCard.jsx';

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
  const me = useMyProfile(user?.id ?? null);
  const { ids: wished } = useWishlist();
  const [orders, setOrders] = useState(null), [follows, setFollows] = useState(null), [recent, setRecent] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, run] = useAction();
  useEffect(() => {
    if (!user) return;
    api.listMyOrders(user.id).then((l) => setOrders(l || []));
    api.listMyFollows().then((l) => setFollows(l || []));
  }, [user]);
  // недавно просмотренные — с этого устройства, до 12 последних
  useEffect(() => { const ids = history.list().slice(0, 12); if (ids.length) api.listProductsByIds(ids).then((l) => setRecent(l || [])); else setRecent([]); }, []);
  const [supportUnread, setSupportUnread] = useState(0);
  useEffect(() => { if (user) api.supportUnread().then(setSupportUnread); }, [user]);

  if (loading) return <main className="wrap"><p className="lead">Загрузка…</p></main>;
  if (!user) return (
    <main className="wrap">
      <h1 className="screen-title">Профиль</h1>
      <EmptyState title="Вы не вошли" action={<Link className="btn btn-primary press" to="/login">Войти</Link>} />
      <div className="menu"><Item to="/support" icon="chat" label="Поддержка" /><Item to="/privacy" icon="shield" label="Политика конфиденциальности" /></div>
    </main>
  );

  const shown = me?.name || user.email?.split('@')[0] || 'Пользователь';
  const active = (orders || []).filter((o) => !['done', 'cancelled'].includes(o.status)).length;
  const missing = me?.extended && !(me.phone && me.address);
  const isAdmin = role === 'admin';
  const removeAccount = () => run(async () => {
    const err = await api.deleteMyAccount();
    if (err) { toast(err); return; }
    toast('Аккаунт удалён');
    nav('/home', { replace: true });
  });

  return (
    <main className="wrap">
      <section className="profile-head rise">
        <Link to="/settings" className="avatar-edit press" aria-label="Изменить фото и данные профиля">
          <Avatar src={me?.avatar} name={shown} size={96} />
          <span className="avatar-pen" aria-hidden="true"><Icon name="pen" /></span>
        </Link>
        <h1 className="profile-name">{shown}</h1>
        <span className="muted small">{user.email}</span>
        <span className={isAdmin ? 'role-badge gold' : 'role-badge'}>{ROLES[role] || ROLES.buyer}</span>
        <Link to="/settings" className="btn btn-secondary btn-sm press">Редактировать профиль</Link>
      </section>

      <div className="profile-stats rise" style={{ '--d': 1 }}>
        <Link to="/orders" className="pstat press"><b>{orders === null ? '·' : orders.length}</b><span>Заказы</span>{active > 0 && <i className="pill-count">{active}</i>}</Link>
        <Link to="/wishlist" className="pstat press"><b>{wished.size}</b><span>Избранное</span></Link>
        <Link to="/following" className="pstat press"><b>{follows === null ? '·' : follows.length}</b><span>Бутики</span></Link>
      </div>

      {missing && (
        <Link to="/settings" className="profile-hint press rise" style={{ '--d': 1 }}>
          <span className="menu-ic"><Icon name="phone" /></span>
          <span className="grow"><strong>Добавьте телефон и адрес</strong><small>Заказ будет оформляться в одно касание</small></span>
          <Icon name="chevron" />
        </Link>
      )}

      {isAdmin && (
        <a className="admin-card press rise" href={ADMIN_URL + '/admin'} style={{ '--d': 1 }}>
          <span className="menu-ic"><Icon name="star" /></span>
          <span className="grow"><strong>Панель администратора</strong><small>Статистика, пользователи, заявки, поддержка</small></span>
          <Icon name="chevron" />
        </a>
      )}

      {recent && recent.length > 0 && (
        <section className="home-sec rise" style={{ '--d': 2 }} aria-labelledby="recent-h">
          <div className="sec-head2">
            <h2 id="recent-h"><Icon name="clock" />Недавно просмотренные</h2>
            <Link className="sec-link" to="/history">Все <Icon name="arrow" /></Link>
          </div>
          <div className="hscroll popular">{recent.map((p, i) => <ProductCard key={p.id} p={p} i={i} variant="compact" />)}</div>
        </section>
      )}

      <h2 className="menu-title">Покупки</h2>
      <nav className="menu rise" style={{ '--d': 3 }} aria-label="Покупки">
        <Item to="/orders" icon="box" label="Мои заказы" badge={active} />
        <Item to="/wishlist" icon="heart" label="Избранное" />
        <Item to="/following" icon="store" label="Мои бутики" />
        <Item to="/history" icon="clock" label="История просмотров" />
        <Item to="/measurements" icon="ruler" label="Мои мерки" />
      </nav>

      <h2 className="menu-title">Аккаунт</h2>
      <nav className="menu rise" style={{ '--d': 4 }} aria-label="Аккаунт">
        <Item to="/settings" icon="user" label="Личные данные и пароль" />
        <Item to="/notifications" icon="bell" label="Уведомления" badge={unread} />
        <Item to="/invite" icon="send" label="Пригласить друзей" />
        {role === 'seller'
          ? <Item to="/seller" icon="store" label="Кабинет продавца" />
          : !isAdmin && <Item to="/sell" icon="store" label="Подключить свой бутик" />}
      </nav>

      <h2 className="menu-title">Помощь</h2>
      <nav className="menu rise" style={{ '--d': 5 }} aria-label="Помощь">
        <Item to={supportUnread ? '/support/chat' : '/support'} icon="chat" label="Поддержка" badge={supportUnread} />
        <Item to="/privacy" icon="shield" label="Политика конфиденциальности" />
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
