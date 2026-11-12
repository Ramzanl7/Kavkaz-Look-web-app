import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { api, COLORS } from '../api/index.js';
import { useAction } from '../lib/useAction.js';
import { useToast } from '../store/toast.jsx';
import SizeEditor from '../components/SizeEditor.jsx';
import { Icon } from '../components/Icons.jsx';

const cats = ['Женское', 'Мужское', 'Национальное', 'Обувь', 'Аксессуары'];
const MAX = 6;

// Товар продавца: создание (/seller/products/new) и правка (/seller/products/:id/edit)
export default function SellerProductNew() {
  const { id } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [boutique, setBoutique] = useState(undefined);
  const [f, setF] = useState({ title: '', price: '', oldPrice: '', color: '', category: cats[0], description: '' });
  const [photos, setPhotos] = useState([]); // [{ path, thumb }]
  const original = useRef([]);
  const uploaded = useRef([]);
  const [uploading, setUploading] = useState(0);
  const [sizing, setSizing] = useState({ type: '', sizes: [], chart: {} });
  const [stock, setStock] = useState({});
  const [track, setTrack] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, run] = useAction();
  const [ready, setReady] = useState(!id);

  useEffect(() => {
    if (!user) return;
    api.getMyBoutique(user.id).then(async (b) => {
      setBoutique(b);
      if (!id || !b) { setReady(true); return; }
      const p = (await api.listMyProducts(b.id)).find((x) => x.id === id);
      if (!p) { setReady(true); setMsg('Товар не найден.'); return; }
      setF({ title: p.title, price: String(p.price), oldPrice: p.oldPrice ? String(p.oldPrice) : '', color: p.color || '', category: p.category, description: p.description || '' });
      setPhotos(p.photos.map((x) => ({ path: x.path, thumb: x.thumb })));
      original.current = p.photos.map((x) => x.path);
      setSizing({ type: p.garmentType || '', sizes: p.sizes || [], chart: p.sizeChart || {} });
      if (p.stock) { setTrack(true); setStock(Object.fromEntries(Object.entries(p.stock).map(([k, v]) => [k, String(v)]))); }
      setReady(true);
    });
  }, [user, id]);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const addFiles = async (files) => {
    const list = [...files].slice(0, MAX - photos.length);
    if (!list.length || !boutique) return;
    setUploading((n) => n + list.length);
    for (const file of list) {
      const r = await api.uploadProductPhoto(boutique.id, file);
      setUploading((n) => n - 1);
      if (r.error) { toast(r.error); continue; }
      uploaded.current.push(r.path);
      const thumb = api.imageUrls(r.path).thumb;
      setPhotos((l) => (l.length < MAX ? [...l, { path: r.path, thumb }] : l));
    }
  };
  const move = (i) => setPhotos((l) => [l[i], ...l.filter((_, n) => n !== i)]);
  const drop = (i) => setPhotos((l) => l.filter((_, n) => n !== i));
  const sizesList = sizing.sizes?.length ? sizing.sizes : ['_'];

  const submit = (e) => { e.preventDefault(); return run(async () => {
    setMsg('');
    if (!boutique) { setMsg('Бутик не найден.'); return; }
    const kept = photos.map((x) => x.path);
    const r = await api.saveProduct({ id, boutiqueId: boutique.id, ...f, price: Number(f.price), oldPrice: f.oldPrice === '' ? '' : Number(f.oldPrice), photos: kept, sizing, stock: track ? stock : null });
    if (!r.ok) { setMsg(r.error); return; }
    // удалённые фото больше нигде не нужны — чистим хранилище
    await api.removeProductPhotos([...original.current, ...uploaded.current].filter((x) => !kept.includes(x)));
    toast(id ? 'Изменения сохранены' : 'Товар добавлен');
    nav('/seller/products');
  }); };

  if (!ready || boutique === undefined) return <main className="wrap"><p className="lead">Загрузка…</p></main>;
  return (
    <main className="wrap">
      <h1 className="screen-title">{id ? 'Изменить товар' : 'Новый товар'}</h1>
      <form className="form" onSubmit={submit}>
        <div className="field"><label htmlFor="t">Название</label><input id="t" maxLength={120} value={f.title} onChange={set('title')} /></div>
        <div className="field"><label htmlFor="p">Цена, ₽</label><input id="p" inputMode="numeric" maxLength={8} value={f.price} onChange={(e) => setF({ ...f, price: e.target.value.replace(/[^0-9]/g, '') })} /></div>
        <div className="field"><label htmlFor="op">Старая цена, ₽ — для скидки (необязательно)</label><input id="op" inputMode="numeric" maxLength={8} value={f.oldPrice} onChange={(e) => setF({ ...f, oldPrice: e.target.value.replace(/[^0-9]/g, '') })} placeholder="Например 5500 — покажем зачёркнутой" /></div>
        {f.oldPrice && f.price && Number(f.oldPrice) > Number(f.price) && <span className="hint">Скидка {Math.round((1 - Number(f.price) / Number(f.oldPrice)) * 100)}% — покупатели увидят метку и старую цену.</span>}
        <div className="field"><label>Цвет</label>
          <div className="color-pick">{COLORS.map(([v, l, c]) => <button key={v} type="button" className={'color-dot' + (f.color === v ? ' on' : '')} style={{ background: c }} aria-label={l} aria-pressed={f.color === v} title={l} onClick={() => setF({ ...f, color: f.color === v ? '' : v })} />)}</div>
          {f.color && <small className="muted">{COLORS.find(([v]) => v === f.color)?.[1]}</small>}
        </div>
        <div className="field"><label htmlFor="c">Раздел</label><select id="c" value={f.category} onChange={set('category')}>{cats.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div className="field"><label htmlFor="d">Описание</label><textarea id="d" rows={4} maxLength={2000} value={f.description} onChange={set('description')} placeholder="Ткань, посадка, уход, особенности" /></div>

        <fieldset className="size-editor">
          <legend>Фото — до {MAX}. Первое — главное</legend>
          <div className="photo-grid">
            {photos.map((ph, i) => (
              <div key={ph.path} className={'photo-cell' + (i === 0 ? ' main' : '')}>
                <img src={ph.thumb} alt={'Фото ' + (i + 1)} />
                {i === 0 ? <span className="photo-main">Главное</span> : <button type="button" className="photo-act" onClick={() => move(i)}>Сделать главным</button>}
                <button type="button" className="photo-del" aria-label="Убрать фото" onClick={() => drop(i)}><Icon name="close" /></button>
              </div>
            ))}
            {Array.from({ length: uploading }, (_, n) => <div key={'u' + n} className="photo-cell skeleton" />)}
            {photos.length + uploading < MAX && (
              <label className="photo-cell photo-add press">
                <Icon name="catalog" /><span>Добавить</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
              </label>
            )}
          </div>
          <span className="hint">Фото сжимаются автоматически. Лучше всего — на светлом фоне, вещь целиком и детали отдельно.</span>
        </fieldset>

        <SizeEditor value={sizing} onChange={setSizing} title={f.title} category={f.category} />

        <fieldset className="size-editor">
          <legend>Остатки</legend>
          <label className="check"><input type="checkbox" checked={track} onChange={(e) => setTrack(e.target.checked)} /> Вести учёт количества — товар не купят больше, чем есть</label>
          {track && (
            <div className="stock-grid">
              {sizesList.map((s) => (
                <div key={s} className="field"><label htmlFor={'st' + s}>{s === '_' ? 'Количество, шт.' : 'Размер ' + s}</label>
                  <input id={'st' + s} inputMode="numeric" maxLength={4} placeholder="0" value={stock[s] ?? ''} onChange={(e) => setStock({ ...stock, [s]: e.target.value.replace(/[^0-9]/g, '') })} /></div>
              ))}
            </div>
          )}
        </fieldset>

        {msg && <p className="msg" role="status">{msg}</p>}
        <button className="btn btn-primary press" type="submit" disabled={!!busy || uploading > 0 || f.title.trim().length < 2 || !/^[0-9]+$/.test(f.price)}>{busy ? 'Сохраняем…' : uploading ? 'Загружаем фото…' : 'Сохранить'}</button>
      </form>
    </main>
  );
}
