import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from '../api/index.js';
import { useAuth } from '../auth/AuthContext.jsx';
const Ctx = createContext({ ids: new Set(), toggle: async () => false });
export const useWishlist = () => useContext(Ctx);
// Список избранного загружается один раз, сердечки меняются мгновенно.
export function WishlistProvider({ children }) {
  const { user } = useAuth();
  const [ids, setIds] = useState(new Set());
  useEffect(() => {
    let on = true;
    if (!user) { setIds(new Set()); return undefined; }
    api.listWishedIds().then((r) => on && setIds(new Set(r)));
    return () => { on = false; };
  }, [user]);
  const pending = useRef(new Set());
  const toggle = useCallback(async (id) => {
    if (pending.current.has(id)) return false;
    pending.current.add(id);
    const had = ids.has(id), next = new Set(ids);
    if (had) next.delete(id); else next.add(id);
    setIds(next);
    const ok = await api.setWished(id, !had);
    pending.current.delete(id);
    if (!ok) setIds(ids);
    return ok;
  }, [ids]);
  return <Ctx.Provider value={{ ids, toggle }}>{children}</Ctx.Provider>;
}
