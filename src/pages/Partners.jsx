import { useState } from 'react';
import { Link } from 'react-router-dom';
import EmptyState from '../components/EmptyState.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api/index.js';
import { useAction } from '../lib/useAction.js';
const cats = [['food', 'Еда'], ['taxi', 'Такси'], ['delivery', 'Доставка'], ['coffee', 'Кофейни']];
export default function Partners() {
  const { user, loading } = useAuth();
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState('food');
  const [contact, setContact] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, run] = useAction();
  const submit = (e) => { e.preventDefault(); return run(async () => {
    const ok = await api.createPartnerRequest({ brand, category, contact });
    setMsg(ok ? 'Заявка отправлена. Мы свяжемся с вами.' : 'Не получилось. Проверьте данные и попробуйте ещё раз.');
  }); };
  if (loading) return <main className="wrap"><p className="lead">Загрузка…</p></main>;
  return (
    <main className="wrap">
      <h1 className="screen-title">Стать партнёром</h1>
      <p className="lead">Сотрудничество с чеченскими брендами: еда, такси, доставка, кофейни.</p>
      {!user ? <EmptyState title="Чтобы отправить заявку, войдите" action={<Link className="btn btn-primary press" to="/login">Войти</Link>} /> : (
        <form className="form" onSubmit={submit}>
          <div className="field"><label htmlFor="pb">Название бренда</label><input id="pb" maxLength={80} value={brand} onChange={(e) => setBrand(e.target.value)} /></div>
          <div className="field"><label htmlFor="pc">Направление</label><select id="pc" value={category} onChange={(e) => setCategory(e.target.value)}>{cats.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></div>
          <div className="field"><label htmlFor="pt">Как с вами связаться</label><input id="pt" maxLength={120} value={contact} onChange={(e) => setContact(e.target.value)} /></div>
          {msg && <p className="msg" role="status">{msg}</p>}
          <button className="btn btn-primary press" type="submit" disabled={busy || brand.trim().length < 2 || contact.trim().length < 3}>Отправить заявку</button>
        </form>
      )}
    </main>
  );
}
