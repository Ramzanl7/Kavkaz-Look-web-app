// Гладкий манекен по меркам + одежда, собранные из полей расстояний (SDF).
// Тело — абстрактный магазинный манекен: без лица и без анатомических деталей (никакой сексуализации).
// Голова, кисти и стопы строятся с высокой детализацией отдельно, остальное — с обычной.
import { smin, smax, sphere, ellipsoid, roundCone, union, loft } from './sdf.js';
import { surfaceNets } from './mesh.js';

const TAU = Math.PI * 2;
const radii = (circ, k) => { const a = circ / (Math.PI * Math.sqrt(2 * (1 + k * k))); return [a, a * k]; };

// ---------- скелет и пропорции ----------
export function skeleton(b) {
  const H = b.height, f = b.gender !== 'male';
  const s = H / 170;
  const crotch = b.inseam;
  const j = {
    H, s, f, crotch,
    hipY: crotch + 0.055 * H,
    waistY: f ? 0.625 * H : 0.6 * H,
    bustY: f ? 0.715 * H : 0.725 * H,
    shY: 0.818 * H,
    neckCut: 0.855 * H,
    chinY: 0.872 * H,
    headC: [0, H - 0.069 * H, 0.4 * s],
    headR: [0.046 * H, 0.069 * H, 0.057 * H],
    kneeY: 0.285 * H,
    ankleY: 0.045 * H,
  };
  const [hx] = radii(b.hips, 0.78);
  j.legX = hx * 0.52;
  j.shX = b.shoulder / 2;
  j.elbow = (side) => [side * (j.shX + 3.2 * s), 0.625 * H, -1.5 * s];
  j.wrist = (side) => [side * (j.shX + 8.6 * s), crotch + 0.035 * H, 1.6 * s];
  j.shoulderJ = (side) => [side * (j.shX - 2.4 * s), j.shY - 2.6 * s, -0.5 * s];
  j.foot = { len: b.footLen || 0.15 * H };
  return j;
}

// ---------- тело: плавные силуэты (обхват на каждой высоте задан точно, без бугров) ----------
const lvl = (y, circ, k, x = 0, z = 0) => { const [a, b] = radii(circ, k); return { y, x, z, a, b }; };

function torsoParts(b, j) {
  const H = j.H, s = j.s, f = j.f;
  const neckR = 0.034 * H;
  const [, cz] = radii(b.chest, f ? 0.7 : 0.66);
  const under = f ? b.waist + (b.chest - b.waist) * 0.62 : b.chest * 0.97;
  const prof = [
    lvl(j.crotch + 1 * s, b.hips * 0.72, 0.72, 0, -1.2 * s),
    lvl(j.hipY, b.hips, f ? 0.76 : 0.74, 0, -0.6 * s),
    lvl((j.hipY + j.waistY) / 2, (b.hips + b.waist) / 2 + (f ? 1.5 : 0), 0.74, 0, -0.3 * s),
    lvl(j.waistY, b.waist, f ? 0.72 : 0.75),
    lvl(j.bustY - 0.035 * H, under, f ? 0.7 : 0.7),
    lvl(j.bustY, b.chest, f ? 0.7 : 0.66, 0, f ? 0.4 * s : 0),
    { ...lvl((j.bustY + j.shY) / 2, b.chest * 0.97, 0.64, 0, -0.3 * s), a: Math.max(radii(b.chest * 0.97, 0.64)[0], j.shX * 0.86) },
    { y: j.shY - 4 * s, x: 0, z: -0.8 * s, a: j.shX - 0.8 * s, b: cz * 0.7 },
    { y: j.shY - 1 * s, x: 0, z: -0.8 * s, a: j.shX * 0.9, b: cz * 0.64 },
    { y: j.shY + 1.6 * s, x: 0, z: -0.6 * s, a: j.shX * 0.6, b: cz * 0.56 },
    { y: j.shY + 1.5 * s, x: 0, z: -0.6 * s, a: j.shX * 0.55, b: cz * 0.55 },
    { y: j.shY + 3.5 * s, x: 0, z: -0.4 * s, a: neckR * 1.15, b: neckR * 1.05 },
  ];
  return [
    { ...loft(prof, 5 * s), k: 3 * s },
    { ...ellipsoid([0, j.crotch + 3 * s, 0.2 * s], [j.legX * 1.3, 8 * s, radii(b.hips, 0.76)[1] * 0.9]), k: 5 * s }, // таз: плавный переход к ногам
    { ...roundCone([0, j.shY, -0.6 * s], [0, j.neckCut + 4 * s, 0.2 * s], neckR * 1.08, neckR), k: 3 * s },
  ];
}

