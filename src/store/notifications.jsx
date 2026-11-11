import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api/index.js';

const Ctx = createContext({ unread: 0, refresh: () => {}, setUnread: () => {} });
export const useNotifications = () => useContext(Ctx);

// Число непрочитанных: при входе, раз в минуту (пока приложение открыто) и при возвращении в приложение.
export function NotificationsProvider({ children }) {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);
  const refresh = useCallback(() => { if (user) api.unreadNotifications().then(setUnread); else setUnread(0); }, [user]);
  useEffect(() => {
    refresh();
    if (!user) return undefined;
    const tick = () => { if (document.visibilityState === 'visible') refresh(); };
    const id = setInterval(tick, 60 * 1000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [user, refresh]);
  return <Ctx.Provider value={{ unread, refresh, setUnread }}>{children}</Ctx.Provider>;
}
