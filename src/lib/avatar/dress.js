import { smin, smax, ellipsoid, roundCone, loft } from './sdf.js';
import { surfaceNets } from './mesh.js';
// Одежда, волосы, платок и обувь на реалистичном теле.
// Вещь — оболочка поверх вспомогательных сеток MakeHuman («колготки» и «юбка», они повторяют фигуру):
// отступ от тела по зонам из расчёта посадки + сглаживание (ткань не повторяет мелкий рельеф тела),
// края — ровный срез по линии подола, рукава и выреза.

const TAU = Math.PI * 2;
const ss = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * Math.min(1, Math.max(0, t));
const centroid = (P, idx) => { let x = 0, y = 0, z = 0; for (const i of idx) { x += P[i * 3]; y += P[i * 3 + 1]; z += P[i * 3 + 2]; } return [x / idx.length, y / idx.length, z / idx.length]; };

// уровни фигуры после подгонки и позы (см)
export function levels(H, P) {
  const ringY = (r) => { let y = 0; for (const i of r) y += P[i * 3 + 1]; return y / r.length; };
  const J = (n) => centroid(P, H.joint[n]);
  const shL = J('joint-l-shoulder'), shR = J('joint-r-shoulder');
  return {
    bustY: ringY(H.ring.bust), waistY: ringY(H.ring.waist), hipY: ringY(H.ring.hips), crotch: P[H.key.crotch * 3 + 1],
    shY: (shL[1] + shR[1]) / 2, shX: Math.abs(shL[0] - shR[0]) / 2, neck: J('joint-neck'), head: J('joint-head'),
    kneeY: (J('joint-l-knee')[1] + J('joint-r-knee')[1]) / 2, ankleY: (J('joint-l-ankle')[1] + J('joint-r-ankle')[1]) / 2,
    sh: { l: shL, r: shR }, wr: { l: J('joint-l-hand'), r: J('joint-r-hand') }, height: P[H.key.top * 3 + 1],
  };
}

// ---------- сеточные инструменты ----------
function normalsOf(P, tri, n) {
  const N = new Float32Array(n * 3);
  for (let t = 0; t < tri.length; t += 3) {
    const a = tri[t] * 3, b = tri[t + 1] * 3, c = tri[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const q of [a, b, c]) { N[q] += nx; N[q + 1] += ny; N[q + 2] += nz; }
  }
  for (let i = 0; i < N.length; i += 3) { const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1; N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; }
  return N;
}
function neighbors(tri, verts) {
  const m = new Map(verts.map((v) => [v, new Set()]));
  for (let t = 0; t < tri.length; t += 3) for (let k = 0; k < 3; k++) {
    const a = tri[t + k], b = tri[t + (k + 1) % 3];
    if (m.has(a) && m.has(b)) { m.get(a).add(b); m.get(b).add(a); }
  }
  return m;
}
// треугольники, у которых все вершины — из набора
const subTris = (tri, set) => { const out = []; for (let t = 0; t < tri.length; t += 3) if (set.has(tri[t]) && set.has(tri[t + 1]) && set.has(tri[t + 2])) out.push(tri[t], tri[t + 1], tri[t + 2]); return out; };

// Оболочка: P — все вершины, src — треугольники исходной сетки, off(i) — отступ, keep(i) — скаляр среза (≥0 — оставить),
// drape — сколько сглаживать (ткань «перекрывает» впадины тела)
function shell(P, src, { off, keep, drape = 8, minOff = 0.3, hold = 0.6 }) {
  const verts = [...new Set(src)];
  const N = normalsOf(P, src, P.length / 3);
  const G = new Map(), O = new Map();
  for (const v of verts) { const o = off(v); O.set(v, o); G.set(v, [P[v * 3] + N[v * 3] * o, P[v * 3 + 1] + N[v * 3 + 1] * o, P[v * 3 + 2] + N[v * 3 + 2] * o]); }
  const nb = neighbors(src, verts);
  for (let it = 0; it < drape; it++) {
    const next = new Map();
    for (const v of verts) {
      const g = G.get(v), ns = nb.get(v); let x = 0, y = 0, z = 0;
      for (const u of ns) { const q = G.get(u); x += q[0]; y += q[1]; z += q[2]; }
      const n = ns.size || 1; let p = [lerp(g[0], x / n, 0.5), lerp(g[1], y / n, 0.5), lerp(g[2], z / n, 0.5)];
      // не проваливаться внутрь тела: расстояние вдоль нормали не меньше минимума
      const d = (p[0] - P[v * 3]) * N[v * 3] + (p[1] - P[v * 3 + 1]) * N[v * 3 + 1] + (p[2] - P[v * 3 + 2]) * N[v * 3 + 2];
      const need = Math.max(minOff, O.get(v) * hold);
      if (d < need) p = [p[0] + N[v * 3] * (need - d), p[1] + N[v * 3 + 1] * (need - d), p[2] + N[v * 3 + 2] * (need - d)];
      next.set(v, p);
    }
    for (const [v, p] of next) G.set(v, p);
  }
  return clip(G, src, keep);
}

