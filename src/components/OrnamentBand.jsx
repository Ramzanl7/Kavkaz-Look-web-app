import { useEffect, useId, useRef, useState } from 'react';
import { BELT } from './ornamentPaths.js';

// Живой орнамент Kavkaz Look: узор проявляется от центра, когда попадает на экран,
// по золоту время от времени пробегает блик. Без анимации, если в системе включено «Уменьшить движение».
export default function OrnamentBand({ height = 30, delay = 0 }) {
  const ref = useRef(null);
  const [on, setOn] = useState(false);
  const id = useId().replace(/:/g, '');
  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) { setOn(true); return undefined; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const w = Math.round(height * BELT.w / BELT.h);
  return (
    <div ref={ref} className={'oband' + (on ? ' on' : '')} style={{ '--od': delay + 's' }} aria-hidden="true">
      <i />
      <svg viewBox={`0 0 ${BELT.w} ${BELT.h}`} width={w} height={height}>
        <defs>
          <linearGradient id={'g' + id} gradientUnits="userSpaceOnUse" x1="-400" y1="0" x2="400" y2="0">
            <stop offset="0" stopColor="#C9A55A" /><stop offset=".5" stopColor="#FFF4D6" /><stop offset="1" stopColor="#C9A55A" />
            <animateTransform attributeName="gradientTransform" type="translate" values={`-400 0;-400 0;${BELT.w + 400} 0`} keyTimes="0;.45;1" dur="6s" repeatCount="indefinite" />
          </linearGradient>
          <clipPath id={'c' + id}><rect className="oband-reveal" x="0" y="0" width={BELT.w} height={BELT.h} /></clipPath>
        </defs>
        <g clipPath={`url(#c${id})`}><path d={BELT.d} fill={`url(#g${id})`} fillRule="evenodd" /></g>
      </svg>
      <i />
    </div>
  );
}
