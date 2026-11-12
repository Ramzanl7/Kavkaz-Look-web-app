// Сборка манекена в фоновом потоке: интерфейс не подвисает.
// Модель тела (human.bin.gz рядом, MakeHuman CC0) загружается один раз; тело кэшируется по меркам,
// при смене размера пересобирается только одежда.
import { parseHuman, buildHuman } from './human.js';
import { dressHuman } from './dress.js';

const hexRgb = (hex) => { const n = parseInt(String(hex).replace('#', ''), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); };

let H = null, loading = null, cache = { key: '', built: null };
// файл сжат gzip (1,1 МБ вместо 2,3) — распаковываем встроенным DecompressionStream
const load = () => (loading ||= fetch(new URL('./human.bin.gz', import.meta.url)).then((r) => {
  if (!r.ok) throw new Error('model ' + r.status);
  return r.arrayBuffer();
}).then(async (b) => {
  const u = new Uint8Array(b, 0, 2);
  // если сервер уже распаковал (Content-Encoding) — данные идут как есть
  if (u[0] === 0x1f && u[1] === 0x8b) b = await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  H = parseHuman(b);
}).catch((e) => { loading = null; throw e; }));

self.onmessage = async ({ data }) => {
  const { id, body, look, garment } = data;
  try {
    await load();
    const shape = { gender: body.gender, height: body.height, weight: body.weight, chest: body.chest, waist: body.waist, hips: body.hips, shoulder: body.shoulder, inseam: body.inseam };
    const key = JSON.stringify(shape);
    if (cache.key !== key) cache = { key, built: buildHuman(H, shape) };
    const { P, N } = cache.built;
    let g = null;
    if (garment) {
      const rgb = hexRgb(garment.color);
      const status = Object.fromEntries((garment.fit || []).map((z) => [z.zone, hexRgb(garment.statusColors[z.status])]));
      g = { type: garment.type, length: garment.length, fit: garment.fit || [], rgb, shoeRoom: garment.shoeRoom || 0, colorFor: (zone) => (garment.heat && status[zone]) || rgb };
    }
    const clothes = dressHuman(H, P, body, g, look || {});
    const meshes = [{ part: 'body', position: P.slice(), normal: N.slice(), index: H.tri.body.slice() }, ...clothes.map((m) => ({ part: m.part, rgb: m.rgb || null, position: m.position, normal: m.normal, color: m.color || null, index: m.index }))];
    self.postMessage({ id, meshes, height: body.height }, meshes.flatMap((m) => [m.position.buffer, m.normal.buffer, m.index.buffer, ...(m.color ? [m.color.buffer] : [])]));
  } catch (e) {
    self.postMessage({ id, error: String(e?.message || e) });
  }
};
