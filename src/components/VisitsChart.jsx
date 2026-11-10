import { useEffect, useRef, useState } from 'react';

// Столбцы с накоплением: вошедшие пользователи (снизу) + гости (сверху) по дням.
// Цвета проверены на различимость при дальтонизме на фоне карточки (#14261A).
export const SERIES = [
  { key: 'users', label: 'Пользователи', color: '#B38B45' },
  { key: 'guests', label: 'Гости', color: '#3A8FD6' },
];
const H = 200, PAD_L = 32, PAD_B = 22, PAD_T = 10, GAP = 2;
const fmtDay = (d) => new Date(d + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
const niceMax = (v) => { if (v <= 4) return 4; const p = 10 ** Math.floor(Math.log10(v)); const n = [1, 2, 2.5, 5, 10].find((m) => m * p >= v); return n * p; };

export default function VisitsChart({ series }) {
  const box = useRef(null);
  const [w, setW] = useState(340);
  const [hover, setHover] = useState(null);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  if (!series?.length) return null;

  const max = niceMax(Math.max(1, ...series.map((d) => d.users + d.guests)));
  const plotW = w - PAD_L, plotH = H - PAD_B - PAD_T;
  const slot = plotW / series.length;
  const bw = Math.max(2, Math.min(24, slot - GAP));
  const y = (v) => PAD_T + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max];
  const labelEvery = Math.ceil(series.length / 5);
  const h = hover != null ? series[hover] : null;

  // Прямоугольник со скруглённым верхом (4px) и прямым низом.
  const bar = (x, top, bottom, round) => {
    const ht = bottom - top; if (ht <= 0) return '';
    const r = round ? Math.min(4, bw / 2, ht) : 0;
    return `M${x},${bottom}V${top + r}${r ? `Q${x},${top} ${x + r},${top}H${x + bw - r}Q${x + bw},${top} ${x + bw},${top + r}` : `H${x + bw}`}V${bottom}Z`;
  };

  return (
    <div className="chart" ref={box}>
      <div className="legend">
        {SERIES.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>)}
      </div>
      <svg width={w} height={H} role="img" aria-label="Посещения по дням: пользователи и гости" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD_L} x2={w} y1={y(t)} y2={y(t)} className="grid" />
            <text x={PAD_L - 6} y={y(t) + 4} textAnchor="end" className="tick">{t}</text>
          </g>
        ))}
        {series.map((d, i) => {
          const x = PAD_L + i * slot + (slot - bw) / 2;
          const u = y(d.users), g = y(d.users + d.guests), base = y(0);
          const both = d.users > 0 && d.guests > 0;
          return (
            <g key={d.day} opacity={hover == null || hover === i ? 1 : 0.45}>
              {d.users > 0 && <path d={bar(x, u, base, d.guests === 0)} fill={SERIES[0].color} />}
              {d.guests > 0 && <path d={bar(x, g, both ? u - GAP : base, true)} fill={SERIES[1].color} />}
              <rect x={PAD_L + i * slot} y={PAD_T} width={slot} height={plotH} fill="transparent"
                onMouseEnter={() => setHover(i)} onClick={() => setHover(hover === i ? null : i)} />
              {i % labelEvery === 0 && <text x={x + bw / 2} y={H - 6} textAnchor="middle" className="tick">{fmtDay(d.day)}</text>}
            </g>
          );
        })}
      </svg>
      {h && (
        <div className="tip" role="status">
          <strong>{fmtDay(h.day)}</strong>
          {SERIES.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}: <b>{h[s.key]}</b></span>)}
          <span className="muted">Новых регистраций: {h.signups}</span>
        </div>
      )}
    </div>
  );
}
