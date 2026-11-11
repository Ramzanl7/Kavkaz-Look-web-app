import { BELT, COLUMN } from './ornamentPaths.js';

// Орнамент Kavkaz Look по образцам владельца проекта, в нашем золоте.
// Фон — вертикальная колонка орнамента плиткой (очень приглушённо), бордюр — завитки по центру с линиями по бокам.

const TILE_W = 64;                                   // ширина колонки в плитке фона, px
const TILE_H = Math.round(TILE_W * COLUMN.h / COLUMN.w);
const GAP_X = 30, GAP_Y = 18;

export function BackgroundPattern({ id = 'bgp' }) {
  const w = TILE_W + GAP_X, h = TILE_H + GAP_Y;
  const s = TILE_W / COLUMN.w;
  return (
    <pattern id={id} width={w} height={h} patternUnits="userSpaceOnUse">
      <path d={COLUMN.d} fill="currentColor" fillRule="evenodd" transform={`translate(${GAP_X / 2} ${GAP_Y / 2}) scale(${s})`} />
    </pattern>
  );
}

export default function Ornament({ height = 28 }) {
  const w = Math.round(height * BELT.w / BELT.h);
  return (
    <div className="belt" aria-hidden="true">
      <i />
      <svg viewBox={`0 0 ${BELT.w} ${BELT.h}`} width={w} height={height}>
        <defs>
          <linearGradient id="orn-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#F4E7C0" /><stop offset=".5" stopColor="#D6B56A" /><stop offset="1" stopColor="#B38B45" />
          </linearGradient>
        </defs>
        <path d={BELT.d} fill="url(#orn-gold)" fillRule="evenodd" />
      </svg>
      <i />
    </div>
  );
}
