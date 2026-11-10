import { PNG } from 'pngjs';
import fs from 'node:fs';
// Иконка приложения рисуется при сборке: золотая буква K на тёмно-зелёном.
const BG = [6, 25, 20], GOLD = [214, 181, 106];
const SEGMENTS = [[0.32, 0.22, 0.32, 0.78], [0.32, 0.52, 0.66, 0.22], [0.44, 0.414, 0.68, 0.78]];
const dist = (px, py, [x1, y1, x2, y2]) => {
  const dx = x2 - x1, dy = y2 - y1, t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
};
function make(size, file) {
  const png = new PNG({ width: size, height: size }), SS = 3, half = 0.055;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let g = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const px = (x + (sx + 0.5) / SS) / size, py = (y + (sy + 0.5) / SS) / size;
      if (SEGMENTS.some((s) => dist(px, py, s) <= half)) g++;
    }
    const t = g / (SS * SS), i = (size * y + x) << 2;
    for (let k = 0; k < 3; k++) png.data[i + k] = Math.round(BG[k] + (GOLD[k] - BG[k]) * t);
    png.data[i + 3] = 255;
  }
  fs.writeFileSync(file, PNG.sync.write(png));
}
fs.mkdirSync('public', { recursive: true });
make(180, 'public/apple-touch-icon.png');
make(512, 'public/icon-512.png');
