import { useLayoutEffect, useRef } from 'react';

// Цифры номера с ведущей 7: «8…» → «7…», «9…» → «79…». added — дописали ли 7 спереди.
function norm(raw) {
  let d = String(raw).replace(/\D/g, '');
  let added = false;
  if (!d) return { d, added };
  if (d[0] === '8') d = '7' + d.slice(1);
  else if (d[0] !== '7') { d = '7' + d; added = true; }
  return { d: d.slice(0, 11), added };
}
// 7XXXXXXXXXX → +7 (XXX) XXX-XX-XX, по мере ввода
export function formatPhone(raw) {
  const { d } = norm(raw);
  if (!d) return '';
  const p = [d.slice(1, 4), d.slice(4, 7), d.slice(7, 9), d.slice(9, 11)];
  return '+7' + (p[0] ? ' (' + p[0] : '') + (p[0].length === 3 ? ')' : '') + (p[1] ? ' ' + p[1] : '') + (p[2] ? '-' + p[2] : '') + (p[3] ? '-' + p[3] : '');
}
export const phoneComplete = (v) => String(v).replace(/\D/g, '').length === 11;

// Поле телефона с маской: стирание работает как в обычном поле (скобки и дефисы не мешают),
// курсор остаётся там, где правите, а не прыгает в конец.
export default function PhoneInput({ value, onChange, ...props }) {
  const ref = useRef(null);
  const caret = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current, n = caret.current;
    if (el == null || n == null || document.activeElement !== el) return;
    caret.current = null;
    let pos = value.length;
    if (n === 0) pos = 0;
    else for (let i = 0, seen = 0; i < value.length; i++) if (/\d/.test(value[i]) && ++seen === n) { pos = i + 1; break; }
    el.setSelectionRange(pos, pos);
  });
  const handle = (e) => {
    const el = e.target, raw = el.value;
    const at = el.selectionStart ?? raw.length;
    const deleting = /^delete/.test(e.nativeEvent?.inputType || '');
    let digits = raw.replace(/\D/g, '');
    let before = raw.slice(0, at).replace(/\D/g, '').length;
    // Стёрли только скобку, пробел или дефис — стираем и цифру перед ним
    if (deleting && digits === value.replace(/\D/g, '') && before > 0) {
      digits = digits.slice(0, before - 1) + digits.slice(before);
      before -= 1;
    }
    // Остался только код страны — поле пустое, чтобы можно было начать заново
    if (deleting && digits.length <= 1) { caret.current = 0; onChange(''); return; }
    const { added } = norm(digits);
    caret.current = Math.min(11, before + (added ? 1 : 0));
    const next = formatPhone(digits);
    if (next === value) { el.value = value; const keep = caret.current; caret.current = null; let pos = value.length; for (let i = 0, seen = 0; i < value.length; i++) if (/\d/.test(value[i]) && ++seen === keep) { pos = i + 1; break; } el.setSelectionRange(pos, pos); return; }
    onChange(next);
  };
  return <input ref={ref} type="tel" inputMode="tel" autoComplete="tel" placeholder="+7 (900) 000-00-00" {...props} value={value} onChange={handle} />;
}
