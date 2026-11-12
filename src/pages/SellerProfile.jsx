import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { api, CITIES } from '../api/index.js';
import { useAction } from '../lib/useAction.js';
import { useToast } from '../store/toast.jsx';

// Профиль бутика: то, что покупатель видит на странице бутика
export default function SellerProfile() {
  const { user } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [b, setB] = useState(undefined);
  const [f, setF] = useState(null);
  const [img, setImg] = useState({});
  const [busy, run] = useAction();
  const [msg, setMsg] = useState('');
  useEffect(() => {
    if (!user) return;
    api.getMyBoutique(user.id).then((r) => {
      setB(r);
      if (r) setF({ description: r.description || '', city: r.city || 'Грозный', address: r.address || '', hours: r.hours || '', phone: r.phone || '', whatsapp: r.whatsapp || '', telegram: r.telegram || '', delivery_pickup: r.delivery_pickup ?? true, delivery_courier: !!r.delivery_courier, courier_note: r.courier_note || '' });
      if (r) setImg({ logo: r.logo, cover: r.cover });
    });
  }, [user]);
  const upload = (kind) => (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file || !b) return;
    run(async () => {
      const r = await api.uploadProductPhoto(b.id, file);
      if (r.error) { toast(r.error); return; }
      setF((v) => ({ ...v, [kind + '_path']: r.path }));
      setImg((v) => ({ ...v, [kind]: api.imageUrls(r.path)[kind === 'logo' ? 'thumb' : 'image'] }));
    }, kind);
  };
  const save = (e) => { e.preventDefault(); return run(async () => {
    setMsg('');
    const err = await api.saveBoutique(b.id, f);
    if (err) { setMsg(err); return; }
    toast('Профиль бутика сохранён'); nav('/seller');
  }, 'save'); };
  if (b === undefined || (b && !f)) return <main className="wrap"><p className="lead">Загрузка…</p></main>;
  if (!b) return <main className="wrap"><p className="lead">Бутик не найден.</p></main>;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <main className="wrap">
      <h1 className="screen-title rise">Профиль бутика</h1>
      <form className="form" onSubmit={save}>
        <div className="bq-media">
          <label className="bq-cover press">{img.cover ? <img src={img.cover} alt="Обложка" /> : <span>Обложка — широкое фото магазина или коллекции</span>}
            <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={upload('cover')} /></label>
          <label className="bq-logo press">{img.logo ? <img src={img.logo} alt="Логотип" /> : <span>Лого</span>}
            <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={upload('logo')} /></label>
        </div>
        {busy === 'logo' || busy === 'cover' ? <p className="hint">Загружаем фото…</p> : null}
        <div className="field"><label htmlFor="bd">О бутике</label><textarea id="bd" rows={4} maxLength={1000} value={f.description} onChange={set('description')} placeholder="Что вы продаёте, чем отличаетесь" /></div>
        <div className="field"><label htmlFor="bc">Город</label><select id="bc" value={f.city} onChange={set('city')}>{CITIES.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div className="field"><label htmlFor="ba">Адрес магазина</label><input id="ba" maxLength={200} value={f.address} onChange={set('address')} placeholder="ул., дом, ТЦ, этаж" /></div>
        <div className="field"><label htmlFor="bh">Часы работы</label><input id="bh" maxLength={100} value={f.hours} onChange={set('hours')} placeholder="Ежедневно 10:00–20:00" /></div>
        <div className="field"><label htmlFor="bp">Телефон</label><input id="bp" type="tel" inputMode="tel" maxLength={20} value={f.phone} onChange={set('phone')} placeholder="+7 900 000-00-00" /></div>
        <div className="field"><label htmlFor="bw">WhatsApp (номер)</label><input id="bw" inputMode="tel" maxLength={20} value={f.whatsapp} onChange={set('whatsapp')} placeholder="79000000000" /></div>
        <div className="field"><label htmlFor="bt">Telegram</label><input id="bt" maxLength={40} value={f.telegram} onChange={set('telegram')} placeholder="@имя_магазина" /></div>
        <fieldset className="size-editor">
          <legend>Как покупатель получает заказ</legend>
          <label className="check"><input type="checkbox" checked={f.delivery_pickup} onChange={(e) => setF({ ...f, delivery_pickup: e.target.checked })} /> Самовывоз из магазина</label>
          <label className="check"><input type="checkbox" checked={f.delivery_courier} onChange={(e) => setF({ ...f, delivery_courier: e.target.checked })} /> Доставка курьером</label>
          {f.delivery_courier && <div className="field"><label htmlFor="bn">Условия доставки</label><input id="bn" maxLength={150} value={f.courier_note} onChange={set('courier_note')} placeholder="По Грозному 300 ₽, бесплатно от 5000 ₽" /></div>}
        </fieldset>
        <p className="hint">Контакты бутика видны покупателям на странице магазина.</p>
        {msg && <p className="msg" role="status">{msg}</p>}
        <button className="btn btn-primary press" type="submit" disabled={!!busy}>{busy === 'save' ? 'Сохраняем…' : 'Сохранить'}</button>
      </form>
    </main>
  );
}