// силуэт для одежды: ткань свисает от груди и лопаток, не повторяя впадин тела
function clothTorso(b, j) {
  const H = j.H, s = j.s, f = j.f;
  const [, cz] = radii(b.chest, f ? 0.7 : 0.66);
  const neckR = 0.034 * H;
  const drapeW = Math.max(b.waist, b.chest * (f ? 0.9 : 0.94), b.hips * 0.86);
  const prof = [
    lvl(j.crotch + 1 * s, b.hips * 0.74, 0.72, 0, -1.2 * s),
    lvl(j.hipY, b.hips, f ? 0.76 : 0.74, 0, -0.6 * s),
    lvl(j.waistY, (drapeW + b.waist) / 2, 0.73, 0, -0.3 * s),
    lvl(j.bustY, b.chest, f ? 0.7 : 0.66, 0, 0),
    { ...lvl((j.bustY + j.shY) / 2, b.chest * 0.98, 0.65, 0, -0.3 * s), a: Math.max(radii(b.chest * 0.98, 0.65)[0], j.shX * 0.88) },
    { y: j.shY - 4 * s, x: 0, z: -0.8 * s, a: j.shX - 0.8 * s, b: cz * 0.7 },
    { y: j.shY - 1 * s, x: 0, z: -0.8 * s, a: j.shX * 0.9, b: cz * 0.64 },
    { y: j.shY + 1.6 * s, x: 0, z: -0.6 * s, a: j.shX * 0.6, b: cz * 0.56 },
    { y: j.shY + 3.5 * s, x: 0, z: -0.4 * s, a: neckR * 1.15, b: neckR * 1.05 },
  ];
  return { ...loft(prof, 5 * s), k: 3 * s };
}

function legParts(b, j, side) {
  const H = j.H, s = j.s, x0 = side * j.legX, xk = x0 * 0.86, xa = x0 * 0.8;
  const xAt = (y) => (y > j.kneeY ? xk + (x0 - xk) * (y - j.kneeY) / (j.crotch - j.kneeY) : xa + (xk - xa) * (y - j.ankleY) / (j.kneeY - j.ankleY));
  const L = (y, frac, z = 0, k = 0.9) => lvl(y, b.hips * frac, k, xAt(y), z * s);
  const prof = [
    L(j.ankleY + 1 * s, 0.205, -0.8),
    L(0.1 * H, 0.25, -0.9),
    L(0.2 * H, f(j) ? 0.355 : 0.37, -1.1, 0.95),
    L(j.kneeY + 1 * s, 0.355, 0.4),
    L(j.kneeY + 0.06 * H, 0.4, 0.4),
    L((j.crotch + j.kneeY) / 2, 0.5, 0.2),
    L(j.crotch, 0.59, 0),
    L(j.hipY - 2 * s, 0.6, -0.4),
  ];
  return [{ ...loft(prof, 2 * s), k: 4 * s }];
}
const f = (j) => j.f;

function armParts(b, j, side) {
  const s = j.s, H = j.H, sh = j.shoulderJ(side), el = j.elbow(side), wr = j.wrist(side);
  const at = (y) => { const [p, q] = y > el[1] ? [el, sh] : [wr, el]; const t = (y - p[1]) / (q[1] - p[1]); return [p[0] + (q[0] - p[0]) * t, p[2] + (q[2] - p[2]) * t]; };
  const A = (y, circ) => { const [x, z] = at(y); return lvl(y, circ, 0.92, x, z); };
  const prof = [
    A(wr[1] + 0.5 * s, 16.5 * s),
    A(wr[1] + 0.06 * H, b.chest * 0.2),
    A(el[1] - 0.05 * H, b.chest * 0.255),
    A(el[1], b.chest * 0.245),
    A(el[1] + 0.06 * H, b.chest * 0.28),
    A(sh[1] - 2 * s, b.chest * 0.32),
  ];
  return [{ ...loft(prof, 2.2 * s), k: 1.6 * s }];
}

