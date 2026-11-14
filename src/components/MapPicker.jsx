import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Icon } from './Icons.jsx';

// Выбор точки доставки на карте (OpenStreetMap): булавка в центре, поиск адреса, «Найти меня».
// Адрес по точке подставляется сам — человек дописывает квартиру и подъезд.
const GROZNY = [43.3178, 45.6949];
const NOM = 'https://nominatim.openstreetmap.org';
const VIEWBOX = '44.80,43.95,46.75,42.45'; // Чеченская Республика
const label = (a = {}) => [a.city || a.town || a.village || a.hamlet || a.county, [a.road || a.pedestrian || a.neighbourhood, a.house_number].filter(Boolean).join(', ')].filter(Boolean).join(', ');

export default function MapPicker({ start, onPick, onClose }) {
  const box = useRef(null), map = useRef(null), revT = useRef(0), seqRef = useRef(0);
  const [addr, setAddr] = useState(''), [moved, setMoved] = useState(!!start), [busy, setBusy] = useState(false), [q, setQ] = useState(''), [hints, setHints] = useState([]), [geoErr, setGeoErr] = useState('');

  const reverse = (lat, lng) => {
    clearTimeout(revT.current);
    revT.current = setTimeout(async () => {
      const seq = ++seqRef.current; setBusy(true);
      try {
        const r = await fetch(`${NOM}/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=ru`).then((x) => x.json());
        if (seq === seqRef.current) setAddr(label(r.address) || r.display_name?.split(',').slice(0, 3).join(',') || '');
      } catch { if (seq === seqRef.current) setAddr(''); }
      if (seq === seqRef.current) setBusy(false);
    }, 700);
  };

  useEffect(() => {
    const m = L.map(box.current, { zoomControl: false, attributionControl: true }).setView(start ? [start.lat, start.lng] : GROZNY, start ? 17 : 13);
    m.attributionControl.setPrefix(false);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
    m.on('moveend', () => { const c = m.getCenter(); setMoved(true); reverse(c.lat, c.lng); });
    map.current = m;
    if (start) reverse(start.lat, start.lng);
    setTimeout(() => m.invalidateSize(), 50);
    return () => { clearTimeout(revT.current); m.remove(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // подсказки адресов при вводе (не чаще раза в 0,6 с)
  useEffect(() => {
    const t = q.trim(); if (t.length < 3) { setHints([]); return undefined; }
    const h = setTimeout(async () => {
      try {
        const r = await fetch(`${NOM}/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=ru&viewbox=${VIEWBOX}&bounded=1&accept-language=ru&q=${encodeURIComponent(t)}`).then((x) => x.json());
        setHints(Array.isArray(r) ? r : []);
      } catch { setHints([]); }
    }, 600);
    return () => clearTimeout(h);
  }, [q]);

  const locate = () => {
    setGeoErr('');
    if (!navigator.geolocation) { setGeoErr('Геолокация недоступна на этом устройстве'); return; }
    navigator.geolocation.getCurrentPosition((p) => map.current?.setView([p.coords.latitude, p.coords.longitude], 17),
      () => setGeoErr('Не удалось определить местоположение. Разрешите доступ к геолокации или найдите адрес поиском.'), { enableHighAccuracy: true, timeout: 10000 });
  };
  const confirm = () => { const c = map.current.getCenter(); onPick({ lat: +c.lat.toFixed(6), lng: +c.lng.toFixed(6), address: addr }); };

  return createPortal(
    <div className="mp" role="dialog" aria-modal="true" aria-label="Точка доставки на карте">
      <div className="mp-map" ref={box} />
      <span className="mp-pin" aria-hidden="true"><Icon name="pin" /></span>
      <div className="mp-top">
        <button type="button" className="mp-btn" onClick={onClose} aria-label="Закрыть"><Icon name="close" /></button>
        <div className="mp-search">
          <Icon name="search" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Улица, дом" aria-label="Поиск адреса" />
          {hints.length > 0 && (
            <ul className="mp-hints">{hints.map((h) => (
              <li key={h.place_id}><button type="button" onClick={() => { map.current.setView([+h.lat, +h.lon], 17); setHints([]); setQ(''); }}>{label(h.address) || h.display_name}</button></li>
            ))}</ul>
          )}
        </div>
      </div>
      <button type="button" className="mp-btn mp-locate" onClick={locate} aria-label="Найти меня"><Icon name="pin" /></button>
      <div className="mp-panel">
        <small className="muted">Двигайте карту — булавка покажет точку доставки</small>
        <strong>{busy ? 'Определяем адрес…' : addr || (moved ? 'Адрес не определён — допишите его после выбора' : 'Найдите адрес поиском или нажмите «Найти меня»')}</strong>
        {geoErr && <small className="msg">{geoErr}</small>}
        <button type="button" className="btn btn-primary press" onClick={confirm}>Доставить сюда</button>
      </div>
    </div>, document.body);
}
