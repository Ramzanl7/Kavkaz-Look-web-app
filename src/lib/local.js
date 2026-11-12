// Данные только на этом устройстве (на сервер не уходят): история просмотров, история поиска, выбранный город.
const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* приватный режим */ } };
const UUID = /^[0-9a-f-]{36}$/i;

export const history = {
  list: () => read('kl-viewed', []).filter((id) => UUID.test(id)),
  add(id) { if (!UUID.test(id)) return; write('kl-viewed', [id, ...history.list().filter((x) => x !== id)].slice(0, 50)); },
  clear: () => write('kl-viewed', []),
};
export const searches = {
  list: () => read('kl-searches', []).filter((s) => typeof s === 'string').slice(0, 8),
  add(q) { const t = String(q || '').trim().slice(0, 80); if (t.length < 2) return; write('kl-searches', [t, ...searches.list().filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, 8)); },
  clear: () => write('kl-searches', []),
};
export const city = {
  get: () => { const c = read('kl-city', ''); return typeof c === 'string' ? c : ''; },
  set: (c) => write('kl-city', c),
};
