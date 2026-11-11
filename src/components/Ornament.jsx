// Орнамент Kavkaz Look — ЧЕРНОВИК «по мотивам» вайнахского орнамента:
// «бараньи рога» (стебель с двумя завитками наружу), ступенчатый ромб, зигзаг-«горы».
// Когда будут настоящие образцы, узор меняется только здесь.

const HORN = 'M0 9 V1 C0 -5 -5 -8 -9 -6 C-13 -4 -13 2 -9 3 C-6 4 -5 0 -7 -1 M0 1 C0 -5 5 -8 9 -6 C13 -4 13 2 9 3 C6 4 5 0 7 -1';

// Плитка фона 64×64 (используется полупрозрачной на всех экранах)
export function BackgroundPattern({ id = 'bgp' }) {
  return (
    <pattern id={id} width="64" height="64" patternUnits="userSpaceOnUse">
      <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <path d="M32 22 L35 25 L35 28 L38 28 L42 32 L38 36 L35 36 L35 39 L32 42 L29 39 L29 36 L26 36 L22 32 L26 28 L29 28 L29 25 Z" />
        <path d={HORN} transform="translate(32 12)" />
        <path d={HORN} transform="translate(32 52) rotate(180)" />
        <path d="M0 32 L4 28 L8 32 L4 36 Z M64 32 L60 28 L56 32 L60 36 Z" strokeWidth="1.2" />
      </g>
      <path d="M32 28.5 L35.5 32 L32 35.5 L28.5 32 Z" fill="currentColor" />
    </pattern>
  );
}

// Бордюр-полоса (заголовки, приветственный экран)
export default function Ornament({ height = 24 }) {
  return (
    <svg className="belt" width="100%" height={height} aria-hidden="true">
      <defs>
        <pattern id="orn-belt" width="48" height="24" patternUnits="userSpaceOnUse">
          <path d="M0 3 L6 0 L12 3 L18 0 L24 3 L30 0 L36 3 L42 0 L48 3 M0 21 L6 24 L12 21 L18 24 L24 21 L30 24 L36 21 L42 24 L48 21" fill="none" stroke="currentColor" strokeWidth="1.1" />
          <path d="M12 7 L17 12 L12 17 L7 12 Z" fill="currentColor" />
          <path d={HORN} transform="translate(36 13) scale(.62)" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        </pattern>
      </defs>
      <rect width="100%" height={height} fill="url(#orn-belt)" />
    </svg>
  );
}
