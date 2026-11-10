import { createContext, useCallback, useContext, useRef, useState } from 'react';
const Ctx = createContext(() => {});
export const useToast = () => useContext(Ctx);
export function ToastProvider({ children }) {
  const [t, setT] = useState(null);
  const timer = useRef();
  const show = useCallback((m) => { setT({ m, n: Date.now() }); clearTimeout(timer.current); timer.current = setTimeout(() => setT(null), 1800); }, []);
  return <Ctx.Provider value={show}>{children}{t && <div className="toast" role="status" key={t.n}>{t.m}</div>}</Ctx.Provider>;
}
