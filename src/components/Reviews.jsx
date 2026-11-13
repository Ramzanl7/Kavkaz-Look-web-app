import { useCallback, useEffect, useState } from 'react';
import { starsText } from './Icons.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { useToast } from '../store/toast.jsx';
import { api } from '../api/index.js';
import { useAction } from '../lib/useAction.js';
import ReportSheet from './ReportSheet.jsx';
export default function Reviews({ productId }) {
  const { user } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [stars, setStars] = useState(0);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, run] = useAction();
  const [rep, setRep] = useState(null);
  const load = useCallback(() => api.listReviews(productId).then(setItems), [productId]);
  useEffect(() => { load(); }, [load]);
  const submit = (e) => {
    e.preventDefault();
    if (!stars) { setMsg('Поставьте оценку от 1 до 5.'); return undefined; }
    return run(async () => {
      setMsg('');
      const r = await api.addReview(productId, stars, text);
      if (r.ok) { toast('Спасибо за отзыв'); setText(''); setStars(0); await load(); } else setMsg(r.error);
    }, 'add');
  };
  const del = (id) => run(async () => { if (window.confirm('Удалить отзыв?') && (await api.deleteReview(id))) await load(); }, id);
  return (
    <section className="reviews">
      <div className="sec-head"><h2>Отзывы{items ? ' (' + items.length + ')' : ''}</h2></div>
      {user ? (
        <form className="form" onSubmit={submit}>
          <div className="starpick" role="radiogroup" aria-label="Оценка">
            {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" className={n <= stars ? 'on' : ''} onClick={() => setStars(n)} aria-label={n + ' из 5'}>★</button>)}
          </div>
          <div className="field"><label htmlFor="rv">Ваш отзыв</label><input id="rv" maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} /></div>
          {msg && <p className="msg" role="status">{msg}</p>}
          <button className="btn btn-secondary press" type="submit" disabled={busy === 'add'}>{busy === 'add' ? 'Отправляем…' : 'Оставить отзыв'}</button>
          <p className="muted">Отзыв можно оставить, когда заказ с этим товаром выполнен.</p>
        </form>
      ) : <p className="muted">Войдите, чтобы оставить отзыв.</p>}
      {items === null ? <p className="lead">Загрузка…</p> : items.map((r) => (
        <div key={r.id} className="bcard">
          <span className="stars">{starsText(r.rating)}</span>
          <strong>{r.author_name}</strong>
          {r.body && <span>{r.body}</span>}
          <span className="muted">{new Date(r.created_at).toLocaleDateString('ru-RU')}</span>
          {r.reply && <div className="review-reply"><b>Ответ бутика</b><span>{r.reply}</span></div>}
          {user && r.user_id !== user.id && <button type="button" className="link-muted" style={{ justifySelf: 'start' }} onClick={() => setRep(r.id)}>Пожаловаться</button>}
          {user && r.user_id === user.id && <button type="button" className="act danger press" style={{ justifySelf: 'start' }} disabled={busy === r.id} onClick={() => del(r.id)}>Удалить мой отзыв</button>}
        </div>
      ))}
      {rep && <ReportSheet type="review" id={rep} onClose={() => setRep(null)} />}
    </section>
  );
}