function handParts(j, side) {
  const s = j.s * 1.1, w = j.wrist(side), e = j.elbow(side);
  const dx = (w[0] - e[0]), dy = (w[1] - e[1]), dz = (w[2] - e[2]), dl = Math.hypot(dx, dy, dz);
  const d = [dx / dl, dy / dl, dz / dl];
  const at = (t, ox = 0, oz = 0) => [w[0] + d[0] * t + ox, w[1] + d[1] * t, w[2] + d[2] * t + oz];
  const parts = [
    roundCone(at(-3 * s), at(0.5 * s), 2.6 * s, 2.5 * s),
    ellipsoid(at(5.2 * s, side * -0.3 * s, 0.4 * s), [1.45 * s, 5.0 * s, 4.1 * s]),
  ];
  // четыре пальца: слегка согнуты к ладони (к телу), от указательного (спереди) к мизинцу (сзади)
  const fingers = [[2.75, 7.6, 0.86], [0.95, 8.3, 0.88], [-0.85, 7.8, 0.84], [-2.55, 6.3, 0.72]];
  for (const [oz, len, r] of fingers) {
    let p = at(9.4 * s, side * -0.2 * s, oz * s);
    const segs = [0.45, 0.32, 0.23], curl = [0.12, 0.28, 0.4];
    let dir = [d[0], d[1], d[2]];
    segs.forEach((frac, i) => {
      dir = [dir[0] - side * curl[i] * 0.5, dir[1], dir[2]];
      const l = Math.hypot(...dir); dir = dir.map((v) => v / l);
      const q = [p[0] + dir[0] * len * frac * s, p[1] + dir[1] * len * frac * s, p[2] + dir[2] * len * frac * s];
      parts.push({ ...roundCone(p, q, r * s * (1 - i * 0.1), r * s * (0.92 - i * 0.12)), k: 0.35 * s });
      p = q;
    });
  }
  // большой палец: от основания ладони вперёд и вниз
  const t0 = at(3.2 * s, side * -0.4 * s, 3.2 * s), t1 = [t0[0] - side * 0.6 * s, t0[1] - 3.2 * s, t0[2] + 2.0 * s], t2 = [t1[0] - side * 0.9 * s, t1[1] - 2.8 * s, t1[2] + 0.8 * s];
  parts.push({ ...roundCone(t0, t1, 1.25 * s, 1.0 * s), k: 0.8 * s }, { ...roundCone(t1, t2, 1.0 * s, 0.85 * s), k: 0.35 * s });
  return parts.map((p) => ({ ...p, k: p.k ?? 1.2 * s }));
}

function footParts(j, side) {
  const s = j.s, L = j.foot.len, x = side * j.legX * 0.8, back = -0.26 * L;
  const parts = [
    roundCone([x, j.ankleY + 8 * s, -0.8 * s], [x, j.ankleY + 0.5 * s, -0.4 * s], 3.55 * s, 3.4 * s),
    sphere([x, 3.4 * s, back + 3.3 * s], 3.4 * s),
    ellipsoid([x + side * 0.2 * s, 2.9 * s, back + L * 0.52], [3.9 * s, 2.7 * s, L * 0.36]),
    roundCone([x, 6 * s, -0.5 * s], [x - side * 0.8 * s, 3 * s, back + L * 0.7], 3.2 * s, 2.2 * s),
  ].map((p) => ({ ...p, k: 2.5 * s }));
  // пальцы ног: большой — с внутренней стороны
  const toes = [[-1.9, 0.98, 1.25], [-0.3, 0.93, 0.9], [0.95, 0.9, 0.82], [2.05, 0.86, 0.76], [3.0, 0.8, 0.7]];
  for (const [ox, reach, r] of toes) {
    const tx = x + side * ox * s; // отрицательный ox — к середине тела (большой палец)
    const base = [tx, 1.7 * s, back + L * (reach - 0.13)], tip = [tx, 1.25 * s, back + L * reach - r * s];
    parts.push({ ...roundCone(base, tip, r * s * 1.05, r * s), k: 0.45 * s });
  }
  return parts;
}

