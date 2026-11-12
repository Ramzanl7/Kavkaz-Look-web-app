// Примитивы «полей расстояния» (SDF): для точки p возвращают расстояние до поверхности фигуры
// (минус — внутри). Плавное объединение smin даёт гладкие переходы, как у настоящего манекена.
// Единицы — сантиметры, ось Y вверх от пола, Z — вперёд (к зрителю).

export const smin = (a, b, k) => {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
export const smax = (a, b, k) => -smin(-a, -b, k);

export function sphere(c, r) {
  return { bb: [c[0] - r, c[1] - r, c[2] - r, c[0] + r, c[1] + r, c[2] + r], f: (x, y, z) => { const dx = x - c[0], dy = y - c[1], dz = z - c[2]; return Math.sqrt(dx * dx + dy * dy + dz * dz) - r; } };
}

// эллипсоид (приближение Инигo Килеса — хорошо работает для гладкого объединения)
export function ellipsoid(c, r) {
  const [rx, ry, rz] = r;
  return {
    bb: [c[0] - rx, c[1] - ry, c[2] - rz, c[0] + rx, c[1] + ry, c[2] + rz],
    f: (x, y, z) => {
      const px = (x - c[0]) / rx, py = (y - c[1]) / ry, pz = (z - c[2]) / rz;
      const k0 = Math.sqrt(px * px + py * py + pz * pz);
      const ux = px / rx, uy = py / ry, uz = pz / rz, k1 = Math.sqrt(ux * ux + uy * uy + uz * uz);
      return k1 === 0 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
    },
  };
}

// «конус со скруглёнными концами»: отрезок a→b с радиусами ra и rb (руки, ноги, пальцы, шея)
export function roundCone(a, b, ra, rb) {
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
  const l2 = bx * bx + by * by + bz * bz, rr = ra - rb, a2 = l2 - rr * rr, il2 = 1 / l2;
  const r = Math.max(ra, rb);
  return {
    bb: [Math.min(a[0], b[0]) - r, Math.min(a[1], b[1]) - r, Math.min(a[2], b[2]) - r, Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r, Math.max(a[2], b[2]) + r],
    f: (x, y, z) => {
      const px = x - a[0], py = y - a[1], pz = z - a[2];
      const yv = px * bx + py * by + pz * bz, zv = yv - l2;
      const qx = px * l2 - bx * yv, qy = py * l2 - by * yv, qz = pz * l2 - bz * yv;
      const x2 = qx * qx + qy * qy + qz * qz, y2 = yv * yv * l2, z2 = zv * zv * l2;
      const k = Math.sign(rr) * rr * rr * x2;
      if (Math.sign(zv) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - rb;
      if (Math.sign(yv) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - ra;
      return (Math.sqrt(x2 * a2 * il2) + yv * rr) * il2 - ra;
    },
  };
}

// Набор частей → одна функция с плавным объединением; части вне окрестности точки пропускаются (быстрее)
export function union(parts, k) {
  const pad = k + 2;
  return (x, y, z) => {
    let d = 1e9;
    for (let i = 0; i < parts.length; i++) {
      const b = parts[i].bb;
      if (x < b[0] - pad || y < b[1] - pad || z < b[2] - pad || x > b[3] + pad || y > b[4] + pad || z > b[5] + pad) {
        // далеко от части: грубая оценка снизу, чтобы не считать точно
        const dx = Math.max(b[0] - x, 0, x - b[3]), dy = Math.max(b[1] - y, 0, y - b[4]), dz = Math.max(b[2] - z, 0, z - b[5]);
        const far = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (far > d + k) continue;
      }
      d = smin(d, parts[i].f(x, y, z), parts[i].k ?? k);
    }
    return d;
  };
}

// «Лофт» по высоте: сечение — эллипс, центр и полуоси плавно меняются с высотой (по контрольным уровням).
// Даёт ровный силуэт без бугров: обхват на каждом уровне — ровно такой, какой задан.
// prof: [{ y, x, z, a, b }] по возрастанию y. Концы скругляются (k).
export function loft(prof, k = 2) {
  const n = prof.length, y0 = prof[0].y, y1 = prof[n - 1].y;
  // монотонный кубический сплайн (PCHIP) по каждому параметру: гладко, без волн и перехлёстов при разном шаге уровней
  const keys = ['x', 'z', 'a', 'b'];
  const slope = {};
  for (const key of keys) {
    const m = new Array(n).fill(0), dl = [];
    for (let i = 0; i < n - 1; i++) dl.push((prof[i + 1][key] - prof[i][key]) / (prof[i + 1].y - prof[i].y));
    m[0] = dl[0]; m[n - 1] = dl[n - 2];
    for (let i = 1; i < n - 1; i++) {
      if (dl[i - 1] * dl[i] <= 0) { m[i] = 0; continue; }
      const h0 = prof[i].y - prof[i - 1].y, h1 = prof[i + 1].y - prof[i].y, w1 = 2 * h1 + h0, w2 = h1 + 2 * h0;
      m[i] = (w1 + w2) / (w1 / dl[i - 1] + w2 / dl[i]);
    }
    slope[key] = m;
  }
  const at = (y) => {
    let i = 0; while (i < n - 2 && y > prof[i + 1].y) i++;
    const p1 = prof[i], p2 = prof[i + 1], h = p2.y - p1.y;
    const t = Math.min(1, Math.max(0, (y - p1.y) / h)), t2 = t * t, t3 = t2 * t;
    const cr = (key) => (2 * t3 - 3 * t2 + 1) * p1[key] + (t3 - 2 * t2 + t) * h * slope[key][i] + (-2 * t3 + 3 * t2) * p2[key] + (t3 - t2) * h * slope[key][i + 1];
    return { x: cr('x'), z: cr('z'), a: Math.max(0.3, cr('a')), b: Math.max(0.3, cr('b')) };
  };
  const N = Math.max(2, Math.ceil((y1 - y0) / 0.25) + 1), dy = (y1 - y0) / (N - 1), T = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) { const c = at(y0 + i * dy); T[i * 4] = c.x; T[i * 4 + 1] = c.z; T[i * 4 + 2] = c.a; T[i * 4 + 3] = c.b; }
  let ax = 0, az = 0;
  for (const p of prof) { ax = Math.max(ax, Math.abs(p.x) + p.a); az = Math.max(az, Math.abs(p.z) + p.b); }
  return {
    bb: [-ax, y0, -az, ax, y1, az],
    at,
    f: (x, y, z) => {
      // таблица по высоте с линейной интерполяцией — в разы быстрее, чем сплайн на каждый вызов
      const q = (Math.min(y1, Math.max(y0, y)) - y0) / dy, i = Math.min(N - 2, q | 0), t = q - i, o = i * 4;
      const cx = T[o] + (T[o + 4] - T[o]) * t, cz = T[o + 1] + (T[o + 5] - T[o + 1]) * t;
      const ca = T[o + 2] + (T[o + 6] - T[o + 2]) * t, cb = T[o + 3] + (T[o + 7] - T[o + 3]) * t;
      const u = (x - cx) / ca, v = (z - cz) / cb;
      let d = (Math.sqrt(u * u + v * v) - 1) * (ca < cb ? ca : cb);
      if (y - y0 < k) d = smax(d, y0 - y, k);
      if (y1 - y < k) d = smax(d, y - y1, k);
      return d;
    },
  };
}
