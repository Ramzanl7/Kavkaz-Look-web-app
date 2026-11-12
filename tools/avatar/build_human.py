"""Сборка данных реалистичного манекена из открытой модели MakeHuman (CC0 1.0).

Берёт базовую сетку, нужные деформации (пол, вес, рост, пропорции, мерки) и веса скелета рук,
и пишет компактный бинарный файл src/lib/avatar/human.bin.gz для браузера.

Запуск (один раз, результат лежит в репозитории):
  git clone --depth 1 --filter=blob:none --sparse https://github.com/makehumancommunity/makehuman
  (cd makehuman && git sparse-checkout set makehuman/data/3dobjs makehuman/data/targets makehuman/data/rigs)
  python3 tools/avatar/build_human.py path/to/makehuman/makehuman/data src/lib/avatar/human.bin.gz
"""
import json, struct, sys
import numpy as np

D, OUT = sys.argv[1].rstrip('/') + '/', sys.argv[2]

# ---------- базовая сетка ----------
V, F, G, g = [], [], [], None
for line in open(D + '3dobjs/base.obj'):
    if line.startswith('v '): V.append([float(x) for x in line.split()[1:4]])
    elif line.startswith('g '): g = line.split()[1]
    elif line.startswith('f '): F.append([int(t.split('/')[0]) - 1 for t in line.split()[1:]]); G.append(g)
V = np.array(V, dtype=np.float64)

GROUPS = ['body', 'helper-tights', 'helper-skirt', 'helper-hair']
JOINTS = ['joint-l-shoulder', 'joint-r-shoulder', 'joint-l-elbow', 'joint-r-elbow', 'joint-l-hand', 'joint-r-hand',
          'joint-l-upper-leg', 'joint-r-upper-leg', 'joint-l-knee', 'joint-r-knee', 'joint-l-ankle', 'joint-r-ankle',
          'joint-neck', 'joint-head', 'joint-pelvis', 'joint-spine-1', 'joint-spine-3', 'joint-l-clavicle', 'joint-r-clavicle']
verts_of = lambda name: sorted(set(i for f, gg in zip(F, G) if gg == name for i in f))
keep = []
for name in GROUPS + JOINTS: keep += [i for i in verts_of(name) if i not in set(keep)]
remap = {old: new for new, old in enumerate(keep)}
assert all(remap[i] == i for i in range(13380)), 'тело должно идти первым и без перестановок'
P = V[keep]

def tris(name):
    out = []
    for f, gg in zip(F, G):
        if gg != name: continue
        r = [remap[i] for i in f]
        out += [r[0], r[1], r[2]] + ([r[0], r[2], r[3]] if len(r) == 4 else [])
    return np.array(out, dtype=np.uint16)

# ---------- лицо без черт: убираем полости глаз и рта, отверстия заклеиваем ----------
# Полость — вершины спереди головы, нормаль которых смотрит внутрь головы.
def centroid_of(name): return V[verts_of(name)].mean(0)
head_c, neck_c = centroid_of('joint-head'), centroid_of('joint-neck')
body_f = [f for f, gg in zip(F, G) if gg == 'body']
vn = np.zeros((13380, 3))
for f in body_f:
    a_, b_, c_ = V[f[0]], V[f[1]], V[f[2]]
    n = np.cross(b_ - a_, c_ - a_)
    for i in f: vn[i] += n
vn /= np.linalg.norm(vn, axis=1, keepdims=True) + 1e-12
hh = head_c[1] - neck_c[1]
cavity = set()
for i in range(13380):
    d = V[i] - head_c
    if V[i][1] < neck_c[1] + hh * 0.2 or d[2] < 0.15 * hh or abs(d[0]) > 0.55 * hh: continue
    out_dir = d / (np.linalg.norm(d) + 1e-12)
    if np.dot(out_dir, vn[i]) < -0.05: cavity.add(i)
# расширяем на одно кольцо, чтобы срезать и внутренний край губ/век
ring = set()
for f in body_f:
    if any(i in cavity for i in f): ring.update(f)
cavity |= {i for i in ring if np.dot(V[i] - head_c, vn[i]) < 0.35 * np.linalg.norm(V[i] - head_c)}
kept_f = [f for f in body_f if not any(i in cavity for i in f)]
import collections
ec = collections.Counter()
for f in kept_f:
    for a_, b_ in zip(f, f[1:] + f[:1]): ec[(a_, b_)] += 1
