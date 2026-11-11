import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { RATE_LIMIT_EVENT } from '../api/index.js';
const Ctx = createContext(() => {});
export const useToast = () => useContext(Ctx);
export function ToastProvider({ children }) {
  const [t, setT] = useState(null);
  const timer = useRef();
  const show = useCallback((m) => { setT({ m, n: Date.now() }); clearTimeout(timer.current); timer.current = setTimeout(() => setT(null), 1800); }, []);
  useEffect(() => {
    const on = () => show('Слишком много действий подряд. Подождите немного.');
    window.addEventListener(RATE_LIMIT_EVENT, on);
    return () => window.removeEventListener(RATE_LIMIT_EVENT, on);
  }, [show]);
  return <Ctx.Provider value={show}>{children}{t && <div className="toast" role="status" key={t.n}>{t.m}</div>}</Ctx.Provider>;
}
