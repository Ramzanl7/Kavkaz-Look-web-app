// Сборка манекена в фоновом потоке: интерфейс не подвисает, пока считаются сетки.
// Тело кэшируется по меркам и внешности — при смене размера пересобирается только одежда.
import { buildBody, buildClothes } from './model.js';

const hexRgb = (hex) => { const n = parseInt(String(hex).replace('#', ''), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); };

let cache = { key: '', built: null };

self.onmessage = ({ data }) => {
  const { id, body, look, garment } = data;
  try {
    const key = JSON.stringify([{ ...body, pref: null }, look]);
    if (cache.key !== key) cache = { key, built: buildBody({ body, look }) };
    let g = null;
    if (garment) {
      const rgb = hexRgb(garment.color);
      const status = Object.fromEntries((garment.fit || []).map((z) => [z.zone, hexRgb(garment.statusColors[z.status])]));
      g = { type: garment.type, length: garment.length, fit: garment.fit || [], rgb, shoeRoom: garment.shoeRoom || 0, colorFor: (zone) => (garment.heat && status[zone]) || rgb };
    }
    const meshes = [...cache.built.meshes, ...buildClothes(body, cache.built, g)];
    // копии массивов: кэшированные сетки тела остаются в потоке для следующих сборок
    const out = meshes.map((m) => ({ part: m.part, base: !!m.base, lowres: !!m.lowres, rgb: m.rgb || null, position: m.position.slice(), normal: m.normal.slice(), color: m.color ? m.color.slice() : null, index: m.index.slice() }));
    self.postMessage({ id, meshes: out, height: cache.built.height }, out.flatMap((m) => [m.position.buffer, m.normal.buffer, m.index.buffer, ...(m.color ? [m.color.buffer] : [])]));
  } catch (e) {
    self.postMessage({ id, error: String(e?.message || e) });
  }
};
