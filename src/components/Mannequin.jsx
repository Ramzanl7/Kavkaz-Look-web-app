import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STATUS } from '../lib/fit.js';

// 3D-манекен по меркам покупателя и вещь на нём.
// Гладкое тело без лица и анатомических подробностей, всегда в нейтральной скромной базовой одежде.
// Сетки считаются в фоновом потоке (lib/avatar/worker.js), здесь — только показ.

const statusColors = Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [k, v.color]));

export default function Mannequin({ body, look, type, garment, fit, color, heat }) {
  const box = useRef(null);
  const state = useRef(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  // сцена и фоновый поток создаются один раз
  useEffect(() => {
    const el = box.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 1, 3000);
    scene.add(new THREE.HemisphereLight(0xfff6e8, 0x6b6458, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.1); key.position.set(150, 300, 250); scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.8); fill.position.set(0, 60, 300); scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffe2a8, 1.1); rim.position.set(-250, 200, -200); scene.add(rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(45, 48), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = 0.05; scene.add(floor);
    const group = new THREE.Group(); scene.add(group);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false; controls.enableDamping = true; controls.minPolarAngle = Math.PI * 0.25; controls.maxPolarAngle = Math.PI * 0.6;
    controls.autoRotate = true; controls.autoRotateSpeed = 1.1;
    controls.addEventListener('start', () => { controls.autoRotate = false; });
    const resize = () => { const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();
    let raf = 0;
    const loop = () => { controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop); };
    loop();
    const worker = new Worker(new URL('../lib/avatar/worker.js', import.meta.url), { type: 'module' });
    state.current = { scene, camera, controls, group, renderer, worker, req: 0, framed: '' };
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); worker.terminate();
      group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
      renderer.dispose(); renderer.domElement.remove();
    };
  }, []);

  // при смене мерок, внешности, размера или режима — пересборка в фоне
  useEffect(() => {
    const s = state.current; if (!s || !body) return;
    const id = ++s.req;
    setBusy(true); setError('');
    const g = type && type !== 'none' && garment ? {
      type, length: garment.length, fit: fit || [], color: color || '#2E6B4A', heat: !!heat, statusColors,
      shoeRoom: type === 'shoes' ? Math.max(0, (fit?.[0]?.delta ?? 1) - 1) : 0,
    } : null;
    s.worker.onmessage = ({ data }) => {
      if (data.id !== s.req) return; // пришёл устаревший результат
      if (data.error) { setError('Не удалось построить манекен.'); setBusy(false); return; }
      show(s, data, body, type);
      setBusy(false);
    };
    s.worker.postMessage({ id, body, look: look || {}, garment: g });
  }, [body, look, type, garment, fit, color, heat]);

  return (
    <div className="mannequin" ref={box} role="img" aria-label="3D-манекен по вашим меркам в выбранной вещи. Вращайте пальцем." aria-busy={busy}>
      {busy && <div className="mannequin-busy"><span className="spinner" aria-hidden="true" />Собираем манекен…</div>}
      {error && <div className="mannequin-busy">{error}</div>}
    </div>
  );
}

const skin = () => new THREE.MeshStandardMaterial({ color: 0xe8e0d4, roughness: 0.45, metalness: 0 });

function show(s, data, body, type) {
  s.group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
  s.group.clear();
  for (const m of data.meshes) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(m.position, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(m.normal, 3));
    geo.setIndex(new THREE.BufferAttribute(m.index, 1));
    let mat;
    if (m.part === 'cloth') {
      if (m.color) geo.setAttribute('color', new THREE.BufferAttribute(m.color, 3));
      mat = new THREE.MeshStandardMaterial({ color: m.color ? 0xffffff : new THREE.Color(...m.rgb), vertexColors: !!m.color, roughness: m.base ? 0.92 : 0.8 });
    } else if (m.part === 'hair') mat = new THREE.MeshStandardMaterial({ color: 0x2a1f19, roughness: 0.8 });
    else mat = skin();
    if (m.lowres) { mat.polygonOffset = true; mat.polygonOffsetFactor = 2; mat.polygonOffsetUnits = 2; }
    s.group.add(new THREE.Mesh(geo, mat));
  }
  // кадр: для обуви — ближе к стопам; камеру не дёргаем, если вид уже настроен под эту фигуру
  const frame = JSON.stringify([body.height, type === 'shoes']);
  if (s.framed !== frame) {
    s.framed = frame;
    const H = data.height;
    if (type === 'shoes') { s.controls.target.set(0, H * 0.07, 4); s.camera.position.set(H * 0.42, H * 0.42, H * 0.78); }
    else { s.controls.target.set(0, H * 0.5, 0); s.camera.position.set(0, H * 0.56, H * 2.25); }
    s.controls.update();
  }
}
