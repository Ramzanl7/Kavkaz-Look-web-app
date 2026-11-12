// Реалистичное тело манекена на основе открытой модели MakeHuman (CC0 1.0).
// Шаги: пол/вес/рост → точная подгонка обхватов под мерки → руки вдоль тела → гладкое лицо без черт.
// Все расстояния на выходе — в сантиметрах, пол — y = 0, лицо смотрит в +z.

// ---------- чтение файла public/avatar/human.bin ----------
export function parseHuman(buf) {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x56414c4b) throw new Error('bad avatar file'); // 'KLAV'
  const hl = dv.getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hl)));
  const base = 8 + hl;
  const types = { '<f4': Float32Array, '<u2': Uint16Array, '<i2': Int16Array, '|u1': Uint8Array };
  const get = (name) => {
    const c = header.chunks[name]; if (!c) return null;
    const [off, dt, shape] = c, n = shape.reduce((a, b) => a * b, 1);
    return new types[dt](buf, base + off, n);
  };
  const H = { pos: get('pos'), tri: {}, joint: {}, ring: {}, arm: get('arm'), targets: {}, scale: header.scale };
  H.n = H.pos.length / 3;
  for (const k of Object.keys(header.chunks)) {
    const [kind, name] = k.split(/:(.*)/s);
    if (kind === 'tri') H.tri[name] = get(k);
    else if (kind === 'joint') H.joint[name] = get(k);
    else if (kind === 'ring') H.ring[name] = get(k);
    else if (kind === 'dense') H.targets[name] = { dense: get(k) };
    else if (kind === 'idx') H.targets[name] = { idx: get(k), delta: get('delta:' + name) };
  }
  H.nBody = 13380;
  H.fill = get('fill'); H.fillStart = header.fillStart;
  H.faceVerts = [...Array(H.nBody).keys(), ...Array.from({ length: H.n - H.fillStart }, (_, k) => H.fillStart + k)];
  H.adj = adjacency(H.tri.body, H.n);
  // промежность (для длины ног) и опорные точки роста — по базовой сетке
  let crotch = -1, top = -1, bottom = -1;
  for (let i = 0; i < H.nBody; i++) {
    const x = H.pos[i * 3], y = H.pos[i * 3 + 1];
    if (top < 0 || y > H.pos[top * 3 + 1]) top = i;
    if (bottom < 0 || y < H.pos[bottom * 3 + 1]) bottom = i;
    if (Math.abs(x) < 0.03 && y > -3 && y < 1.5 && (crotch < 0 || y < H.pos[crotch * 3 + 1])) crotch = i;
  }
  H.key = { crotch, top, bottom };
  return H;
}

function adjacency(tri, n) {
  const sets = Array.from({ length: n }, () => new Set());
  for (let t = 0; t < tri.length; t += 3) {
    const a = tri[t], b = tri[t + 1], c = tri[t + 2];
    if (a < n && b < n && c < n) { sets[a].add(b).add(c); sets[b].add(a).add(c); sets[c].add(a).add(b); }
  }
  const start = new Uint32Array(n + 1); let total = 0;
  sets.forEach((s, i) => { start[i] = total; total += s.size; }); start[n] = total;
  const list = new Uint32Array(total); let k = 0;
  for (const s of sets) for (const v of s) list[k++] = v;
  return { start, list };
}

// ---------- деформации ----------
function addTarget(H, out, name, w, idxs) {
  if (!w) return;
  const t = H.targets[name]; if (!t) return;
  const sc = H.scale * w;
  if (t.dense) {
    if (idxs) { for (const i of idxs) { out[i * 3] += t.dense[i * 3] * sc; out[i * 3 + 1] += t.dense[i * 3 + 1] * sc; out[i * 3 + 2] += t.dense[i * 3 + 2] * sc; } return; }
    for (let i = 0; i < t.dense.length; i++) out[i] += t.dense[i] * sc;
    return;
  }
  for (let k = 0; k < t.idx.length; k++) {
    const i = t.idx[k];
    if (idxs && !idxs.has(i)) continue;
    out[i * 3] += t.delta[k * 3] * sc; out[i * 3 + 1] += t.delta[k * 3 + 1] * sc; out[i * 3 + 2] += t.delta[k * 3 + 2] * sc;
  }
}
const split = (v) => (v < 0.5 ? [(0.5 - v) * 2, 0] : [0, (v - 0.5) * 2]);
export const MEASURE_VARS = ['bust-circ', 'waist-circ', 'hips-circ', 'shoulder-dist', 'upperleg-height', 'underbust-circ', 'thigh-circ', 'upperarm-circ'];