// Ровный срез по нулевой линии скаляра (как «маршевые треугольники»)
function clip(G, tri, keep) {
  const pos = [], idx = [], at = new Map(), S = new Map();
  const sv = (v) => { if (!S.has(v)) S.set(v, keep(v, G.get(v))); return S.get(v); };
  const vert = (v) => { const k = 'v' + v; if (!at.has(k)) { at.set(k, pos.length / 3); pos.push(...G.get(v)); } return at.get(k); };
  const edge = (a, b) => {
    const k = a < b ? `e${a}_${b}` : `e${b}_${a}`;
    if (!at.has(k)) { const sa = sv(a), sb = sv(b), t = sa / (sa - sb), p = G.get(a), q = G.get(b); at.set(k, pos.length / 3); pos.push(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t); }
    return at.get(k);
  };
  for (let t = 0; t < tri.length; t += 3) {
    const v = [tri[t], tri[t + 1], tri[t + 2]], s = v.map(sv), inside = s.map((x) => x >= 0), n = inside.filter(Boolean).length;
    if (n === 0) continue;
    if (n === 3) { idx.push(vert(v[0]), vert(v[1]), vert(v[2])); continue; }
    // поворачиваем так, чтобы «особая» вершина была первой
    let r = 0; while (inside[r] === (n === 1 ? false : true)) r++;
    const a = v[r], b = v[(r + 1) % 3], c = v[(r + 2) % 3];
    if (n === 1) idx.push(vert(a), edge(a, b), edge(a, c));
    else { const ab = edge(a, b), ac = edge(a, c); idx.push(ab, vert(b), vert(c), ab, vert(c), ac); }
  }
  return { position: new Float32Array(pos), index: pos.length / 3 > 65535 ? new Uint32Array(idx) : new Uint16Array(idx) };
}

function finish(m, part, rgb, colorAt) {
  const n = m.position.length / 3;
  m.normal = normalsOf(m.position, m.index, n);
  if (colorAt) { m.color = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const c = colorAt(m.position[i * 3], m.position[i * 3 + 1], m.position[i * 3 + 2]); m.color.set(c, i * 3); } }
  return { part, rgb, ...m };
}

