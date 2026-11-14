import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import EmptyState from '../components/EmptyState.jsx';
import { Icon } from '../components/Icons.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { useCart, rub } from '../store/cart.jsx';
import { useWishlist } from '../store/wishlist.jsx';
import { useToast } from '../store/toast.jsx';
import { useChatMode } from '../components/ChatThread.jsx';
import { api } from '../api/index.js';
import { suggestSize } from '../lib/sizes.js';
import { QUESTIONS, labelOf, parseText, loadPool, buildLook, replaceItem, lookTitle, queryOf, askServer, sizeFor } from '../lib/stylist.js';

const HELLO = 'Привет! Подберу образ из товаров бутиков Грозного и Чечни. Ответьте на пару вопросов или напишите своими словами.';
const AFTER = [['more', 'Ещё вариант'], ['cheaper', 'Подешевле'], ['modest', 'Поскромнее'], ['reset', 'Начать заново']];
let uid = 0; const mid = () => ++uid;

// Стилист в формате чата: вопросы кнопками → образ из каталога → уточнения
export default function Stylist() {
  useChatMode();
  const { user } = useAuth();
  const { add } = useCart();
  const { ids: wished, toggle } = useWishlist();
  const toast = useToast();
  const [msgs, setMsgs] = useState(() => [{ id: mid(), from: 'bot', text: HELLO }, { id: mid(), from: 'bot', text: QUESTIONS[0].text }]);
  const [step, setStep] = useState(0); // номер вопроса; QUESTIONS.length — вопросы закончились
  const [a, setA] = useState({});
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [size, setSize] = useState(null);
  const seed = useRef(1), seen = useRef(new Set()), end = useRef(null);

  useEffect(() => { if (user) api.getMeasurements().then((m) => { if (m) setSize({ wear: suggestSize(m, 'Женское')?.size || null, shoes: suggestSize(m, 'Обувь')?.size || null }); }); }, [user]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs, busy]);

  const push = (...m) => setMsgs((l) => [...l, ...m.map((x) => ({ id: mid(), ...x }))]);
  const mySize = (ans) => (ans.who === 'gift' ? null : size);
  const sizeNote = (ans) => { const s = mySize(ans); return s?.wear ? 'Учёл ваш размер: ' + s.wear.replace(/^\d+ \((.+)\)$/, '$1') + '.' : ''; };

  // собрать образ и показать его в чате
  const answer = async (ans, intro) => {
    setBusy(true);
    try {
      const list = await loadPool();
      let look = null, title = lookTitle(ans);
      if (ans.text) {
        const ai = await askServer(queryOf(ans));
        if (ai?.error) { push({ from: 'bot', text: ai.error }); return; }
        const first = ai?.looks?.[0];
        if (first?.items?.length) { look = first.items.map((x) => list.find((p) => p.id === x.id) || x); title = first.title || title; }
      }
      if (!look) look = buildLook(list, ans, { seed: seed.current, exclude: seen.current, size: mySize(ans) });
      if (!look.length && seen.current.size) { seen.current = new Set(); look = buildLook(list, ans, { seed: seed.current, size: mySize(ans) }); }
      if (!look.length) { push({ from: 'bot', text: 'Пока не нашёл подходящих вещей — в каталоге мало товаров под этот запрос. Попробуйте увеличить бюджет или выбрать другой стиль.', chips: 'after' }); return; }
      look.forEach((p) => seen.current.add(p.id));
      const sum = look.reduce((s, p) => s + p.price, 0);
      push({ from: 'bot', text: intro || `Готово! Собрал образ «${title}» — итого ${rub(sum)}.`, note: sizeNote(ans), look, ans, title });
    } finally { setBusy(false); }
  };

  const choose = (val, label) => {
    const q = QUESTIONS[step], next = { ...a, [q.key]: val || undefined };
    if (q.key === 'budget' && !val) delete next.budget;
    setA(next); push({ from: 'me', text: label });
    if (step + 1 < QUESTIONS.length) { setStep(step + 1); push({ from: 'bot', text: QUESTIONS[step + 1].text }); }
    else { setStep(QUESTIONS.length); answer(next); }
  };
  const sendText = (e) => {
    e.preventDefault();
    const t = text.trim(); if (t.length < 3 || busy) return;
    setText(''); push({ from: 'me', text: t });
    // запрос своими словами — новый подбор; из прошлых ответов берём только то, о чём в тексте не сказано: для кого и пол
    const parsed = parseText(t), next = { who: a.who, gender: a.gender, ...Object.fromEntries(Object.entries(parsed).filter(([, v]) => v !== undefined)) };
    setA(next); setStep(QUESTIONS.length); seed.current += 1;
    answer(next);
  };
  const act = (key) => {
    const last = [...msgs].reverse().find((m) => m.look);
    const base = last?.ans || a;
    if (key === 'reset') { seed.current += 1; seen.current = new Set(); setA({}); setStep(0); push({ from: 'me', text: 'Начать заново' }, { from: 'bot', text: QUESTIONS[0].text }); return; }
    push({ from: 'me', text: AFTER.find(([k]) => k === key)[1] });
    seed.current += 1;
    if (key === 'more') answer({ ...base, text: undefined });
    if (key === 'cheaper') { const sum = last?.look?.reduce((s, p) => s + p.price, 0) || base.budget || 0; const nb = sum ? Math.max(1000, Math.round(sum * 0.75 / 500) * 500) : base.budget; setA({ ...base, budget: nb }); answer({ ...base, budget: nb, text: undefined }, null); }
    if (key === 'modest') { const nb = { ...base, modest: true, style: 'modest', text: undefined }; setA(nb); answer(nb); }
  };
  const replace = (m, item) => {
    loadPool().then((list) => {
      const nl = replaceItem(list, m.ans, m.look, item, { seen: seen.current, size: mySize(m.ans) });
      if (!nl) { toast('Похожих вещей пока нет'); return; }
      nl.forEach((p) => seen.current.add(p.id));
      setMsgs((l) => l.map((x) => (x.id === m.id ? { ...x, look: nl, text: `Готово! Собрал образ «${x.title}» — итого ${rub(nl.reduce((s, p) => s + p.price, 0))}.` } : x)));
    });
  };
  const toCart = (m) => {
    const need = [];
    m.look.forEach((p) => { if (!p.sizes?.length) add(p); else { const s = sizeFor(p, mySize(m.ans)); if (s) add(p, s); else need.push(p); } });
    const added = m.look.length - need.length;
    if (!need.length) toast('Весь образ в корзине');
    else { toast(added ? `Добавлено ${added} из ${m.look.length}. Выберите размер для остальных` : 'Выберите размер для каждой вещи'); setMsgs((l) => l.map((x) => (x.id === m.id ? { ...x, needSize: need.map((p) => p.id) } : x))); }
  };
  const save = async (m) => {
    const fresh = m.look.filter((p) => !wished.has(p.id));
    for (const p of fresh) await toggle(p.id);
    toast(fresh.length ? 'Образ сохранён в избранное' : 'Образ уже в избранном');
  };

  if (!user) return (
    <main className="wrap">
      <h1 className="screen-title">ИИ-стилист</h1>
      <EmptyState title="Войдите, чтобы спросить стилиста" text="Подберём образ из товаров бутиков Грозного и Чечни." action={<Link className="btn btn-primary press" to="/login">Войти</Link>} />
    </main>
  );

  const lastId = msgs[msgs.length - 1]?.id;
  const lastLook = [...msgs].reverse().find((m) => m.look || m.chips)?.id;
  return (
    <main className="chat-screen stylist">
      <header className="chat-head">
        <span className="chat-ava" aria-hidden="true"><Icon name="sparkles" /></span>
        <span className="grow"><strong>ИИ-стилист</strong><small>Образы из бутиков Грозного и Чечни</small></span>
      </header>
      <div className="chat-body st-body">
        {msgs.map((m) => (
          <div key={m.id} className={'st-msg' + (m.from === 'me' ? ' mine' : '')}>
            <div className={'bubble' + (m.from === 'me' ? ' mine' : '')}><p>{m.text}</p>{m.note && <small className="st-note">{m.note}</small>}</div>
            {m.look && <LookCard m={m} onReplace={replace} onCart={toCart} onSave={save} />}
            {m.id === lastId && m.from === 'bot' && !m.look && !m.chips && step < QUESTIONS.length && !busy && (
              <div className="st-chips">{QUESTIONS[step].options.map(([v, l]) => <button key={l} type="button" className="quick-chip st-chip press" onClick={() => choose(v, l)}>{l}</button>)}</div>
            )}
            {m.id === lastLook && m.id === lastId && !busy && (
              <div className="st-chips">{AFTER.map(([k, l]) => <button key={k} type="button" className="quick-chip st-chip press" onClick={() => act(k)}>{l}</button>)}</div>
            )}
          </div>
        ))}
        {busy && <div className="bubble st-typing" aria-label="Подбираю"><i /><i /><i /></div>}
        <div ref={end} className="chat-end" />
      </div>
      <form className="composer" onSubmit={sendText}>
        <div className="composer-row">
          <textarea rows={1} maxLength={300} placeholder="Или напишите своими словами…" value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) sendText(e); }} aria-label="Запрос стилисту" />
          <button type="submit" className="composer-send" aria-label="Отправить" disabled={busy || text.trim().length < 3}>➤</button>
        </div>
        <small className="st-privacy">Не пишите в чат личные данные: имя, телефон, адрес.</small>
      </form>
    </main>
  );
}

