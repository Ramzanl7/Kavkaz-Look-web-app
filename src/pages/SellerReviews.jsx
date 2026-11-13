import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { starsText } from '../components/Icons.jsx';
import { api } from '../api/index.js';
import { useAction } from '../lib/useAction.js';
import { useToast } from '../store/toast.jsx';

// Отзывы на товары бутика: ответ виден всем под отзывом, автору приходит уведомление
export default function SellerReviews() {
  const [list, setList] = useState(null), [f, setF] = useState('new'), [ed, setEd] = useState(null), [text, setText] = useState('');
  const [busy, run] = useAction(); const toast = useToast();
  const load = useCallback(() => api.sellerReviews().then(setList), []);
  useEffect(() => { load(); }, [load]);
  const save = (r, t) => run(async () => {
    const err = await api.replyReview(r.id, t);
    if (err) { toast(err); return; }
    toast(t.trim() ? 'Ответ опубликован' : 'Ответ удалён'); setEd(null); setText(''); load();
  });
  const shown = (list || []).filter((r) => f === 'all' || !r.reply);
  const avg = list?.length ? (list.reduce((a, r) => a + r.rating, 0) / list.length).toFixed(1) : null;
  return (
    <main className="wrap">
      <h1 className="screen-title rise">Отзывы</h1>
      {list === null ? <p className="lead">Загрузка… Если список не появляется — администратор ещё не обновил базу.</p> : <>
        {avg && <div className="stat-grid"><div className="stat"><b>{avg} ★</b><span>средняя оценка</span></div><div className="stat"><b>{list.length}</b><span>отзывов всего</span></div></div>}
        <p className="hint">Отвечайте вежливо и по делу — ответ увидят все покупатели. На плохой отзыв лучше ответить, чем промолчать.</p>
        <div className="chips">{[['new', 'Без ответа'], ['all', 'Все']].map(([v, l]) => <button key={v} type="button" className={'chip' + (f === v ? ' on' : '')} onClick={() => setF(v)}>{l}{v === 'new' ? ` · ${list.filter((r) => !r.reply).length}` : ''}</button>)}</div>
        {shown.length ? shown.map((r) => (
          <div key={r.id} className="bcard">
            <Link className="small link-u" to={'/product/' + r.product_id}>{r.product_title}</Link>
            <span className="stars">{starsText(r.rating)}</span>
            <strong>{r.author_name}</strong>
            {r.body && <span>{r.body}</span>}
            <span className="muted small">{new Date(r.created_at).toLocaleDateString('ru-RU')}{r.hidden ? ' · скрыт модератором' : ''}</span>
            {ed === r.id ? (
              <div className="form">
                <textarea className="reply-input" rows={3} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Спасибо за отзыв! …" aria-label="Ответ на отзыв" />
                <div className="acts">
                  <button type="button" className="act ok press" disabled={!!busy || !text.trim()} onClick={() => save(r, text)}>Опубликовать</button>
                  {r.reply && <button type="button" className="act danger press" disabled={!!busy} onClick={() => save(r, '')}>Удалить ответ</button>}
                  <button type="button" className="act press" onClick={() => setEd(null)}>Отмена</button>
                </div>
              </div>
            ) : <>
              {r.reply && <div className="review-reply"><b>Ваш ответ</b><span>{r.reply}</span></div>}
              <button type="button" className="act press" style={{ justifySelf: 'start' }} onClick={() => { setEd(r.id); setText(r.reply || ''); }}>{r.reply ? 'Изменить ответ' : 'Ответить'}</button>
            </>}
          </div>
        )) : <p className="muted">{f === 'new' ? 'Все отзывы с ответом. Отлично!' : 'Отзывов пока нет.'}</p>}
      </>}
    </main>
  );
}