bnd = {}
for (a_, b_), n in ec.items():
    if (b_, a_) not in ec: bnd[a_] = b_  # направленное граничное ребро
loops, seen = [], set()
for st in list(bnd):
    if st in seen: continue
    loop, cur = [], st
    while cur not in seen and cur in bnd: seen.add(cur); loop.append(cur); cur = bnd[cur]
    loops.append(loop)
print('полостей вершин', len(cavity), 'отверстий', len(loops), [len(l) for l in loops])
FILL = loops  # для каждого отверстия — новая вершина в центре (позиция считается в браузере)
def body_tris():
    out = []
    for f in kept_f:
        r = [remap[i] for i in f]
        out += [r[0], r[1], r[2]] + ([r[0], r[2], r[3]] if len(r) == 4 else [])
    return out

# ---------- деформации ----------
def load_target(path):
    d = np.zeros((len(V), 3))
    for line in open(D + 'targets/' + path):
        if line.startswith('#') or not line.strip(): continue
        p = line.split(); d[int(p[0])] = [float(p[1]), float(p[2]), float(p[3])]
    return d[keep]

def avg(paths): return sum(load_target(p) for p in paths) / len(paths)

T = {}
for sex in ['female', 'male']:
    T[sex] = avg([f'macrodetails/{e}-{sex}-young.target' for e in ['african', 'asian', 'caucasian']])  # пол, нейтральная внешность
    for w in ['minweight', 'maxweight']:
        T[f'{sex}-{w}'] = load_target(f'macrodetails/universal-{sex}-young-averagemuscle-{w}.target')
    for h in ['minheight', 'maxheight']:
        T[f'{sex}-{h}'] = load_target(f'macrodetails/height/{sex}-young-averagemuscle-averageweight-{h}.target')
    T[f'{sex}-ideal'] = load_target(f'macrodetails/proportions/{sex}-young-averagemuscle-averageweight-idealproportions.target')
MEASURES = ['bust-circ', 'underbust-circ', 'waist-circ', 'hips-circ', 'shoulder-dist', 'upperleg-height', 'lowerleg-height',
            'thigh-circ', 'upperarm-circ', 'neck-circ', 'napetowaist-dist', 'waisttohip-dist', 'calf-circ']
for m in MEASURES:
    for d in ['decr', 'incr']: T[f'measure-{m}-{d}'] = load_target(f'measure/measure-{m}-{d}.target')

# ---------- веса рук для позы (руки вдоль тела) ----------
W = json.load(open(D + 'rigs/default_weights.mhw'))['weights']
def chain(side, bones):
    w = np.zeros(len(V))
    for b in bones:
        for i, x in W.get(f'{b}.{side}', []): w[i] += x
    return w
fingers = [f'finger{a}-{b}' for a in range(1, 6) for b in range(1, 4)] + [f'metacarpal{a}' for a in range(1, 5)]
arm_w = {}
for side, key in [('L', 'l'), ('R', 'r')]:
    fore = chain(side, ['lowerarm01', 'lowerarm02', 'wrist'] + fingers)
    upper = chain(side, ['upperarm01', 'upperarm02', 'shoulder01']) + fore
    arm_w[key] = (np.clip(upper, 0, 1), np.clip(fore, 0, 1))
# вспомогательные сетки (одежда) берут веса у ближайшей вершины тела
body = V[:13380]
for key in arm_w:
    up, fo = arm_w[key]
    for i in range(13380, len(V)):
        j = int(np.argmin(((body - V[i]) ** 2).sum(1)))
        up[i], fo[i] = up[j], fo[j]
ARM = np.stack([arm_w['l'][0][keep], arm_w['l'][1][keep], arm_w['r'][0][keep], arm_w['r'][1][keep]], 1)
ARM = np.round(ARM * 255).astype(np.uint8)

