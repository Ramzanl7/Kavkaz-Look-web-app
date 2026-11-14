// Карта OpenStreetMap (запасной вариант, если нет ключа Яндекс Карт)
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const NOM = 'https://nominatim.openstreetmap.org';
const VIEWBOX = '44.80,43.95,46.75,42.45'; // Чеченская Республика
const label = (a = {}) => [a.city || a.town || a.village || a.hamlet || a.county, [a.road || a.pedestrian || a.neighbourhood, a.house_number].filter(Boolean).join(', ')].filter(Boolean).join(', ');

export const name = 'osm';
export async function create(el, center, zoom, onMove) {
  const m = L.map(el, { zoomControl: false }).setView(center, zoom);
  m.attributionControl.setPrefix(false);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
  m.on('moveend', () => { const c = m.getCenter(); onMove(c.lat, c.lng); });
  setTimeout(() => m.invalidateSize(), 50);
  return { center: () => { const c = m.getCenter(); return [c.lat, c.lng]; }, setView: (ll, z) => m.setView(ll, z), destroy: () => m.remove() };
}
export async function reverse(lat, lng) {
  const r = await fetch(`${NOM}/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=ru`).then((x) => x.json());
  return label(r.address) || r.display_name?.split(',').slice(0, 3).join(',') || '';
}
export async function search(q) {
  const r = await fetch(`${NOM}/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=ru&viewbox=${VIEWBOX}&bounded=1&accept-language=ru&q=${encodeURIComponent(q)}`).then((x) => x.json());
  return (Array.isArray(r) ? r : []).map((h) => ({ id: h.place_id, label: label(h.address) || h.display_name, lat: +h.lat, lng: +h.lon }));
}