// ---------- вещи ----------
export function dressHuman(H, P, body, g, look) {
  const L = levels(H, P), out = [];
  const tights = H.tri['helper-tights'], skirt = H.tri['helper-skirt'];
  const armW = (i) => Math.max(H.arm[i * 4], H.arm[i * 4 + 2]) / 255 || 0;
  // параметр вдоль руки 0 (плечо) … 1 (запястье)
  const armT = (i) => {
    const side = P[i * 3] > 0 ? 'l' : 'r', a = L.sh[side], b = L.wr[side];
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], l2 = dx * dx + dy * dy + dz * dz;
    return ((P[i * 3] - a[0]) * dx + (P[i * 3 + 1] - a[1]) * dy + (P[i * 3 + 2] - a[2]) * dz) / l2;
  };
  const armLen = Math.hypot(L.wr.l[0] - L.sh.l[0], L.wr.l[1] - L.sh.l[1], L.wr.l[2] - L.sh.l[2]);
  const type = g?.type || 'none';

  // отступ по зонам (см): плавно между грудью, талией и бёдрами; на плечах вещь лежит по телу
  const zoneOff = (o) => (y) => {
    if (y >= L.bustY) return lerp(o.chest, Math.min(o.chest, 1.0), ss((y - L.bustY) / (L.shY - L.bustY)));
    if (y >= L.waistY) return o.waist + (o.chest - o.waist) * ss((y - L.waistY) / (L.bustY - L.waistY));
    return o.hips + (o.waist - o.hips) * ss((y - L.hipY) / (L.waistY - L.hipY));
  };

  // верх (рубашка, платье, пальто, туника): «колготки» выше бёдер + рукава; ниже бёдер — «юбка» до подола
  const top = ({ hemY, sleeveT, offY, drape, flare = 0 }) => {
    const parts = [];
    const cutY = hemY < L.hipY ? L.hipY - 4 : hemY;
    const upper = shell(P, tights, {
      off: (i) => offY(P[i * 3 + 1]) * (1 - armW(i) * 0.35),
      keep: (i, p) => { const w = armW(i), sleeve = (sleeveT - armT(i)) * armLen; const body = p[1] - cutY; return w > 0.5 ? Math.min(sleeve, body + 40) : lerp(body, Math.min(body, sleeve), w * 2); },
      drape,
    });
    parts.push(upper);
    if (hemY < L.hipY) {
      parts.push(shell(P, skirt, {
        off: (i) => { const y = P[i * 3 + 1]; return offY(Math.max(y, L.hipY)) + 0.6 + flare * Math.max(0, L.hipY - y); },
        keep: (i, p) => Math.min(p[1] - hemY, L.waistY - p[1]),
        drape: drape + 4,
      }));
    }
    return parts;
  };
  // брюки: ноги «колготок» между подолом и поясом, без рук
  const pants = ({ hemY, offY, straight = 0, drape }) => [shell(P, tights, {
    off: (i) => { const y = P[i * 3 + 1]; return offY(Math.max(y, L.hipY)) + straight * ss((L.kneeY + 10 - y) / 25); },
    keep: (i, p) => Math.min(p[1] - hemY, L.waistY + 1.5 - p[1], (0.35 - armW(i)) * 40),
    drape,
  })];

  // ----- посадка примеряемой вещи -----
  const off = {};
  if (g && ['dress', 'top', 'outer', 'pants', 'skirt'].includes(type)) {
    for (const z of ['chest', 'waist', 'hips']) {
      const zf = g.fit.find((q) => q.zone === z);
      off[z] = !zf ? 0.8 : zf.status === 'tight' ? 0.35 : 0.6 + (Math.max(0, zf.delta) / TAU) * 1.1;
    }
    if (type === 'pants' || type === 'skirt') off.chest = off.waist;
    if (type === 'outer') for (const z in off) off[z] += 0.8; // поверх базы
  }
  const lower = type === 'pants' || type === 'skirt';

  // ----- нейтральная база: манекен всегда одет скромно -----
  const base = body.gender === 'male' ? [0.3, 0.33, 0.36] : [0.33, 0.36, 0.4];
  const f = body.gender !== 'male';
  if (!['top', 'outer', 'dress'].includes(type)) {
    const lift = lower ? Math.max(off.waist, off.hips) + 0.8 : 0;
    const bo = { chest: 1.4 + lift * 0.4, waist: Math.max(1.6 + (body.chest - body.waist) / TAU * 0.5, lift), hips: Math.max(1.8, lift) };
    const hem = lower ? L.hipY - 4 : f ? L.crotch - 0.07 * body.height : L.hipY - 5;
    for (const m of top({ hemY: hem, sleeveT: 0.96, offY: zoneOff(bo), drape: 12, flare: 0.04 })) out.push(finish(m, 'cloth', base));
  }
  const dressShort = type === 'dress' && L.shY - g.length > L.ankleY + 6;
  if (!['pants', 'dress', 'skirt'].includes(type) || dressShort || type === 'skirt') {
    const thin = type === 'dress' || type === 'skirt';
    const topY = type === 'dress' ? L.shY - g.length + 6 : type === 'skirt' ? L.waistY - g.length + 6 : L.waistY;
    const hemY = L.ankleY + (type === 'shoes' ? 5 : 1.5);
    for (const m of pants({ hemY, offY: () => (thin ? 0.3 : 1.0), straight: thin ? 0 : 2.2, drape: thin ? 2 : 10 })) {
      out.push(finish(thin ? clipY(m, topY) : m, 'cloth', base));
    }
  }

  // ----- примеряемая вещь -----
  if (g && type !== 'none') {
    const offY = zoneOff(off);
    const colorAt = (x, y) => g.colorFor(y < (L.hipY + L.waistY) / 2 ? 'hips' : y < (L.waistY + L.bustY) / 2 ? 'waist' : 'chest');
    const sleeveColor = (x, y, z) => (Math.abs(x) > L.shX * 0.95 && y > L.hipY - 10 ? g.colorFor('chest') : colorAt(x, y, z));
    const drape = 6 + Math.round(Math.max(0, off.hips || 0) * 2.5);
    let parts = [];
    if (type === 'dress' || type === 'top' || type === 'outer') {
      const hemY = Math.max(2, L.shY - g.length);
      parts = top({ hemY, sleeveT: type === 'outer' ? 0.97 : 0.93, offY, drape, flare: type === 'top' ? 0 : 0.05 + Math.max(0, off.hips - 1.5) * 0.02 });
      parts.forEach((m) => out.push(finish(m, 'cloth', g.rgb, sleeveColor)));
    } else if (type === 'skirt') {
      const hemY = Math.max(2, L.waistY - g.length);
      out.push(finish(shell(P, skirt, { off: (i) => offY(Math.max(P[i * 3 + 1], L.hipY)) + 0.6 + 0.06 * Math.max(0, L.hipY - P[i * 3 + 1]), keep: (i, p) => Math.min(p[1] - hemY, L.waistY + 1.5 - p[1]), drape: drape + 4 }), 'cloth', g.rgb, colorAt));
    } else if (type === 'pants') {
      const hemY = Math.max(0.8, L.crotch - g.length);
      pants({ hemY, offY, straight: 1 + off.hips * 0.4, drape }).forEach((m) => out.push(finish(m, 'cloth', g.rgb, colorAt)));
    } else if (type === 'shoes') {
      out.push(...shoes(H, P, L, g));
    }
  }
  out.push(...hair(H, P, L, look, body));
  return out;
}

