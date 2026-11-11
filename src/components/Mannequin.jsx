import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STATUS } from '../lib/fit.js';

// 3D-манекен по меркам и одежда на нём. Всё строится из «колец» — сечений тела на разной высоте.
// Обхват → эллипс сечения (ширина больше глубины). Одежда — такая же оболочка поверх тела:
// свободная вещь шире тела, тесная — обтягивает и подсвечивается красным (в режиме «карта посадки»).

const SEG = 40;
// эллипс с заданным обхватом и отношением глубины к ширине k
function ellipse(circ, k) {
  const a = circ / (Math.PI * Math.sqrt(2 * (1 + k * k)));
  return { a, b: a * k };
}

// труба по кольцам: ring = { y, x, z, a, b, color? }
function tube(rings, closeTop = false, closeBottom = false) {
  const pos = [], col = [], idx = [];
  rings.forEach((r) => {
    for (let i = 0; i <= SEG; i++) {
      const t = (i / SEG) * Math.PI * 2;
      pos.push(r.x + Math.cos(t) * r.a, r.y, r.z + Math.sin(t) * r.b);
      const c = r.color || [1, 1, 1];
      col.push(c[0], c[1], c[2]);
    }
  });
  for (let j = 0; j < rings.length - 1; j++) {
    for (let i = 0; i < SEG; i++) {
      const p = j * (SEG + 1) + i, q = p + SEG + 1;
      idx.push(p, q, p + 1, p + 1, q, q + 1);
    }
  }
  const cap = (r, up) => {
    const base = pos.length / 3; pos.push(r.x, r.y, r.z); const c = r.color || [1, 1, 1]; col.push(c[0], c[1], c[2]);
    const start = rings.indexOf(r) * (SEG + 1);
    for (let i = 0; i < SEG; i++) up ? idx.push(base, start + i + 1, start + i) : idx.push(base, start + i, start + i + 1);
  };
  if (closeTop) cap(rings[rings.length - 1], true);
  if (closeBottom) cap(rings[0], false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Сечения тела по меркам (сантиметры, y — от пола)
function bodyRings(b) {
  const H = b.height, f = b.gender === 'female';
  const crotch = b.inseam, hipY = crotch + H * 0.05, waistY = H * 0.615, bustY = H * 0.72, shY = H * 0.815;
  const hips = ellipse(b.hips, 0.78), waist = ellipse(b.waist, 0.74), chest = ellipse(b.chest, f ? 0.78 : 0.7);
  const sh = { a: b.shoulder / 2, b: chest.b * 0.75 };
  const torso = [
    { y: crotch, a: hips.a * 0.9, b: hips.b * 0.85 },
    { y: hipY, a: hips.a, b: hips.b },
    { y: (hipY + waistY) / 2, a: (hips.a + waist.a) / 2, b: (hips.b + waist.b) / 2 },
    { y: waistY, a: waist.a, b: waist.b },
    { y: bustY, a: chest.a, b: chest.b },
    { y: (bustY + shY) / 2, a: Math.max(chest.a, sh.a * 0.92), b: chest.b * 0.9 },
    { y: shY, a: sh.a * 0.92, b: sh.b * 0.8 },
    { y: shY + H * 0.012, a: sh.a * 0.55, b: sh.b * 0.6 },
    { y: shY + H * 0.025, a: H * 0.036, b: H * 0.034 },
  ].map((r) => ({ x: 0, z: 0, ...r }));
  const legX = hips.a * 0.48, thigh = b.hips * 0.6, knee = b.hips * 0.37, calf = b.hips * 0.38, ankle = b.hips * 0.22;
  const leg = (s) => [
    { y: H * 0.01, c: ankle * 0.9 }, { y: H * 0.05, c: ankle }, { y: H * 0.17, c: calf }, { y: H * 0.28, c: knee },
    { y: (H * 0.28 + crotch) / 2, c: (knee + thigh) / 2 }, { y: crotch + 2, c: thigh },
  ].map((r) => ({ x: s * legX * (r.y < H * 0.3 ? 0.92 : 1), z: 0, ...ellipse(r.c, 0.92), y: r.y }));
  const armTop = shY - H * 0.02, wristY = crotch + H * 0.02;
  const arm = (s) => [
    { y: wristY - H * 0.06, c: 15 }, { y: wristY, c: 16 }, { y: (wristY + armTop) / 2, c: b.chest * 0.25 },
    { y: armTop - H * 0.05, c: b.chest * 0.3 }, { y: armTop, c: b.chest * 0.32 },
  ].map((r) => {
    const t = (r.y - wristY) / (armTop - wristY);
    return { x: s * (sh.a + H * 0.02 + (1 - t) * H * 0.035), z: 0, ...ellipse(r.c, 0.9), y: r.y };
  });
  return { torso, legL: leg(-1), legR: leg(1), armL: arm(-1), armR: arm(1), y: { crotch, hipY, waistY, bustY, shY }, headR: H * 0.062, headY: shY + H * 0.025 + H * 0.07 };
}

const rgb = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };

// Одежда поверх тела. fit — результат evaluate() (статусы по зонам), g — замеры вещи.
function garmentMeshes(type, br, body, g, fit, color, heat) {
  const H = body.height, { y } = br, out = [];
  const zoneOf = (yy) => (yy >= (y.waistY + y.bustY) / 2 ? 'chest' : yy >= (y.hipY + y.waistY) / 2 ? 'waist' : 'hips');
  const st = Object.fromEntries(fit.map((z) => [z.zone, z]));
  const base = rgb(color);
  // карта посадки — цвет статуса; без неё ткань, а тесные места слегка краснеют (видно, что мало)
  const tightTint = [0.9, 0.25, 0.22];
  const paint = (zone) => {
    const z = st[zone];
    if (heat && z) return rgb(STATUS[z.status].color);
    if (z?.status === 'tight') return base.map((c, i) => c * 0.55 + tightTint[i] * 0.45);
    return base;
  };
  // во сколько раз вещь шире тела: запас показываем чуть утрированно, чтобы разница размеров была видна;
  // тесная вещь облегает вплотную
  const scale = (zone) => {
    const z = st[zone]; if (!z) return 1.03;
    if (z.status === 'tight') return 1.008;
    return 1.012 + (Math.max(z.delta, 0) / body[zone]) * 1.7;
  };
  const wrap = (r, zone) => ({ ...r, a: r.a * scale(zone), b: r.b * scale(zone), color: paint(zone) });

  const shoulderTop = y.shY + H * 0.012;
  if (type === 'dress' || type === 'top' || type === 'outer') {
    const hemY = Math.max(H * 0.03, y.shY - g.length);
    const low = hemY < y.hipY ? y.hipY : hemY;
    const rings = br.torso.filter((r) => r.y <= shoulderTop && r.y >= low - 0.01).map((r) => wrap(r, zoneOf(r.y)));
    if (hemY < y.hipY) {
      // юбочная часть платья/пальто: от линии бёдер охватывает обе ноги и слегка расширяется книзу
      const hipRing = rings.find((r) => Math.abs(r.y - y.hipY) < 0.01) || rings[0];
      const steps = 6;
      const flare = (type === 'outer' ? 0.03 : 0.05) + Math.max(0, (st.hips?.delta || 0) - 6) * 0.003; // свободное платье сильнее расходится
      const skirt = [];
      for (let i = steps; i >= 1; i--) {
        const yy = hemY + ((y.hipY - hemY) * (i - 1)) / steps;
        const grow = 1 + flare * ((y.hipY - yy) / 10);
        skirt.push({ x: 0, z: 0, y: yy, a: hipRing.a * grow, b: hipRing.b * grow * 1.05, color: hipRing.color });
      }
      rings.unshift(...skirt.reverse().sort((p, q) => p.y - q.y));
    } else {
      rings.unshift({ ...wrap(br.torso.find((r) => r.y >= hemY) || br.torso[0], 'hips'), y: hemY });
    }
    rings.sort((p, q) => p.y - q.y);
    out.push(tube(rings, true, false));
    // рукава: платье — короткие, рубашка — до локтя, верхняя одежда — длинные
    const sleeveTo = type === 'outer' ? 0.0 : type === 'top' ? 0.55 : 0.82;
    for (const arm of [br.armL, br.armR]) {
      const top = arm[arm.length - 1].y, bot = arm[0].y, stopY = bot + (top - bot) * sleeveTo;
      const rs = arm.filter((r) => r.y >= stopY).map((r) => ({ ...r, a: r.a * 1.25, b: r.b * 1.25, color: paint('chest') }));
      if (rs.length < 2) continue;
      rs.unshift({ ...rs[0], y: stopY });
      out.push(tube(rs.sort((p, q) => p.y - q.y)));
    }
  }
  if (type === 'skirt') {
    const hemY = Math.max(H * 0.03, y.waistY - g.length);
    const rings = br.torso.filter((r) => r.y <= y.waistY && r.y >= y.hipY - 0.01).map((r) => wrap(r, zoneOf(r.y)));
    const hipRing = rings.find((r) => Math.abs(r.y - y.hipY) < 0.01) || rings[0];
    for (let i = 1; i <= 5; i++) {
      const yy = y.hipY - ((y.hipY - hemY) * i) / 5;
      const grow = 1 + 0.03 * ((y.hipY - yy) / 10);
      rings.push({ x: 0, z: 0, y: yy, a: hipRing.a * grow, b: hipRing.b * grow * 1.05, color: hipRing.color });
    }
    out.push(tube(rings.sort((p, q) => p.y - q.y)));
  }
  if (type === 'pants') {
    const rings = br.torso.filter((r) => r.y <= y.waistY && r.y >= y.crotch).map((r) => wrap(r, zoneOf(r.y)));
    // низ верхней части закрыт — иначе в паху видна изнанка
    out.push(tube(rings.sort((p, q) => p.y - q.y), false, true));
    const legScale = scale('hips') + 0.08;
    const bottom = Math.max(0.5, y.crotch - g.length); // длинные брюки ложатся на пол
    for (const leg of [br.legL, br.legR]) {
      const rs = leg.filter((r) => r.y >= bottom).map((r) => ({ ...r, a: Math.max(r.a * legScale, r.a + 1.2), b: Math.max(r.b * legScale, r.b + 1.2), color: paint('hips') }));
      rs.unshift({ ...rs[0], y: bottom, a: rs[0].a * (bottom < H * 0.03 ? 1.15 : 1), b: rs[0].b * (bottom < H * 0.03 ? 1.15 : 1) });
      // верх штанины расширяется и заходит под пояс — переход от бёдер к ногам плавный, без ступеньки
      const hipRing = br.torso.find((r) => Math.abs(r.y - y.hipY) < 0.01);
      const side = Math.sign(leg[0].x) || 1, k = scale('hips');
      rs.push({ x: side * hipRing.a * 0.47, z: 0, y: (y.crotch + y.hipY) / 2, a: hipRing.a * 0.56 * k, b: hipRing.b * 0.97 * k, color: paint('hips') });
      rs.push({ x: side * hipRing.a * 0.45, z: 0, y: y.hipY, a: hipRing.a * 0.55 * k, b: hipRing.b * 0.95 * k, color: paint('hips') });
      out.push(tube(rs.sort((p, q) => p.y - q.y), true, false));
    }
  }
  return out;
}

export default function Mannequin({ body, type, garment, fit, color, heat }) {
  const box = useRef(null);
  const state = useRef(null);

  // сцена создаётся один раз
  useEffect(() => {
    const el = box.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 1, 2000);
    scene.add(new THREE.HemisphereLight(0xfff4dc, 0x0b2a1b, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(120, 260, 200); scene.add(key);
    const rim = new THREE.DirectionalLight(0xd6b56a, 1.1); rim.position.set(-200, 160, -160); scene.add(rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(60, 48), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 }));
    floor.rotation.x = -Math.PI / 2; scene.add(floor);
    const group = new THREE.Group(); scene.add(group);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false; controls.enableDamping = true; controls.minPolarAngle = Math.PI * 0.3; controls.maxPolarAngle = Math.PI * 0.55;
    controls.autoRotate = true; controls.autoRotateSpeed = 1.2;
    controls.addEventListener('start', () => { controls.autoRotate = false; });
    const resize = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();
    let raf = 0;
    const loop = () => { controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop); };
    loop();
    state.current = { scene, camera, controls, group, renderer };
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); controls.dispose();
      group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
      renderer.dispose(); renderer.domElement.remove();
    };
  }, []);

  // при смене мерок/размера/режима — пересобираем манекен и одежду
  useEffect(() => {
    const s = state.current; if (!s || !body) return;
    s.group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
    s.group.clear();
    const br = bodyRings(body);
    const skin = new THREE.MeshStandardMaterial({ color: 0xd9c7a7, roughness: 0.55, metalness: 0.05 });
    for (const rs of [br.torso, br.legL, br.legR, br.armL, br.armR]) s.group.add(new THREE.Mesh(tube(rs, false, true), skin));
    const head = new THREE.Mesh(new THREE.SphereGeometry(br.headR, 32, 24), skin); head.scale.set(0.82, 1, 0.9); head.position.y = br.headY; s.group.add(head);
    if (type && type !== 'none' && garment) {
      const cloth = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.0, side: THREE.DoubleSide });
      for (const g of garmentMeshes(type, br, body, garment, fit || [], color || '#2E6B4A', heat)) s.group.add(new THREE.Mesh(g, cloth));
    }
    const H = body.height;
    s.controls.target.set(0, H * 0.52, 0);
    s.camera.position.set(0, H * 0.6, H * 1.9);
    s.controls.update();
  }, [body, type, garment, fit, color, heat]);

  return <div className="mannequin" ref={box} role="img" aria-label="3D-манекен по вашим меркам в выбранной одежде. Вращайте пальцем." />;
}