function headParts(j, look) {
  const s = j.s, c = j.headC, [rx, ry, rz] = j.headR;
  const parts = [
    ellipsoid(c, [rx, ry, rz]),
    ellipsoid([c[0], c[1] - ry * 0.42, c[2] + rz * 0.12], [rx * 0.82, ry * 0.6, rz * 0.82]),
    sphere([c[0], c[1] - ry * 0.86, c[2] + rz * 0.5], 2.2 * s),
    { ...ellipsoid([c[0], c[1] - ry * 0.12, c[2] + rz * 0.93], [0.95 * s, 2.3 * s, 1.15 * s]), k: 1.3 * s }, // мягкий намёк на нос
    { ...ellipsoid([c[0], c[1] + ry * 0.1, c[2] + rz * 0.86], [rx * 0.5, 1.2 * s, 1.0 * s]), k: 2.5 * s }, // надбровье
    roundCone([0, j.shY - 3 * s, -0.4 * s], [0, c[1] - ry * 0.4, c[2] - rz * 0.15], 0.036 * j.H, 0.033 * j.H),
  ].map((p) => ({ ...p, k: p.k ?? 3 * s }));
  if (look?.hair !== 'scarf') for (const side of [-1, 1]) parts.push({ ...ellipsoid([side * rx * 0.93, c[1] - ry * 0.1, c[2] - rz * 0.1], [0.85 * s, 2.7 * s, 1.6 * s]), k: 1.3 * s }); // уши
  return parts;
}

// ---------- сборка ----------
export function bodyField(b, j) {
  const torso = torsoParts(b, j);
  const parts = [...torso, ...legParts(b, j, -1), ...legParts(b, j, 1), ...armParts(b, j, -1), ...armParts(b, j, 1)];
  return union(parts, 7 * j.s);
}

// Основная функция: тело, одежда, база (нейтральная одежда под примеряемой вещью), волосы — в виде готовых сеток.
// Тело (не зависит от вещи — кэшируется при смене размера)
export function buildBody({ body, look = {} }) {
  const j = skeleton(body);
  const s = j.s, H = j.H;
  const core = bodyField(body, j);
  const meshes = [];
  // туловище и конечности (без головы, кистей и стоп — они детальнее, отдельно)
  const handCutX = j.shX + 5 * s, wristCut = j.wrist(1)[1] + 1.5 * s;
  const coreClipped = (x, y, z) => {
    let d = core(x, y, z);
    d = smax(d, y - (j.shY + 1 * s), 0.01); // шея и голова — отдельной сеткой
    d = smax(d, (j.ankleY + 5 * s) - y, 0.01); // стопы
    if (Math.abs(x) > handCutX - 3 * s) d = smax(d, wristCut - y - (Math.abs(x) > handCutX ? 0 : 50), 0.01); // кисти
    return d;
  };
  const halfW = j.shX + 14 * s;
  meshes.push({ part: 'body', lowres: true, ...surfaceNets(coreClipped, [-halfW, j.ankleY, -22 * s, halfW, j.neckCut + 4 * s, 22 * s], 1.0 * s) });
  // голова (и шея внахлёст)
  const head = union(headParts(j, look), 3 * s);
  const c = j.headC, [rx, ry, rz] = j.headR;
  meshes.push({ part: 'body', ...surfaceNets(head, [-rx - 3 * s, j.shY - 1 * s, c[2] - rz - 4 * s, rx + 3 * s, c[1] + ry + 2 * s, c[2] + rz + 4 * s], 0.42 * s) });
  // кисти
  for (const side of [-1, 1]) {
    const h = union(handParts(j, side), 1.2 * s), w = j.wrist(side);
    meshes.push({ part: 'body', ...surfaceNets(h, [w[0] - 8 * s, w[1] - 21 * s, w[2] - 8 * s, w[0] + 8 * s, w[1] + 3.5 * s, w[2] + 10 * s], 0.32 * s) });
  }
  // стопы
  const feetF = {};
  for (const side of [-1, 1]) {
    const ft = union(footParts(j, side), 2.5 * s); feetF[side] = ft;
    const x = side * j.legX * 0.8, L = j.foot.len;
    meshes.push({ part: 'body', ...surfaceNets(ft, [x - 7 * s, -0.5, -0.3 * L - 2 * s, x + 7 * s, j.ankleY + 9 * s, 0.78 * L + 2 * s], 0.38 * s) });
  }
  // волосы, платок, борода
  meshes.push(...hairMeshes(j, look, head, clothTorso(body, j).f, body));
  return { meshes, height: H, j, feetF };
}

