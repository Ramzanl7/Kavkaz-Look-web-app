import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import EmptyState from '../components/EmptyState.jsx';
import { Icon } from '../components/Icons.jsx';
import { useNotifications } from '../store/notifications.jsx';
import { api } from '../api/index.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useToast } from '../store/toast.jsx';
import { useAction } from '../lib/useAction.js';
import { pushSupport, pushEnabled, enablePush, disablePush } from '../lib/push.js';

// Переключатель push-уведомлений на телефон для этого устройства.
function PushCard() {
  const { user } = useAuth();
  const toast = useToast();
  const [on, setOn] = useState(null);
  const [busy, run] = useAction();
  const support = pushSupport();
  useEffect(() => { pushEnabled().then(setOn).catch(() => setOn(false)); }, []);
  const toggle = () => run(async () => {
    if (on) { await disablePush(); setOn(false); toast('Push-уведомления выключены'); return; }
    const r = await enablePush(user.id).catch(() => 'error');
    if (r === 'ok') { setOn(true); toast('Push-уведомления включены'); }
    else toast(r === 'denied' ? 'Уведомления запрещены в настройках телефона' : 'Не удалось включить. Попробуйте ещё раз.');
  });
  return (
    <div className="push-card">
      <span className="menu-ic"><Icon name="bell" /></span>
      <span className="grow">
        <strong className="block">Push-уведомления на телефон</strong>
        <small className="muted">
          {support === 'ios-install' ? 'На iPhone: откройте сайт в Safari → «Поделиться» → «На экран „Домой“», затем включите здесь.'
            : support === 'unsupported' ? 'Этот браузер не поддерживает push-уведомления.'
            : support === 'denied' ? 'Разрешите уведомления для сайта в настройках телефона.'
            : 'О заказах и заявках — даже когда приложение закрыто.'}
        </small>
      </span>
      {support === 'ok' && on !== null && (
        <button type="button" role="switch" aria-checked={on} aria-label="Push-уведомления" className={'switch' + (on ? ' on' : '')} disabled={!!busy} onClick={toggle}><i /></button>
      )}
    </div>
  );
}

const ICON = (kind) => (kind.startsWith('order') ? 'box' : kind.startsWith('review') ? 'star' : kind.startsWith('request') ? 'store' : 'bell');
const ago = (iso) => {
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return 'только что';
  if (m < 60) return m + ' мин назад';
  if (m < 1440) return Math.round(m / 60) + ' ч назад';
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
};

export default function Notifications() {
  const { setUnread } = useNotifications();
  const [items, setItems] = useState(null);
  useEffect(() => {
    let on = true;
    api.listNotifications().then((r) => {
      if (!on) return;
      setItems(r);
      // открыл список — значит, всё прочитано (но новые оставляем подсвеченными, пока экран открыт)
      if (r.some((n) => !n.read_at)) api.markNotificationsRead().then((ok) => ok && setUnread(0));
    });
    return () => { on = false; };
  }, [setUnread]);
  return (
    <main className="wrap">
      <h1 className="screen-title rise">Уведомления</h1>
      <PushCard />
      {items === null ? <div className="skeleton" style={{ height: 200, borderRadius: 16 }} /> : items.length ? (
        <div className="menu">{items.map((n) => {
          const inner = (
            <>
              <span className="menu-ic"><Icon name={ICON(n.kind)} /></span>
              <span className="grow"><strong className="block">{n.title}</strong>{n.body && <small className="muted block">{n.body}</small>}<small className="muted">{ago(n.created_at)}</small></span>
              {!n.read_at && <i className="dot-new" aria-label="Новое" />}
            </>
          );
          return n.link
            ? <Link key={n.id} className={'menu-item press' + (n.read_at ? '' : ' unread')} to={n.link}>{inner}</Link>
            : <div key={n.id} className={'menu-item' + (n.read_at ? '' : ' unread')}>{inner}</div>;
        })}</div>
      ) : <EmptyState title="Пока тихо" text="Здесь появятся новости о заказах, отзывах и заявках." />}
    </main>
  );
}
