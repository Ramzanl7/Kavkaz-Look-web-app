import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { useToast } from '../store/toast.jsx';
import { api, CITIES } from '../api/index.js';
import { buildLabel } from '../lib/updater.js';
import { useAction } from '../lib/useAction.js';
import { history } from '../lib/local.js';
import { useMyProfile, reloadProfile, patchProfile } from '../store/profile.js';
import Avatar from '../components/Avatar.jsx';
import PhoneInput, { formatPhone } from '../components/PhoneInput.jsx';

// Настройки: фото профиля, личные данные (для быстрого оформления заказа), пароль, история
export default function Settings() {
  const { user } = useAuth();
  const toast = useToast();
  const me = useMyProfile(user?.id ?? null);
  const [f, setF] = useState(null);
  const [pw, setPw] = useState({ a: '', b: '' });
  const [histCount, setHistCount] = useState(() => history.list().length);
  const fileRef = useRef(null);
  const [busy, run] = useAction();
  useEffect(() => { if (me && !f) setF({ name: me.name, phone: formatPhone(me.phone), city: me.city, address: me.address }); }, [me, f]);

  const save = (e) => { e.preventDefault(); return run(async () => {
    const err = await api.saveMyProfile(user.id, f);
    if (err) { toast(err); return; }
    await reloadProfile(user.id); toast('Данные сохранены');
  }); };
  const pick = (e) => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; run(async () => {
    const r = await api.setAvatar(user.id, file, me?.avatarPath);
    if (r.error) { toast(r.error); return; }
    patchProfile({ avatarPath: r.path, avatar: r.url }); toast('Фото обновлено');
  }); };
  const dropAvatar = () => run(async () => {
    if (await api.removeAvatar(user.id, me?.avatarPath)) { patchProfile({ avatarPath: null, avatar: null }); toast('Фото удалено'); } else toast('Не удалось удалить фото');
  });
  const changePw = (e) => { e.preventDefault(); if (pw.a !== pw.b) { toast('Пароли не совпадают'); return; } return run(async () => {
    const err = await api.changePassword(pw.a);
    if (err) toast(err); else { setPw({ a: '', b: '' }); toast('Пароль изменён'); }
  }); };

  const shown = f?.name || me?.name || user?.email?.split('@')[0] || '';
  return (
    <main className="wrap">
      <h1 className="screen-title rise">Настройки</h1>

      <section className="set-card rise" aria-labelledby="ph-h">
        <h2 id="ph-h" className="set-title">Фото профиля</h2>
        <div className="set-avatar">
          <Avatar src={me?.avatar} name={shown} size={84} />
          <div className="set-avatar-acts">
            <button type="button" className="btn btn-secondary btn-sm press" disabled={!!busy || !me?.extended} onClick={() => fileRef.current?.click()}>{me?.avatar ? 'Сменить фото' : 'Загрузить фото'}</button>
            {me?.avatar && <button type="button" className="link-muted" disabled={!!busy} onClick={dropAvatar}>Удалить фото</button>}
            <small className="muted">Без фото показываем первую букву имени.</small>
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={pick} />
        </div>
      </section>

      <form className="set-card form rise" style={{ '--d': 1 }} onSubmit={save} aria-labelledby="pd-h">
        <h2 id="pd-h" className="set-title">Личные данные</h2>
        {f === null ? <p className="muted">Загрузка…</p> : <>
          <div className="field"><label htmlFor="nm">Имя (видно в отзывах)</label>
            <input id="nm" maxLength={60} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" /></div>
          <div className="field"><label htmlFor="ph">Телефон для заказов</label>
            <PhoneInput id="ph" maxLength={20} value={f.phone} onChange={(phone) => setF({ ...f, phone })} /></div>
          <div className="field"><label htmlFor="ct">Город</label>
            <select id="ct" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })}>
              <option value="">Не выбран</option>{CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select></div>
          <div className="field"><label htmlFor="ad">Адрес доставки</label>
            <input id="ad" maxLength={200} placeholder="Улица, дом, квартира" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} autoComplete="street-address" /></div>
          <p className="hint" style={{ margin: 0 }}>Телефон и адрес подставятся при оформлении заказа. Их видите только вы; продавец получает их лишь вместе с заказом.</p>
          <button type="submit" className="btn btn-primary press" disabled={!!busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</button>
        </>}
      </form>

      <form className="set-card form rise" style={{ '--d': 2 }} onSubmit={changePw} aria-labelledby="pw-h">
        <h2 id="pw-h" className="set-title">Вход и пароль</h2>
        <div className="bcard"><strong>Почта для входа</strong><span className="muted">{user?.email}</span></div>
        <div className="field"><label htmlFor="pa">Новый пароль</label>
          <input id="pa" type="password" minLength={8} maxLength={72} autoComplete="new-password" value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} /></div>
        <div className="field"><label htmlFor="pb">Повторите пароль</label>
          <input id="pb" type="password" minLength={8} maxLength={72} autoComplete="new-password" value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} /></div>
        <button type="submit" className="btn btn-secondary press" disabled={!!busy || pw.a.length < 8}>Сменить пароль</button>
      </form>

      <section className="set-card rise" style={{ '--d': 3 }} aria-labelledby="hs-h">
        <h2 id="hs-h" className="set-title">История просмотров</h2>
        <p className="muted" style={{ margin: 0 }}>{histCount ? `Сохранено товаров: ${histCount}. Хранится только на этом устройстве.` : 'История пуста.'}</p>
        {histCount > 0 && <button type="button" className="btn btn-secondary btn-sm press" onClick={() => { history.clear(); setHistCount(0); toast('История очищена'); }}>Очистить историю</button>}
      </section>

      <p className="muted small">Версия приложения: {buildLabel()}</p>
    </main>
  );
}
