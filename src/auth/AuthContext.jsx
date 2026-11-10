import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
const Ctx = createContext({ user: null, role: null, loading: true });
export const useAuth = () => useContext(Ctx);
// Роль нужна только для показа нужных экранов. Настоящие права проверяет база.
export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, role: null, loading: true });
  useEffect(() => {
    let on = true;
    const load = async (session) => {
      const user = session?.user ?? null;
      if (!user) { if (on) setState({ user: null, role: null, loading: false }); return; }
      const { data } = await supabase.from('profiles').select('role,is_blocked').eq('id', user.id).maybeSingle();
      if (!on) return;
      if (data?.is_blocked) { await supabase.auth.signOut(); setState({ user: null, role: null, loading: false }); return; }
      setState({ user, role: data?.role ?? 'buyer', loading: false });
    };
    supabase.auth.getSession().then(({ data }) => load(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => { setTimeout(() => load(session), 0); });
    return () => { on = false; sub.subscription.unsubscribe(); };
  }, []);
  return <Ctx.Provider value={{ ...state, signOut: () => supabase.auth.signOut() }}>{children}</Ctx.Provider>;
}
