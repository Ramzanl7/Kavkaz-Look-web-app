import { useState } from 'react';
import { Link } from 'react-router-dom';
import EmptyState from '../components/EmptyState.jsx';
import PhotoSlot from '../components/PhotoSlot.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { useAction } from '../lib/useAction.js';
import { askStylist } from '../lib/stylist.js';
import { rub } from '../store/cart.jsx';

const IDEAS = ['Образ на свадьбу, сдержанно, до 20 000 ₽', 'Подарок маме до 10 000 ₽', 'Мужской образ на каждый день', 'Национальный наряд на праздник'];

export default function Stylist() {
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [busy, run] = useAction(1500);
  const ask = (text) => run(async () => {
    const query = (text ?? q).trim();
    if (query.length < 3) return;
    setQ(query); setRes(null);
    setRes(await askStylist(query));
  });

  if (!user) return (
    <main className="wrap">
      <h1 className="screen-title">ИИ-стилист</h1>
      <EmptyState title="Войдите, чтобы спросить стилиста" text="Подберём образ из товаров бутиков Грозного." action={<Link className="btn btn-primary press" to="/login">Войти</Link>} />
    </main>
  );

  return (
    <main className="wrap">
      <h1 className="screen-title rise">ИИ-стилист</h1>
      <p className="lead">Опишите повод, стиль и бюджет — подберу образ из товаров наших бутиков.</p>
      <form className="form" onSubmit={(e) => { e.preventDefault(); ask(); }}>
        <div className="field">
          <label htmlFor="sq">Ваш запрос</label>
          <textarea id="sq" className="ta" rows={3} maxLength={300} value={q} placeholder="Например: образ на свадьбу сестры, скромно, до 15 000 ₽" onChange={(e) => setQ(e.target.value)} />
          <small className="hint">Не пишите личные данные: имя, телефон, адрес.</small>
        </div>
        <button type="submit" className="btn btn-primary press" disabled={!!busy || q.trim().length < 3}>{busy ? 'Подбираю…' : 'Подобрать образ'}</button>
      </form>
      {!res && !busy && <div className="chips wrapchips">{IDEAS.map((t) => <button key={t} type="button" className="chip" onClick={() => ask(t)}>{t}</button>)}</div>}
      {busy && <div className="look skeleton" style={{ height: 220 }} />}
      {res?.error && <p className="notice">{res.error}</p>}
      {res && !res.error && (
        <section className="stylist-res rise">
          <p>{res.intro}</p>
          {res.looks.length ? res.looks.map((l, i) => (
            <article key={i} className="look">
              <h2>{l.title}</h2>
              <p className="muted">{l.why}</p>
              <div className="look-items">
                {l.items.map((p) => (
                  <Link key={p.id} to={'/product/' + p.id} className="look-item press">
                    <PhotoSlot src={p.thumb || p.image} alt={p.title} ratio="4 / 5" />
                    <strong>{p.title}</strong>
                    <span className="price">{rub(p.price)}</span>
                  </Link>
                ))}
              </div>
              <p className="muted">Итого: <b>{rub(l.items.reduce((s, p) => s + p.price, 0))}</b></p>
            </article>
          )) : <EmptyState title="Ничего не подобралось" text="Попробуйте изменить запрос или бюджет." />}
          <p className="hint">{res.ai ? 'Подбор сделан ИИ (Claude) только из товаров каталога. Проверяйте размеры и наличие у продавца.' : 'Сейчас работает простой подбор без ИИ.'}</p>
        </section>
      )}
    </main>
  );
}
