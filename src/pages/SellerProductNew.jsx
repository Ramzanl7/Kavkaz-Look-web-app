import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api/index.js';
const cats = ['Женское', 'Мужское', 'Национальное', 'Обувь', 'Аксессуары'];
export default function SellerProductNew() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ title: '', price: '', category: cats[0], description: '' });
  const [file, setFile] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg('');
    const b = await api.getMyBoutique(user.id);
    const r = b ? await api.createProduct({ boutiqueId: b.id, ...f, price: Number(f.price), file }) : { ok: false, error: 'Бутик не найден.' };
    setBusy(false);
    if (r.ok) nav('/seller/products'); else setMsg(r.error);
  };
  return (
    <main className="wrap">
      <h1 className="screen-title">Новый товар</h1>
      <form className="form" onSubmit={submit}>
        <div className="field"><label htmlFor="t">Название</label><input id="t" maxLength={120} value={f.title} onChange={set('title')} /></div>
        <div className="field"><label htmlFor="p">Цена, ₽</label><input id="p" inputMode="numeric" maxLength={8} value={f.price} onChange={set('price')} /></div>
        <div className="field"><label htmlFor="c">Раздел</label><select id="c" value={f.category} onChange={set('category')}>{cats.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div className="field"><label htmlFor="d">Описание</label><input id="d" maxLength={2000} value={f.description} onChange={set('description')} /></div>
        <div className="field"><label htmlFor="i">Фото (jpeg, png, webp). Оно сожмётся автоматически</label><input id="i" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
        {msg && <p className="msg" role="status">{msg}</p>}
        <button className="btn btn-primary press" type="submit" disabled={busy || f.title.trim().length < 2 || !/^[0-9]+$/.test(f.price)}>Сохранить</button>
      </form>
    </main>
  );
}
