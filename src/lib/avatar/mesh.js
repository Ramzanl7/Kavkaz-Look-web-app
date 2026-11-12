// Построение гладкой сетки из поля расстояний методом Surface Nets:
// вершина ставится в среднюю точку пересечений поверхности с рёбрами ячейки, нормали — по градиенту поля.
export function surfaceNets(f, bounds, step, colorAt) {
  const [x0, y0, z0, x1, y1, z1] = bounds;
  const nx = Math.ceil((x1 - x0) / step) + 1, ny = Math.ceil((y1 - y0) / step) + 1, nz = Math.ceil((z1 - z0) / step) + 1;
  const field = new Float32Array(nx * ny * nz);
  const id = (i, j, k) => i + nx * (j + ny * k);
  // грубый проход: блок 4×4×4, если его центр далеко от поверхности — точки внутри не считаем
  const B = 4, far = B * step * 0.87 * 1.6 + step;
  const nbx = Math.ceil(nx / B), nby = Math.ceil(ny / B), farB = new Uint8Array(nbx * nby * Math.ceil(nz / B));
  for (let bk = 0; bk < nz; bk += B) for (let bj = 0; bj < ny; bj += B) for (let bi = 0; bi < nx; bi += B) {
    const ik = Math.min(nz, bk + B + 1), ij = Math.min(ny, bj + B + 1), ii = Math.min(nx, bi + B + 1);
    const c = f(x0 + (bi + B / 2) * step, y0 + (bj + B / 2) * step, z0 + (bk + B / 2) * step);
    if (Math.abs(c) > far) { farB[bi / B + nbx * (bj / B + nby * (bk / B))] = 1; for (let k = bk; k < ik; k++) for (let j = bj; j < ij; j++) for (let i = bi; i < ii; i++) field[id(i, j, k)] = c; continue; }
    for (let k = bk; k < ik; k++) for (let j = bj; j < ij; j++) for (let i = bi; i < ii; i++) field[id(i, j, k)] = f(x0 + i * step, y0 + j * step, z0 + k * step);
  }

  const vidx = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cid = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
  const pos = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const v = new Float32Array(8);
  const E = edges.flat();
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    if (farB[((i / B) | 0) + nbx * (((j / B) | 0) + nby * ((k / B) | 0))]) continue; // блок далеко от поверхности
    let mask = 0;
    for (let c = 0; c < 8; c++) { const o = corners[c]; v[c] = field[id(i + o[0], j + o[1], k + o[2])]; if (v[c] < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (let e = 0; e < 24; e += 2) {
      const a = E[e], b = E[e + 1];
      if ((v[a] < 0) === (v[b] < 0)) continue;
      const t = v[a] / (v[a] - v[b]), oa = corners[a], ob = corners[b];
      sx += oa[0] + t * (ob[0] - oa[0]); sy += oa[1] + t * (ob[1] - oa[1]); sz += oa[2] + t * (ob[2] - oa[2]); n++;
    }
    vidx[cid(i, j, k)] = pos.length / 3;
    pos.push(x0 + (i + sx / n) * step, y0 + (j + sy / n) * step, z0 + (k + sz / n) * step);
  }
  const idx = [];
  const quad = (a, b, c, d, flip) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d); };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const inside = field[id(i, j, k)] < 0;
    if (inside !== (field[id(i + 1, j, k)] < 0)) quad(vidx[cid(i, j - 1, k - 1)], vidx[cid(i, j, k - 1)], vidx[cid(i, j, k)], vidx[cid(i, j - 1, k)], !inside);
    if (inside !== (field[id(i, j + 1, k)] < 0)) quad(vidx[cid(i - 1, j, k - 1)], vidx[cid(i - 1, j, k)], vidx[cid(i, j, k)], vidx[cid(i, j, k - 1)], !inside);
    if (inside !== (field[id(i, j, k + 1)] < 0)) quad(vidx[cid(i - 1, j - 1, k)], vidx[cid(i, j - 1, k)], vidx[cid(i, j, k)], vidx[cid(i - 1, j, k)], !inside);
  }
  // нормали по градиенту поля: разности соседних узлов уже посчитанной сетки + трилинейная интерполяция
  // (без повторных вычислений поля — в разы быстрее, освещение остаётся гладким)
  const gAt = (i, j, k, out) => {
    const i0 = Math.max(0, i - 1), i1 = Math.min(nx - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(ny - 1, j + 1), k0 = Math.max(0, k - 1), k1 = Math.min(nz - 1, k + 1);
    out[0] = (field[id(i1, j, k)] - field[id(i0, j, k)]) / (i1 - i0 || 1);
    out[1] = (field[id(i, j1, k)] - field[id(i, j0, k)]) / (j1 - j0 || 1);
    out[2] = (field[id(i, j, k1)] - field[id(i, j, k0)]) / (k1 - k0 || 1);
  };
  const nrm = new Float32Array(pos.length), gq = [0, 0, 0];
  for (let p = 0; p < pos.length; p += 3) {
    const fx = (pos[p] - x0) / step, fy = (pos[p + 1] - y0) / step, fz = (pos[p + 2] - z0) / step;
    const i = Math.min(nx - 2, Math.max(0, Math.floor(fx))), j = Math.min(ny - 2, Math.max(0, Math.floor(fy))), k = Math.min(nz - 2, Math.max(0, Math.floor(fz)));
    const tx = fx - i, ty = fy - j, tz = fz - k;
    let gx = 0, gy = 0, gz = 0;
    for (let c = 0; c < 8; c++) {
      const o = corners[c], w = (o[0] ? tx : 1 - tx) * (o[1] ? ty : 1 - ty) * (o[2] ? tz : 1 - tz);
      gAt(i + o[0], j + o[1], k + o[2], gq); gx += gq[0] * w; gy += gq[1] * w; gz += gq[2] * w;
    }
    const l = Math.hypot(gx, gy, gz) || 1; nrm[p] = gx / l; nrm[p + 1] = gy / l; nrm[p + 2] = gz / l;
  }
  let col = null;
  if (colorAt) { col = new Float32Array(pos.length); for (let p = 0; p < pos.length; p += 3) { const c = colorAt(pos[p], pos[p + 1], pos[p + 2]); col[p] = c[0]; col[p + 1] = c[1]; col[p + 2] = c[2]; } }
  return { position: new Float32Array(pos), normal: nrm, color: col, index: pos.length / 3 > 65535 ? new Uint32Array(idx) : new Uint16Array(idx) };
}
