import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icons.jsx';

// Выбор точки доставки на карте: булавка в центре, поиск адреса, «Найти меня».
// Карта — Яндекс.
const GROZNY = [43.3178, 45.6949];

export default function MapPicker({ start, onPick, onClose }) {
  const box = useRef(null), map = useRef(null), prov = useRef(null), revT = useRef(0), seqRef = useRef(0);
  const [addr, setAddr] = useState(''), [moved, setMoved] = useState(!!start), [busy, setBusy] = useState(false), [q, setQ] = useState(''), [hints, setHints] = useState([]), [geoErr, setGeoErr] = useState(''), [ready, setReady] = useState(false), [failed, setFailed] = useState(false);

  const reverse = (lat, lng) => {
    clearTimeout(revT.current);
    revT.current = setTimeout(async () => {
      const seq = ++seqRef.current; setBusy(true);
      let a = ''; try { a = await prov.current.reverse(lat, lng); } catch (e) { console.warn('reverse', e); }
      if (seq === seqRef.current) { setAddr(a); setBusy(false); }
    }, 700);
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      let p, m;
      try {
        p = await import('../lib/maps/yandex.js');
        m = await p.create(box.current, start ? [start.lat, start.lng] : GROZNY, start ? 17 : 13, (lat, lng) => { setMoved(true); reverse(lat, lng); });
      } catch { if (alive) setFailed(true); return; }
      if (!alive) { m.destroy(); return; }
      prov.current = p; map.current = m; setReady(true);
      if (start) reverse(start.lat, start.lng);
    })();
    return () => { alive = false; clearTimeout(revT.current); map.current?.destroy(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // подсказки адресов при вводе (не чаще раза в 0,7 с)
  useEffect(() => {
    const t = q.trim(); if (t.length < 3 || !ready) { setHints([]); return undefined; }
    const h = setTimeout(async () => {
      let r = []; try { r = await prov.current.search(t); } catch (e) { console.warn('search', e); }
      setHints(r);
    }, 700);
    return () => clearTimeout(h);
  }, [q, ready]);

  const locate = () => {
    setGeoErr('');
    if (!navigator.geolocation) { setGeoErr('Геолокация недоступна на этом устройстве'); return; }
    navigator.geolocation.getCurrentPosition((p) => map.current?.setView([p.coords.latitude, p.coords.longitude], 17),
      () => setGeoErr('Не удалось определить местоположение. Разрешите доступ к геолокации или найдите адрес поиском.'), { enableHighAccuracy: true, timeout: 10000 });
  };
  const confirm = () => { const [lat, lng] = map.current.center(); onPick({ lat: +lat.toFixed(6), lng: +lng.toFixed(6), address: addr }); };

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
              <li key={h.id}><button type="button" onClick={() => { map.current.setView([h.lat, h.lng], 17); setHints([]); setQ(''); }}>{h.label}</button></li>
            ))}</ul>
          )}
        </div>
      </div>
      <button type="button" className="mp-btn mp-locate" onClick={locate} aria-label="Найти меня"><Icon name="pin" /></button>
      <div className="mp-panel">
        <small className="muted">Двигайте карту — булавка покажет точку доставки</small>
        <strong>{failed ? 'Карта не загрузилась. Проверьте интернет или впишите адрес в поле.' : !ready ? 'Загружаем карту…' : busy ? 'Определяем адрес…' : addr || (moved ? 'Адрес не определён — допишите его после выбора' : 'Найдите адрес поиском или нажмите «Найти меня»')}</strong>
        {geoErr && <small className="msg">{geoErr}</small>}
        <button type="button" className="btn btn-primary press" disabled={!ready} onClick={confirm}>Доставить сюда</button>
      </div>
    </div>, document.body);
}
