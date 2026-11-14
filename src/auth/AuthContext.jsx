import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { CONSENT_VERSION } from '../lib/consent.js';
import { disablePush, resumePush } from '../lib/push.js';
const EMPTY = { user: null, role: null, blocked: null, needsConsent: false, loading: false };
const Ctx = createContext({ ...EMPTY, loading: true });
export const useAuth = () => useContext(Ctx);
// Роль нужна только для показа нужных экранов. Настоящие права проверяет база.
export function AuthProvider({ children }) {
  const [state, setState] = useState({ ...EMPTY, loading: true });
  const load = useCallback(async (session) => {
    const user = session?.user ?? null;
    if (!user) { setState(EMPTY); return; }
    resumePush(user.id);
    // Приглашение: код из ссылки ?ref= засчитываем один раз (база примет только для нового аккаунта)
    let ref = null; try { ref = localStorage.getItem('kl-ref'); } catch { /* приватный режим */ }
    if (ref) supabase.rpc('claim_referral', { code: ref }).then(({ error }) => { if (!error || error.code !== 'PGRST202') try { localStorage.removeItem('kl-ref'); } catch { /* */ } });
    let { data, error } = await supabase.from('profiles').select('role,is_blocked,blocked_reason,consent_version').eq('id', user.id).maybeSingle();
    if (error) ({ data } = await supabase.from('profiles').select('role,is_blocked').eq('id', user.id).maybeSingle());
    setState({
      user, role: data?.role ?? 'buyer', loading: false,
      blocked: data?.is_blocked ? { reason: data.blocked_reason || '' } : null,
      needsConsent: !error && data?.consent_version !== CONSENT_VERSION,
    });
  }, []);
  useEffect(() => {
    let on = true;
    const run = (s) => on && load(s);
    supabase.auth.getSession().then(({ data }) => run(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => { setTimeout(() => run(session), 0); });
    return () => { on = false; sub.subscription.unsubscribe(); };
  }, [load]);
  const refresh = useCallback(async () => { const { data } = await supabase.auth.getSession(); await load(data.session); }, [load]);
  return <Ctx.Provider value={{ ...state, refresh, signOut: async () => { await disablePush({ keepDevice: true }); return supabase.auth.signOut(); } }}>{children}</Ctx.Provider>;
}
