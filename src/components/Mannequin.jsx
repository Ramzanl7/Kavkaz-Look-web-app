import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { STATUS } from '../lib/fit.js';

// 3D-манекен по меркам покупателя и вещь на нём.
// Реалистичное тело (открытая модель MakeHuman, CC0) с гладким лицом без черт, матовое «премиальное» покрытие,
// всегда в нейтральной скромной базовой одежде.
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
    renderer.shadowMap.enabled = true;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    // мягкий «студийный» свет как в играх: окружение для отражений + ключевой свет с тенью
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.6;
    const camera = new THREE.PerspectiveCamera(30, 1, 1, 3000);
    const key = new THREE.DirectionalLight(0xfff4e6, 2.0); key.position.set(120, 300, 220); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); Object.assign(key.shadow.camera, { left: -70, right: 70, top: 210, bottom: -10, near: 10, far: 800 }); key.shadow.normalBias = 0.6;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffe2a8, 1.0); rim.position.set(-250, 220, -200); scene.add(rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(70, 48), new THREE.ShadowMaterial({ opacity: 0.35 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
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
      cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); worker.terminate(); pmrem.dispose(); scene.environment?.dispose();
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

// матовое покрытие дорогого магазинного манекена (слоновая кость)
const skin = () => new THREE.MeshPhysicalMaterial({ color: 0xe9e2d6, roughness: 0.42, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.5 });

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
      mat = new THREE.MeshStandardMaterial({ color: m.color ? 0xffffff : new THREE.Color(...m.rgb), vertexColors: !!m.color, roughness: 0.85, side: THREE.DoubleSide });
    } else if (m.part === 'hair') mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(...(m.rgb || [0.05, 0.035, 0.03])), roughness: 0.75, side: THREE.DoubleSide });
    else mat = skin();
    const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = true; mesh.receiveShadow = true;
    s.group.add(mesh);
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