// оставить часть сетки ниже уровня (под платьем брюки видны только у щиколоток)
function clipY(m, topY) {
  const G = new Map(); for (let i = 0; i < m.position.length / 3; i++) G.set(i, [m.position[i * 3], m.position[i * 3 + 1], m.position[i * 3 + 2]]);
  return clip(G, m.index, (i) => topY - G.get(i)[1]);
}

// ----- обувь: гладкая колодка по размерам стопы (пятка, подъём, мыс без пальцев), плоская подошва; запас по длине — в носок -----
function shoes(H, P, L, g) {
  const out = [];
  for (const side of [1, -1]) {
    let heel = null, toe = null, x0 = 1e9, x1 = -1e9, n = 0, cx = 0;
    for (let i = 0; i < H.nBody; i++) {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      if (y > L.ankleY + 2 || Math.sign(x) !== side) continue;
      if (!heel || z < heel[2]) heel = [x, y, z];
      if (!toe || z > toe[2]) toe = [x, y, z];
      if (y < 3) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
      cx += x; n++;
    }
    if (!n) continue;
    cx /= n;
    const len = toe[2] - heel[2], w = Math.max(6, x1 - x0), room = g.shoeRoom || 0;
    const bx = heel[0], tx = toe[0] + (cx - toe[0]) * 0.3, ankle = [cx, L.ankleY, heel[2] + len * 0.22];
    const parts = [
      { ...ellipsoid([bx, 3.6, heel[2] + 3.4], [w * 0.38, 3.6, 3.8]), k: 3 },
      { ...ellipsoid([(bx + tx) / 2, 2.9, heel[2] + len * 0.52], [w * 0.5, 2.9, len * 0.36]), k: 3 },
      { ...roundCone([ankle[0], L.ankleY + 2, ankle[2]], [tx * 0.7 + bx * 0.3, 3.2, heel[2] + len * 0.68], 3.6, 2.4), k: 3 },
      { ...ellipsoid([tx, 2.3, heel[2] + len * 0.8 + room * 0.6], [w * 0.46, 2.2, len * 0.2 + room * 0.4]), k: 3 },
    ];
    const last = (x, y, z) => { let d = 1e9; for (const p of parts) d = smin(d, p.f(x, y, z), p.k); return d; };
    const f = (x, y, z) => {
      let d = last(x, y, z) - 0.8;
      d = smax(d, y - (L.ankleY + 1.5 - Math.min(2, Math.max(0, z - ankle[2] - 2) * 0.3)), 1); // вырез: к носку ниже
      d = smax(d, -y, 0.3); // подошва на полу
      const sole = smax(Math.abs(y - 0.6) - 0.7, last(x, 1.5, z) - 1.1, 0.4);
      return smin(d, sole, 0.8);
    };
    const m = surfaceNets(f, [cx - w - 4, -0.5, heel[2] - 4, cx + w + 4, L.ankleY + 4, toe[2] + room + 4], 0.4, () => g.colorFor('length'));
    out.push({ part: 'cloth', rgb: g.rgb, position: m.position, normal: m.normal, index: m.index, color: m.color });
  }
  return out;
}