// Базовая одежда и примеряемая вещь
export function buildClothes(body, built, garment) {
  return clothes(body, built.j, garment, built.feetF);
}

export function buildAvatar({ body, look = {}, garment = null }) {
  const b = buildBody({ body, look });
  return { meshes: [...b.meshes, ...buildClothes(body, b, garment)], height: b.height };
}

// ---------- волосы ----------
function hairMeshes(j, look, headF, torsoF, body) {
  const s = j.s, c = j.headC, [rx, ry, rz] = j.headR, out = [];
  const color = [0.16, 0.12, 0.1];
  if (look.hair === 'short' || look.hair === 'long') {
    const cap = (x, y, z) => {
      let d = headF(x, y, z);
      const u = (z - c[2]) / rz; // −1 затылок … +1 лоб
      const line = c[1] + ry * (0.02 + 0.44 * ss((u - 0.3) / 0.6)) - ry * ((look.hair === 'long' ? 0.52 : 0.34) + 0.02) * ss((0.1 - u) / 0.9); // лоб и виски открыты, у ушей — ниже, сзади — до затылка
      d -= 0.2 * s + 1.0 * s * ss((y - line) / (3 * s)); // у линии роста волосы тоньше, без «козырька»
      d = smax(d, line - y, 0.5 * s);
      return d;
    };
    let f = cap;
    if (look.hair === 'long') {
      const bun = ellipsoid([c[0], c[1] - ry * 0.1, c[2] - rz * 1.05], [rx * 0.55, ry * 0.4, rz * 0.35]).f;
      f = (x, y, z) => smin(cap(x, y, z), bun(x, y, z), 2 * s);
    }
    out.push({ part: 'hair', rgb: color, ...surfaceNets(f, [-rx - 3 * s, c[1] - ry - 2 * s, c[2] - rz - 10 * s, rx + 3 * s, c[1] + ry + 3 * s, c[2] + rz + 3 * s], 0.42 * s) });
  }
  if (look.hair === 'scarf') {
    // платок: закрывает волосы, уши и шею, мягко ложится на плечи и грудь (как накидка); лицо открыто
    const [, cz] = radii(body.chest, 0.68);
    const cape = ellipsoid([0, j.shY - 1 * s, -1 * s], [j.shX * 0.98, 11 * s, cz * 1.45]).f;
    const neck = roundCone([0, j.shY - 2 * s, -0.4 * s], [0, c[1] - ry * 0.2, c[2] - rz * 0.1], 0.05 * j.H, rx * 0.95).f;
    const face = ellipsoid([c[0], c[1] - ry * 0.18, c[2] + rz * 1.22], [rx * 0.6, ry * 0.64, rz * 0.5]).f;
    const skull = union([ellipsoid(c, [rx, ry, rz]), ellipsoid([c[0], c[1] - ry * 0.42, c[2] + rz * 0.12], [rx * 0.82, ry * 0.6, rz * 0.82])], 3 * s);
    const f = (x, y, z) => {
      let d = smin(skull(x, y, z) - 1.6 * s, neck(x, y, z) - 0.6 * s, 4 * s);
      d = smin(d, smax(torsoF(x, y, z) - 1.5 * s, cape(x, y, z), 3 * s), 4 * s);
      d = smax(d, -face(x, y, z), 1.0 * s);
      return d;
    };
    out.push({ part: 'cloth', rgb: [0.42, 0.38, 0.34], ...surfaceNets(f, [-j.shX - 5 * s, j.shY - 14 * s, -24 * s, j.shX + 5 * s, c[1] + ry + 4 * s, c[2] + rz + 5 * s], 0.55 * s) });
  }
  if (look.beard === 'short' || look.beard === 'full') {
    const t = look.beard === 'full' ? 1.1 : 0.55;
    const jaw = ellipsoid([c[0], c[1] - ry * 0.55, c[2] + rz * 0.2], [rx * 0.86, ry * 0.5, rz * 0.86]).f;
    const f = (x, y, z) => {
      let d = jaw(x, y, z) - t * s;
      d = smax(d, (c[2] - rz * 0.05) - z, 1.5 * s); // только спереди и по бокам
      const ax = Math.abs(x) / rx;
      const edge = c[1] - ry * (0.46 - 0.44 * ss((ax - 0.5) / 0.4)) - ry * 0.08 * Math.exp(-((x / (rx * 0.28)) ** 2)); // щёки открыты, у ушей — бакенбарды
      d = smax(d, y - edge, 1.4 * s);
      return d;
    };
    out.push({ part: 'hair', rgb: color, ...surfaceNets(f, [-rx - 3 * s, c[1] - ry * 1.3, c[2] - rz, rx + 3 * s, c[1], c[2] + rz + 4 * s], 0.4 * s) });
  }
  return out;
}