// все веса деформаций по параметрам
function weightsOf(p) {
  const sex = p.gender === 'male' ? 'male' : 'female';
  const [wmin, wmax] = split(p.weight ?? 0.5), [hmin, hmax] = split(p.height ?? 0.5);
  const w = { [sex]: 1, [`${sex}-minweight`]: wmin, [`${sex}-maxweight`]: wmax, [`${sex}-minheight`]: hmin, [`${sex}-maxheight`]: hmax, [`${sex}-ideal`]: 0.5 };
  for (const m of MEASURE_VARS) { const v = p.m?.[m] || 0; if (v) w[`measure-${m}-${v < 0 ? 'decr' : 'incr'}`] = Math.abs(v); }
  return w;
}
export function morph(H, p, idxs) {
  const out = new Float32Array(H.pos);
  for (const [name, w] of Object.entries(weightsOf(p))) addTarget(H, out, name, w, idxs);
  if (!idxs) fillHoles(H, out);
  return out;
}
// вершины-заплатки отверстий глаз, рта и носа — в центре своего отверстия
function fillHoles(H, P) {
  for (let k = 0, o = 0; o < H.fill.length; k++) {
    const n = H.fill[o]; let x = 0, y = 0, z = 0;
    for (let q = 1; q <= n; q++) { const i = H.fill[o + q]; x += P[i * 3]; y += P[i * 3 + 1]; z += P[i * 3 + 2]; }
    const v = H.fillStart + k; P[v * 3] = x / n; P[v * 3 + 1] = y / n; P[v * 3 + 2] = z / n;
    o += n + 1;
  }
}

// ---------- измерения (в сантиметрах, после масштабирования под рост) ----------
const dist = (P, a, b) => Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2]);
function ringLen(P, ring) { let s = 0; for (let i = 0; i < ring.length - 1; i++) s += dist(P, ring[i], ring[i + 1]); if (ring[0] !== ring[ring.length - 1]) s += dist(P, ring[ring.length - 1], ring[0]); return s; }
export function measureAll(H, P) {
  const h = P[H.key.top * 3 + 1] - P[H.key.bottom * 3 + 1];
  return {
    height: h,
    chest: ringLen(P, H.ring.bust), waist: ringLen(P, H.ring.waist), hips: ringLen(P, H.ring.hips),
    shoulder: Math.abs(centroid(P, H.joint['joint-l-shoulder'])[0] - centroid(P, H.joint['joint-r-shoulder'])[0]), // между плечевыми суставами
    inseam: P[H.key.crotch * 3 + 1] - P[H.key.bottom * 3 + 1],
  };
}

// ---------- подгонка под мерки ----------
// Рост и вес задают общий тип фигуры; обхваты груди, талии, бёдер, ширина плеч и длина ног подгоняются точно.
export function fitParams(H, b) {
  const sex = b.gender === 'male' ? 'male' : 'female';
  const height01 = Math.min(1, Math.max(0, (b.height - (sex === 'male' ? 176 : 164)) / 40 + 0.5));
  const bmi = b.weight ? b.weight / (b.height / 100) ** 2 : null;
  const p = { gender: sex, height: height01, weight: bmi ? Math.min(1, Math.max(0, 0.5 + (bmi - 22) / 16)) : 0.5, m: {} };
  const ringIdx = new Set([...H.ring.bust, ...H.ring.waist, ...H.ring.hips, ...H.joint['joint-l-shoulder'], ...H.joint['joint-r-shoulder'], H.key.crotch, H.key.top, H.key.bottom]);
  const goals = [['chest', 'bust-circ'], ['waist', 'waist-circ'], ['hips', 'hips-circ'], ['shoulder', 'shoulder-dist'], ['inseam', 'upperleg-height']];
  const vars = goals.map((g) => g[1]);
  // без веса: подбираем и общий тип фигуры (вес) по обхватам
  if (!bmi) vars.push('_weight');
  const want = { chest: b.chest, waist: b.waist, hips: b.hips, shoulder: b.shoulder * (sex === 'male' ? 0.905 : 0.83), inseam: b.inseam };
  const get = (v) => (v === '_weight' ? p.weight : p.m[v] || 0);
  const set = (v, x) => { if (v === '_weight') p.weight = Math.min(1, Math.max(0, x)); else { const lim = v.endsWith('-circ') ? 1.5 : 1; p.m[v] = Math.min(lim, Math.max(-lim, x)); } };
  const resid = () => {
    const P = morph(H, p, ringIdx); const m = measureAll(H, P); const k = b.height / m.height;
    const r = goals.map(([g]) => (m[g] * k - want[g]) / (g === 'shoulder' || g === 'inseam' ? 3 : 2));
    if (!bmi) r.push((p.weight - 0.5) * 2); // без веса — средний тип фигуры, если мерки не требуют иного
    return r;
  };
  let active = [...vars];
  for (let it = 0; it < 14; it++) {
    const r0 = resid();
    if (Math.max(...r0.map(Math.abs)) < 0.1 || !active.length) break;
    // численный якобиан и шаг метода наименьших квадратов (с демпфированием); упёршиеся в предел параметры замораживаем
    const J = active.map((v) => { const x = get(v); set(v, x + 0.05); const r = resid(); set(v, x); return r.map((ri, i) => (ri - r0[i]) / 0.05); });
    const n = active.length, A = Array.from({ length: n }, () => new Array(n).fill(0)), g = new Array(n).fill(0);
    for (let a = 0; a < n; a++) { for (let c = 0; c < n; c++) for (let i = 0; i < r0.length; i++) A[a][c] += J[a][i] * J[c][i]; A[a][a] += 0.02; for (let i = 0; i < r0.length; i++) g[a] -= J[a][i] * r0[i]; }
    const dx = solve(A, g);
    const hit = [];
    active.forEach((v, i) => { const want2 = get(v) + dx[i]; set(v, want2); if (get(v) !== want2) hit.push(v); });
    active = active.filter((v) => !hit.includes(v));
  }
  return p;
}
function solve(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-9) continue;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => (Math.abs(r[i]) < 1e-9 ? 0 : r[n] / r[i]));
}