function LookCard({ m, onReplace, onCart, onSave }) {
  const sum = m.look.reduce((s, p) => s + p.price, 0);
  return (
    <div className="st-look">
      <div className={'st-collage n' + Math.min(m.look.length, 4)}>
        {m.look.slice(0, 4).map((p) => <span key={p.id}>{p.thumb || p.image ? <img src={p.thumb || p.image} alt="" loading="lazy" /> : <i>{p.title.slice(0, 1)}</i>}</span>)}
      </div>
      <div className="st-items">
        {m.look.map((p) => (
          <div key={p.id} className="st-item">
            <Link to={'/product/' + p.id} state={{ p }} className="st-item-main">
              <strong>{p.title}</strong>
              <small>{[p.boutique, rub(p.price)].filter(Boolean).join(' · ')}</small>
              {m.needSize?.includes(p.id) && <em>Выбрать размер →</em>}
            </Link>
            <button type="button" className="st-swap press" onClick={() => onReplace(m, p)}>Заменить</button>
          </div>
        ))}
      </div>
      <div className="st-total"><span>Итого</span><b>{rub(sum)}</b></div>
      <button type="button" className="btn btn-primary press" onClick={() => onCart(m)}><Icon name="cart" />Весь образ в корзину</button>
      <button type="button" className="btn btn-secondary press" onClick={() => onSave(m)}><Icon name="heart" />Сохранить образ</button>
    </div>
  );
}
