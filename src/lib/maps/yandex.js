// Яндекс Карты (JavaScript API 2.1): карта, адрес по точке и поиск адреса — через Геокодер Яндекса.
// Ключ — VITE_YANDEX_MAPS_KEY (в кабинете разработчика Яндекса ограничьте его адресами сайта).
const KEY = import.meta.env.VITE_YANDEX_MAPS_KEY;
const BOUNDS = [[42.45, 44.8], [43.95, 46.75]]; // Чеченская Республика
let loading = null;
function load() {
  if (window.ymaps?.Map) return Promise.resolve(window.ymaps);
  if (!loading) loading = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(KEY)}&lang=ru_RU&csp=true`;
    s.async = true;
    s.onload = () => window.ymaps.ready(() => res(window.ymaps));
    s.onerror = () => { loading = null; rej(new Error('yandex maps load failed')); };
    document.head.appendChild(s);
  });
  return loading;
}
// «Грозный, проспект Ахмата Кадырова, 12» — без страны и региона
const short = (geo) => {
  const a = geo.properties.get('metaDataProperty.GeocoderMetaData.Address.Components') || [];
  const pick = (k) => a.filter((c) => c.kind === k).map((c) => c.name).pop();
  const parts = [pick('locality') || pick('area'), pick('street') || pick('district'), pick('house')].filter(Boolean);
  return parts.length ? parts.join(', ') : geo.getAddressLine?.() || geo.properties.get('text') || '';
};

export const name = 'yandex';
export const available = () => !!KEY;
export async function create(el, center, zoom, onMove) {
  const ymaps = await load();
  const m = new ymaps.Map(el, { center, zoom, controls: ['zoomControl'] }, { suppressMapOpenBlock: true, yandexMapDisablePoiInteractivity: true });
  m.events.add('actionend', () => { const c = m.getCenter(); onMove(c[0], c[1]); });
  return { center: () => m.getCenter(), setView: (ll, z) => m.setCenter(ll, z, { duration: 300 }), destroy: () => m.destroy() };
}
export async function reverse(lat, lng) {
  const ymaps = await load();
  const r = await ymaps.geocode([lat, lng], { results: 1, kind: 'house' });
  const g = r.geoObjects.get(0) || (await ymaps.geocode([lat, lng], { results: 1 })).geoObjects.get(0);
  return g ? short(g) : '';
}
export async function search(q) {
  const ymaps = await load();
  const r = await ymaps.geocode(q, { results: 6, boundedBy: BOUNDS, strictBounds: true });
  const out = [];
  r.geoObjects.each((g) => { const [lat, lng] = g.geometry.getCoordinates(); out.push({ id: lat + ',' + lng, label: short(g), lat, lng }); });
  return out;
}