// ---------- одежда ----------
const lerp = (a, b, t) => a + (b - a) * Math.min(1, Math.max(0, t));
// припуск (см) по высоте: плавно между зонами грудь/талия/бёдра
const ss = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
function offsetAt(y, j, off) {
  if (y >= j.bustY) return off.chest + (Math.min(off.chest, 1.0 * j.s) - off.chest) * ss((y - j.bustY) / (j.shY - j.bustY)); // на плечах вещь лежит по телу
  if (y >= j.waistY) return off.waist + (off.chest - off.waist) * ss((y - j.waistY) / (j.bustY - j.waistY));
  return off.hips + (off.waist - off.hips) * ss((y - j.hipY) / (j.waistY - j.hipY));
}

function clothes(body, j, g, feetF) {
  const s = j.s, H = j.H, out = [];
  const torso = clothTorso(body, j).f;
  const arms = { [-1]: union(armParts(body, j, -1), 2 * s), [1]: union(armParts(body, j, 1), 2 * s) };
  const legs = { [-1]: union(legParts(body, j, -1), 3 * s), [1]: union(legParts(body, j, 1), 3 * s) };
  const type = g?.type || 'none';
  const neckHole = (x, y, z) => { const q = (z + 0.6 * s) * 1.15; return Math.sqrt(x * x + q * q) - 0.042 * H; };
  const sleeve = (side, toT, off) => (x, y, z) => {
    if (side * x < j.shX - 6 * s) return 1e3;
    const sh = j.shoulderJ(side), wr = j.wrist(side);
    const endY = lerp(sh[1], wr[1], toT);
    return smax(arms[side](x, y, z) - off, endY - y, 0.8 * s);
  };
  const top = ({ hemY, sleeveT, offFn, skirtFlare = 0 }) => (x, y, z) => {
    const o = offFn(y);
    let d = torso(x, y, z) - o;
    if (skirtFlare >= 0 && hemY < j.hipY) {
      // юбочная часть: от линии бёдер расходится конусом вниз, накрывая ноги
      const t = (j.hipY - y) / (j.hipY - hemY);
      const [hx, hz] = radii(body.hips + TAU * offFn(j.hipY), j.f ? 0.76 : 0.74);
      const grow = 1 + skirtFlare * Math.max(0, t);
      const ux = x / (hx * grow), uz = z / (hz * grow * 1.03), r = Math.sqrt(ux * ux + uz * uz) - 1;
      d = smin(d, smax(r * Math.min(hx, hz), y - (j.hipY + 5 * s), 5 * s), 4 * s);
    }
    const so = Math.max(o, offFn(j.bustY) * 0.8) + 0.3 * s; // рукав по свободе вещи
    d = smin(d, sleeve(-1, sleeveT, so)(x, y, z), 4 * s);
    d = smin(d, sleeve(1, sleeveT, so)(x, y, z), 4 * s);
    d = smax(d, y > j.shY - 8 * s ? -neckHole(x, y, z) : -1e3, 1 * s);
    d = smax(d, hemY - y, 1.2 * s);
    d = smax(d, y - (j.shY + 6 * s), 1 * s);
    return d;
  };
  const pants = ({ hemY, offFn, straight = 0 }) => (x, y, z) => {
    const o = offFn(y);
    let d = torso(x, y, z) - o;
    d = smax(d, y - (j.waistY + 1.5 * s), 1 * s);
    let both = 1e3;
    for (const side of [-1, 1]) {
      let leg = legs[side](x, y, z) - (o + 0.8 * s + Math.max(0, (j.kneeY - y) * 0.02));
      if (straight) { // прямой крой: штанина не облегает икру и колено
        const cx = x - side * j.legX * 0.84, cz2 = z + 0.3 * s;
        const cyl = smax(Math.sqrt(cx * cx + cz2 * cz2) - ((body.hips * 0.4) / TAU + straight), y - (j.crotch + 2 * s), 6 * s);
        leg = smin(leg, cyl, 4 * s);
      }
      both = smin(both, leg, y > j.crotch - 14 * s ? 3 * s + 7 * s * Math.min(1, (y - (j.crotch - 14 * s)) / (10 * s)) : 0.5 * s); // ткань перекрывает ложбинку между бёдрами
    }
    const [, hz] = radii(body.hips, 0.76);
    both = smin(both, ellipsoid([0, j.crotch + 3 * s, 0.6 * s], [j.legX * 1.35, 8 * s, hz * 0.95]).f(x, y, z) - o, 3 * s);
    d = smin(d, smax(both, y - (j.hipY + 2 * s), 1), 4 * s);
    return smax(d, hemY - y, 1 * s);
  };
  const box = (y0, y1) => [-j.shX - 16 * s, Math.max(-0.5, y0), -24 * s, j.shX + 16 * s, y1, 24 * s];

  // посадка примеряемой вещи: припуск по зонам из расчёта (тесно — облегает, свободно — отходит от тела)
  const off = {};
  if (g && type !== 'none' && type !== 'shoes') {
    for (const z of ['chest', 'waist', 'hips']) {
      const zf = g.fit.find((q) => q.zone === z);
      off[z] = !zf ? 0.8 * s : zf.status === 'tight' ? 0.55 * s : 0.7 * s + (Math.max(0, zf.delta) / TAU) * 1.25;
    }
    if (type === 'pants' || type === 'skirt') off.chest = off.waist;
  }
  const offFn = (y) => offsetAt(y, j, off);

  // нейтральная база — манекен никогда не показывается раздетым и всегда одет скромно
  const base = j.f ? [0.33, 0.36, 0.4] : [0.3, 0.33, 0.36];
  const lower = type === 'pants' || type === 'skirt';
  // верх базы: у женщин — туника до середины бедра, у мужчин — рубашка до бёдер; поверх брюк/юбки — навыпуск и свободнее их
  const baseHem = lower ? j.hipY - 3 * s : j.f ? j.crotch - 0.07 * H : j.hipY - 3 * s;
  const lift = lower ? Math.max(off.waist, off.hips) + 1 * s : 0;
  const baseOff = { chest: 1.7 * s + lift * 0.5, waist: Math.max(1.7 * s + (body.chest - body.waist) / TAU * 0.6, lift), hips: Math.max(1.9 * s, lift) };
  if (!['top', 'outer', 'dress'].includes(type)) out.push({ part: 'cloth', rgb: base, base: true, ...surfaceNets(top({ hemY: baseHem, sleeveT: 0.97, offFn: (y) => offsetAt(y, j, baseOff), skirtFlare: baseHem < j.hipY ? 0.06 : -1 }), box(baseHem - 2 * s, j.shY + 8 * s), 1.0 * s) });
  // низ базы: прямые брюки; под платьем выше щиколотки и под юбкой — тонкие, чтобы не выпирать
  const dressShort = type === 'dress' && j.shY - g.length > j.ankleY + 6 * s;
  if (!['pants', 'dress', 'skirt'].includes(type) || dressShort || type === 'skirt') {
    const thin = type === 'dress' || type === 'skirt';
    const pf = pants({ hemY: j.ankleY + (type === 'shoes' ? 5 : 1) * s, offFn: () => (thin ? 0.3 : 1.2) * s, straight: thin ? 0 : 2.6 * s });
    // под платьем/юбкой брюки видны только ниже подола — выше не строим, чтобы не проступали сквозь ткань
    const topY = type === 'dress' ? j.shY - g.length + 6 * s : type === 'skirt' ? j.waistY - g.length + 6 * s : j.waistY + 3 * s;
    out.push({ part: 'cloth', rgb: base, base: true, ...surfaceNets(thin ? (x, y, z) => smax(pf(x, y, z), y - topY, 1 * s) : pf, box(j.ankleY - 1, Math.min(topY + 2 * s, j.waistY + 3 * s)), 1.0 * s) });
  }
  if (!g || type === 'none') return out;

  // зона для карты посадки: рукава относятся к груди/плечам
  const colorAt = (x, y, z) => g.colorFor(Math.min(arms[-1](x, y, z), arms[1](x, y, z)) < torso(x, y, z) ? 'chest' : y < j.hipY + (j.waistY - j.hipY) / 2 ? 'hips' : y < (j.waistY + j.bustY) / 2 ? 'waist' : 'chest');
  let f, bb;
  if (type === 'dress' || type === 'top' || type === 'outer') {
    const hemY = Math.max(1.5 * s, j.shY - g.length);
    const flare = type === 'top' ? 0 : 0.08 + Math.max(0, off.hips - 1.6 * s) * 0.03;
    f = top({ hemY, sleeveT: type === 'outer' ? 0.97 : 0.93, offFn, skirtFlare: hemY < j.hipY ? flare : -1 });
    bb = box(hemY - 2 * s, j.shY + 8 * s);
  } else if (type === 'skirt') {
    const hemY = Math.max(1.5 * s, j.waistY - g.length);
    const t = top({ hemY, sleeveT: 0, offFn, skirtFlare: 0.1 });
    f = (x, y, z) => smax(t(x, y, z), y - (j.waistY + 1.5 * s), 1 * s);
    bb = box(hemY - 2 * s, j.waistY + 4 * s);
  } else if (type === 'pants') {
    const hemY = Math.max(0.6 * s, j.crotch - g.length);
    f = pants({ hemY, offFn });
    bb = box(hemY - 1, j.waistY + 4 * s);
  } else if (type === 'shoes') {
    for (const side of [-1, 1]) {
      const x = side * j.legX * 0.8, L = j.foot.len, back = -0.26 * L, room = g.shoeRoom;
      // колодка: пятка, подъём и гладкий мыс без пальцев; лишний запас по длине — вперёд
      const last = union([
        ...footParts(j, side).slice(1, 4),
        ellipsoid([x - side * 0.6 * s, 2.3 * s, back + L * 0.8 + room * 0.6], [3.7 * s, 2.1 * s, L * 0.2 + room * 0.4]),
      ].map((q) => ({ ...q, k: 3 * s })), 3 * s);
      const sh = (px, py, pz) => {
        let d = last(px, py, pz) - 0.7 * s;
        d = smax(d, py - (j.ankleY + 0.5 * s - (pz > 3 * s ? Math.min(1.4 * s, (pz - 3 * s) * 0.3) : 0)), 1 * s); // вырез: сзади выше, к носку ниже
        const sole = smax(Math.abs(py - 0.55 * s) - 0.6 * s, last(px, 1.6 * s, pz) - 0.9 * s, 0.4 * s); // подошва
        return smin(d, sole, 0.8 * s);
      };
      out.push({ part: 'cloth', rgb: g.rgb, shoe: true, ...surfaceNets(sh, [x - 7 * s, -0.5, back - 3 * s, x + 7 * s, j.ankleY + 3 * s, back + L + 3 * s + room], 0.36 * s, () => g.colorFor('length')) });
    }
    return out;
  }
  out.push({ part: 'cloth', rgb: g.rgb, ...surfaceNets(f, bb, 0.9 * s, colorAt) });
  return out;
}
