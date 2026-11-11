import { useCallback, useRef, useState } from 'react';

// Защита кнопок от повторных нажатий: пока действие выполняется — повторные нажатия игнорируются
// мгновенно (через ref, без ожидания перерисовки), и после завершения действия есть пауза 0,6 с.
// Один хук может обслуживать несколько кнопок — busyKey показывает, какая именно сейчас занята.
export function useAction(cooldownMs = 600) {
  const running = useRef(false);
  const last = useRef(0);
  const [busyKey, setBusyKey] = useState(null);
  const run = useCallback(async (fn, key = true) => {
    if (running.current || Date.now() - last.current < cooldownMs) return undefined;
    running.current = true; setBusyKey(key);
    try { return await fn(); } finally {
      running.current = false; last.current = Date.now(); setBusyKey(null);
    }
  }, [cooldownMs]);
  return [busyKey, run];
}