// ----- волосы, платок, борода (из кожи головы со сдвигом наружу) -----
function hair(H, P, L, look, body) {
  const out = [];
  const T = H.tri.body, hd = L.head, nk = L.neck, hh = hd[1] - nk[1];
  const headSet = new Set();
  for (const i of H.faceVerts) if (P[i * 3 + 1] > nk[1] - hh * 0.4) headSet.add(i);
  const headTri = subTris(T, headSet);
  const dark = [0.05, 0.035, 0.03];
  // u: −1 затылок … +1 лицо; линия роста волос
  const u = (i) => (P[i * 3 + 2] - hd[2]) / (hh * 0.9);
  const ear = (i) => { const dx = Math.abs(P[i * 3] - hd[0]) / hh, dy = (P[i * 3 + 1] - hd[1]) / hh, dz = (P[i * 3 + 2] - hd[2]) / hh; return dx > 0.5 && dy > -0.45 && dy < 0.2 && dz > -0.35 && dz < 0.25; };
  if (look.hair === 'short' || look.hair === 'long') {
    const longer = look.hair === 'long';
    const line = (i) => hd[1] + hh * (0.15 + 0.5 * ss((u(i) - 0.25) / 0.6)) - hh * (longer ? 0.75 : 0.55) * ss((0.15 - u(i)) / 0.9);
    out.push(finish(shell(P, headTri, { off: (i) => 0.25 + (longer ? 1.0 : 0.7) * ss((P[i * 3 + 1] - line(i)) / 3), keep: (i) => (ear(i) ? -1 : P[i * 3 + 1] - line(i)), drape: 6, minOff: 0.15 }), 'hair', dark));
    if (longer) out.push(bun(hd, hh));
  }
  if (look.hair === 'scarf') out.push(scarf(H, P, L));
  if (body.gender === 'male' && (look.beard === 'short' || look.beard === 'full')) {
    const t = look.beard === 'full' ? 0.75 : 0.4;
    // подбородок — нижняя точка лица; борода от линии челюсти, к ушам — бакенбарды
    let chin = 1e9; for (const i of headSet) if (P[i * 3 + 2] > hd[2] + hh * 0.8 && Math.abs(P[i * 3] - hd[0]) < hh * 0.2) chin = Math.min(chin, P[i * 3 + 1]);
    const fh = hd[1] - chin;
    const edge = (i) => { const ax = Math.abs(P[i * 3] - hd[0]) / hh; return chin + fh * ((look.beard === 'full' ? 0.33 : 0.24) + 0.6 * ss((ax - 0.35) / 0.35)); };
    const back = (i) => (P[i * 3 + 2] - (hd[2] - hh * 0.05)) * 3; // только спереди и по бокам
    const throat = (i) => (P[i * 3 + 1] - (chin - 3)) * 2 + Math.max(0, P[i * 3 + 2] - hd[2]) * 1.5; // под подбородком, но не по шее
    out.push(finish(shell(P, headTri, { off: (i) => t * (0.4 + 0.6 * ss((edge(i) - P[i * 3 + 1]) / 2)), keep: (i) => (ear(i) ? -1 : Math.min(edge(i) - P[i * 3 + 1], back(i), throat(i))), drape: 8, minOff: 0.15 }), 'hair', dark));
  }
  return out;
}
const armW = (H, i) => Math.max(H.arm[i * 4], H.arm[i * 4 + 2]) / 255 || 0;