// ---------- поза: руки вдоль тела ----------
const centroid = (P, idx) => { let x = 0, y = 0, z = 0; for (const i of idx) { x += P[i * 3]; y += P[i * 3 + 1]; z += P[i * 3 + 2]; } return [x / idx.length, y / idx.length, z / idx.length]; };
function rotZ(P, i, c, cos, sin, w) {
  const x = P[i * 3] - c[0], y = P[i * 3 + 1] - c[1];
  P[i * 3] += w * (c[0] + x * cos - y * sin - P[i * 3]); P[i * 3 + 1] += w * (c[1] + x * sin + y * cos - P[i * 3 + 1]);
}
function rotX(P, i, c, cos, sin, w) {
  const y = P[i * 3 + 1] - c[1], z = P[i * 3 + 2] - c[2];
  P[i * 3 + 1] += w * (c[1] + y * cos - z * sin - P[i * 3 + 1]); P[i * 3 + 2] += w * (c[2] + y * sin + z * cos - P[i * 3 + 2]);
}
function poseArms(H, P) {
  for (const [side, col] of [['l', 0], ['r', 2]]) {
    const sh = centroid(P, H.joint[`joint-${side}-shoulder`]), el = centroid(P, H.joint[`joint-${side}-elbow`]);
    const sgn = Math.sign(el[0] - sh[0]) || 1;
    const cur = Math.atan2(Math.abs(el[0] - sh[0]), sh[1] - el[1]); // угол руки от вертикали
    const ang = -sgn * (cur - 0.14); // опускаем до ~8° от тела
    const cos = Math.cos(ang), sin = Math.sin(ang);
    for (let i = 0; i < H.fillStart; i++) { const w = H.arm[i * 4 + col] / 255; if (w > 0) rotZ(P, i, sh, cos, sin, w); }
    // лёгкий естественный сгиб в локте вперёд
    const el2 = centroid(P, H.joint[`joint-${side}-elbow`]);
    const b = 0.22, cb = Math.cos(b), sb = Math.sin(b);
    for (let i = 0; i < H.fillStart; i++) { const w = H.arm[i * 4 + col + 1] / 255; if (w > 0) rotX(P, i, el2, cb, sb, w); }
  }
}