# ---------- мерочные кольца (из модуля измерений MakeHuman) ----------
RULER = {
    'neck': [7514,10358,7631,7496,7488,7489,7474,7475,7531,7537,7543,7549,7555,7561,7743,7722,856,1030,1051,850,844,838,832,826,820,756,755,770,769,777,929,3690,804,800,808,801,799,803,7513,7515,7521,7514],
    'bust': [8439,8455,8462,8446,8478,8494,8557,8510,8526,8542,10720,10601,10603,10602,10612,10611,10610,10613,10604,10605,10606,3942,3941,3940,3950,3947,3948,3949,3938,3939,3937,4065,1870,1854,1838,1885,1822,1806,1774,1790,1783,1767,1799,8471],
    'underbust': [10750,10744,10724,10725,10748,10722,10640,10642,10641,10651,10650,10649,10652,10643,10644,10645,10646,10647,10648,3988,3987,3986,3985,3984,3983,3982,3992,3989,3990,3991,3980,3981,3979,4067,4098,4073,4072,4094,4100,4082,4088],
    'waist': [4121,10760,10757,10777,10776,10779,10780,10778,10781,10771,10773,10772,10775,10774,10814,10834,10816,10817,10818,10819,10820,10821,4181,4180,4179,4178,4177,4176,4175,4196,4173,4131,4132,4129,4130,4128,4138,4135,4137,4136,4133,4134,4108,4113,4118,4121],
    'hips': [4341,10968,10969,10971,10970,10967,10928,10927,10925,10926,10923,10924,10868,10875,10861,10862,4228,4227,4226,4242,4234,4294,4293,4296,4295,4297,4298,4342,4345,4346,4344,4343,4361,4341],
    'thigh': [11071,11080,11081,11086,11076,11077,11074,11075,11072,11073,11069,11070,11087,11085,11084,12994,11083,11082,11079,11071],
    'upperarm': [8383,8393,8392,8391,8390,8394,8395,8399,10455,10516,8396,8397,8398,8388,8387,8386,10431,8385,8384,8389],
    'shoulder': [7478, 8274],
}

# ---------- запись ----------
chunks, header = [], {'license': 'Base mesh, targets and weights: MakeHuman, CC0 1.0 (makehumancommunity.org)', 'units': 'dm'}
def add(name, arr):
    arr = np.ascontiguousarray(arr)
    off = sum(len(c) for c in chunks)
    b = arr.tobytes(); b += b'\0' * (-len(b) % 4)
    chunks.append(b); header.setdefault('chunks', {})[name] = [off, arr.dtype.str, list(arr.shape)]
# новые вершины-«заплатки» в конце массива
fill_start = len(P)
P = np.vstack([P] + [P[[remap[i] for i in loop]].mean(0, keepdims=True) for loop in FILL])
bt = body_tris()
for k, loop in enumerate(FILL):
    c = fill_start + k
    for a_, b_ in zip(loop, loop[1:] + loop[:1]): bt += [remap[a_], remap[b_], c][::-1]
add('pos', P.astype(np.float32))
add('tri:body', np.array(bt, dtype=np.uint16))
for name in GROUPS[1:]: add('tri:' + name, tris(name))
fl = []
for loop in FILL: fl += [len(loop)] + [remap[i] for i in loop]
add('fill', np.array(fl, dtype=np.uint16)); header['fillStart'] = fill_start
for name in JOINTS: add('joint:' + name, np.array([remap[i] for i in verts_of(name)], dtype=np.uint16))
add('arm', ARM)
for name, ring in RULER.items(): add('ring:' + name, np.array(ring, dtype=np.uint16))
SCALE = 1 / 2000  # дм на единицу int16: точность 0,05 мм, диапазон ±16 дм
for name, d in T.items():
    nz = np.nonzero(np.abs(d).sum(1) > 1e-6)[0]
    q = np.round(d[nz] / SCALE).astype(np.int16)
    assert np.abs(d[nz]).max() < 32767 * SCALE
    if len(nz) > len(P) * 0.6: add('dense:' + name, np.round(d / SCALE).astype(np.int16))
    else: add('idx:' + name, nz.astype(np.uint16)); add('delta:' + name, q)
header['scale'] = SCALE
hj = json.dumps(header, ensure_ascii=False).encode(); hj += b' ' * (-len(hj) % 4)
import gzip
raw = b'KLAV' + struct.pack('<I', len(hj)) + hj + b''.join(chunks)
with open(OUT, 'wb') as f: f.write(gzip.compress(raw, 9, mtime=0))  # сжато: в браузере распаковывается DecompressionStream
print('вершин', len(P), 'деформаций', len(T), 'байт', 8 + len(hj) + sum(len(c) for c in chunks))