// пучок волос — гладкий эллипсоид за затылком
function bun(hd, hh) {
  const pos = [], idx = [], S = 18, R = 14, c = [hd[0], hd[1] - hh * 0.05, hd[2] - hh * 0.95], r = [hh * 0.32, hh * 0.26, hh * 0.24];
  for (let a = 0; a <= R; a++) for (let b = 0; b <= S; b++) {
    const th = (a / R) * Math.PI, ph = (b / S) * TAU;
    pos.push(c[0] + r[0] * Math.sin(th) * Math.cos(ph), c[1] + r[1] * Math.cos(th), c[2] + r[2] * Math.sin(th) * Math.sin(ph));
  }
  for (let a = 0; a < R; a++) for (let b = 0; b < S; b++) { const p = a * (S + 1) + b, q = p + S + 1; idx.push(p, p + 1, q, p + 1, q + 1, q); }
  return finish({ position: new Float32Array(pos), index: new Uint16Array(idx) }, 'hair', [0.05, 0.035, 0.03]);
}

// ----- платок: гладкая форма (голова, шея, пелерина на плечах) по размерам тела; лицо открыто овалом -----
function scarf(H, P, L) {
  const hd = L.head, nk = L.neck, hh = hd[1] - nk[1];
  // размеры головы по вершинам
  let rx = 0, ry = 0, rzF = 0, rzB = 0;
  for (const i of H.faceVerts) {
    const y = P[i * 3 + 1]; if (y < hd[1] - hh * 0.9) continue;
    rx = Math.max(rx, Math.abs(P[i * 3] - hd[0])); ry = Math.max(ry, y - hd[1]);
    rzF = Math.max(rzF, P[i * 3 + 2] - hd[2]); rzB = Math.max(rzB, hd[2] - P[i * 3 + 2]);
  }
  const c = [hd[0], hd[1] - hh * 0.25, hd[2] + (rzF - rzB) / 2], R = [rx * 0.95, ry + hh * 0.25, (rzF + rzB) / 2];
  // сечения тела у плеч: полуширина и полуглубина без рук
  const prof = [];
  for (const y of [L.shY - 18, L.shY - 12, L.shY - 6, L.shY - 2, L.shY + 2]) {
    let a = 0, bF = 0, bB = 0, zc = 0, n = 0;
    for (let i = 0; i < H.nBody; i++) {
      if (Math.abs(P[i * 3 + 1] - y) > 1.2 || Math.max(H.arm[i * 4], H.arm[i * 4 + 2]) > 200) continue;
      a = Math.max(a, Math.abs(P[i * 3])); bF = Math.max(bF, P[i * 3 + 2]); bB = Math.min(bB, P[i * 3 + 2]); zc += P[i * 3 + 2]; n++;
    }
    if (n) prof.push({ y, x: 0, z: (bF + bB) / 2, a: Math.max(a, 4), b: Math.max((bF - bB) / 2, 4) });
  }
  const torso = loft(prof, 2).f;
  const head = ellipsoid(c, R).f;
  const neck = roundCone([0, L.shY - 2, nk[2]], [0, hd[1] - hh * 0.4, hd[2] - R[2] * 0.15], hh * 0.62, rx * 0.95).f;
  const cape = ellipsoid([0, L.shY - 1, prof.at(-2)?.z ?? 0], [L.shX * 1.3, 14, (prof[2]?.b ?? 12) * 1.6]).f;
  const face = ellipsoid([c[0], hd[1] - hh * 0.2, hd[2] + R[2] * 1.15], [rx * 0.6, hh * 0.62, R[2] * 0.5]).f;
  const f = (x, y, z) => {
    let d = smin(head(x, y, z) - 1.6, neck(x, y, z) - 0.8, 4);
    d = smin(d, smax(torso(x, y, z) - 5.5, cape(x, y, z), 3), 4);
    return smax(d, -face(x, y, z), 1);
  };
  const m = surfaceNets(f, [-L.shX * 1.2, L.shY - 20, -30, L.shX * 1.2, hd[1] + ry + 4, hd[2] + rzF + 5], 0.6);
  return { part: 'cloth', rgb: [0.16, 0.15, 0.17], position: m.position, normal: m.normal, index: m.index };
}