// ---------- лицо без черт: гладкая поверхность ----------
function smoothFace(H, P) {
  const head = centroid(P, H.joint['joint-head']), neck = centroid(P, H.joint['joint-neck']);
  const hh = head[1] - neck[1];
  const mask = new Float32Array(H.n), idx = [];
  for (const i of H.faceVerts) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    if (y < neck[1] - hh * 0.05) continue;
    const front = (z - head[2]) / (hh * 0.9), side = Math.abs(x - head[0]) / (hh * 0.75), up = (y - head[1]) / hh;
    if (front < 0.05 || side > 0.85 || up > 0.95) continue;
    const w = Math.min(1, (front - 0.05) / 0.35) * Math.min(1, (0.85 - side) / 0.3) * Math.min(1, (0.95 - up) / 0.4) * Math.min(1, (y - neck[1] + hh * 0.05) / (hh * 0.3));
    if (w > 0) { mask[i] = w; idx.push(i); }
  }
  // 1) проекция на гладкий «яйцевидный» профиль головы: закрывает впадины глаз и рта
  let rx = 0, ry = 0, rz = 0;
  for (let i = 0; i < H.nBody; i++) {
    const y = P[i * 3 + 1]; if (y < head[1] - hh * 0.2) continue;
    rx = Math.max(rx, Math.abs(P[i * 3] - head[0])); ry = Math.max(ry, y - head[1]);
    if (Math.abs(P[i * 3] - head[0]) < hh * 0.3) rz = Math.max(rz, P[i * 3 + 2] - head[2]);
  }
  const cy = head[1] - hh * 0.15, ryy = ry + hh * 0.15;
  const faceN = new Map(); // гладкие нормали лица: без швов от закрытых впадин
  for (const i of idx) {
    const dx = P[i * 3] - head[0], dy = P[i * 3 + 1] - cy, dz = P[i * 3 + 2] - head[2];
    const ex = rx * 0.98, ey = ryy * (dy < 0 ? 1.05 : 1), ez = rz * (dy < 0 ? 0.92 - 0.25 * Math.min(1, -dy / ryy) : 0.96); // к подбородку сужается
    const k = 1 / Math.sqrt((dx / ex) ** 2 + (dy / ey) ** 2 + (dz / ez) ** 2);
    const w = Math.min(1, mask[i] * 1.6);
    P[i * 3] += w * (dx * k - dx); P[i * 3 + 1] += w * (dy * k - dy); P[i * 3 + 2] += w * (dz * k - dz);
    faceN.set(i, [w, ex, ey, ez]);
  }
  // 2) сглаживание стыков
  const { start, list } = H.adj, tmp = new Float32Array(idx.length * 3);
  for (let it = 0; it < 25; it++) {
    idx.forEach((i, k) => {
      let sx = 0, sy = 0, sz = 0; const a = start[i], e = start[i + 1];
      for (let q = a; q < e; q++) { const j = list[q]; sx += P[j * 3]; sy += P[j * 3 + 1]; sz += P[j * 3 + 2]; }
      const n = e - a, w = n ? mask[i] * 0.6 : 0; if (!n) { sx = sy = sz = 0; }
      if (!n) { tmp[k * 3] = P[i * 3]; tmp[k * 3 + 1] = P[i * 3 + 1]; tmp[k * 3 + 2] = P[i * 3 + 2]; return; }
      tmp[k * 3] = P[i * 3] + w * (sx / n - P[i * 3]); tmp[k * 3 + 1] = P[i * 3 + 1] + w * (sy / n - P[i * 3 + 1]); tmp[k * 3 + 2] = P[i * 3 + 2] + w * (sz / n - P[i * 3 + 2]);
    });
    idx.forEach((i, k) => { P[i * 3] = tmp[k * 3]; P[i * 3 + 1] = tmp[k * 3 + 1]; P[i * 3 + 2] = tmp[k * 3 + 2]; });
  }
  return { faceN, c: [head[0], cy, head[2]] };
}

// нормали вершин по треугольникам тела; на лице — смешиваем с нормалью гладкой формы
export function bodyNormals(H, P, face) {
  const N = new Float32Array(H.n * 3), T = H.tri.body;
  for (let t = 0; t < T.length; t += 3) {
    const a = T[t] * 3, b = T[t + 1] * 3, c = T[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const q of [a, b, c]) { N[q] += nx; N[q + 1] += ny; N[q + 2] += nz; }
  }
  if (face) for (const [i, [w, ex, ey, ez]] of face.faceN) {
    const dx = P[i * 3] - face.c[0], dy = P[i * 3 + 1] - face.c[1], dz = P[i * 3 + 2] - face.c[2];
    let gx = dx / (ex * ex), gy = dy / (ey * ey), gz = dz / (ez * ez); const gl = Math.hypot(gx, gy, gz) || 1;
    let nx = N[i * 3], ny = N[i * 3 + 1], nz = N[i * 3 + 2]; const nl = Math.hypot(nx, ny, nz) || 1;
    const k = Math.min(1, w * 1.3);
    N[i * 3] = (nx / nl) * (1 - k) + (gx / gl) * k; N[i * 3 + 1] = (ny / nl) * (1 - k) + (gy / gl) * k; N[i * 3 + 2] = (nz / nl) * (1 - k) + (gz / gl) * k;
  }
  for (let i = 0; i < N.length; i += 3) { const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1; N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; }
  return N;
}

// ---------- итог: готовое тело в сантиметрах ----------
export function buildHuman(H, b) {
  const p = fitParams(H, b);
  const P = morph(H, p);
  const m = measureAll(H, P);
  const k = b.height / m.height, floor = P[H.key.bottom * 3 + 1];
  // масштаб под рост (дм → см), стопы на полу
  for (let i = 0; i < H.n; i++) { P[i * 3] *= k; P[i * 3 + 1] = (P[i * 3 + 1] - floor) * k; P[i * 3 + 2] *= k; }
  const fitted = measureAll(H, P);
  poseArms(H, P);
  const face = smoothFace(H, P);
  return { P, N: bodyNormals(H, P, face), params: p, fitted };
}
