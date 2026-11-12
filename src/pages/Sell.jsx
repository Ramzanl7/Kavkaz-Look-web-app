import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icons.jsx';
import OrnamentBand from '../components/OrnamentBand.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { api, CITIES } from '../api/index.js';
import { useAction } from '../lib/useAction.js';
import '../design/sell.css';

const heroes = import.meta.glob('../assets/home-hero.{jpg,webp}', { eager: true, query: '?url', import: 'default' });
const HERO = Object.values(heroes)[0];
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const BENEFITS = [
  ['store', 'Витрина 24/7', 'Покупатели смотрят ваши вещи вечером из дома, а приходят в бутик утром.'],
  ['box', 'Заказы и брони', 'Заказ или «Отложить и примерить» — вам приходит уведомление, дальше звонок или WhatsApp.'],
  ['pin', 'Покупатели рядом', 'Поиск по городам Чечни: вас находят те, кому до вас 10 минут.'],
  ['sparkles', 'Свои промокоды', 'Код для вашего Instagram — и видно, сколько покупателей он привёл.'],
  ['chart', 'Статистика', 'Просмотры, избранное, заказы и выручка по дням.'],
  ['phone', 'Без сайта и программиста', 'Товар добавляется с телефона за 2 минуты: фото, цена, размеры, остатки.'],
];
const STEPS = [
  ['Оставьте заявку', 'Минута, без регистрации.'],
  ['Мы позвоним', 'В течение дня откроем вам кабинет продавца.'],
  ['Добавьте товары', 'С телефона: фото, цены, размеры.'],
  ['Получайте заказы', 'Уведомление — и покупатель уже ваш.'],
];
const FAQ = [
  ['Сколько это стоит?', 'Сейчас подключение и размещение бесплатны. Если условия когда-нибудь изменятся, предупредим заранее.'],
  ['Нужен ли свой сайт или программист?', 'Нет. Всё делается в кабинете продавца с телефона: товары, цены, остатки, заказы, промокоды.'],
  ['Как покупатель платит?', 'Сейчас — при получении: наличными или переводом вам. Онлайн-оплату добавим позже.'],
  ['Кто доставляет?', 'Вы решаете сами: самовывоз, ваш курьер или «Отложить и примерить» — покупатель бронирует вещь на сегодня или завтра и приходит в бутик.'],
  ['А если вещь закончилась?', 'Укажите остатки по размерам — больше, чем есть, не продадут. Покупатель может подписаться на поступление.'],
  ['Можно продавать национальную одежду?', 'Да, для неё есть отдельный раздел «Национальное». Пошив на заказ опишите в карточке товара.'],
  ['Кто видит телефон покупателя?', 'Только вы, и только пока заказ активен. После выполнения или отмены контакт удаляется.'],
];
const KINDS = ['Женское', 'Мужское', 'Национальное', 'Обувь', 'Аксессуары', 'Детское'];
const STORY = [['Вечером'], ['покупательница'], ['листает'], ['Kavkaz'], ['Look.'], ['Видит'], ['ваше'], ['платье'], ['и'], ['нажимает'], ['«Отложить'], ['и'], ['примерить».'], ['Утром', 1], ['она', 1], ['уже', 1], ['в', 1], ['вашем', 1], ['бутике.', 1]];

// Телефон в виде +7 (928) 000-00-00 по мере ввода
const maskPhone = (v) => {
  let d = String(v).replace(/\D/g, '');
  if (!d) return '';
  if (d[0] === '8') d = '7' + d.slice(1);
  if (d[0] !== '7') d = '7' + d;
  d = d.slice(0, 11);
  const p = [d.slice(1, 4), d.slice(4, 7), d.slice(7, 9), d.slice(9, 11)];
  return '+7' + (p[0] ? ' (' + p[0] : '') + (p[0].length === 3 ? ')' : '') + (p[1] ? ' ' + p[1] : '') + (p[2] ? '-' + p[2] : '') + (p[3] ? '-' + p[3] : '');
};

// Сцена «истории»: при прокрутке экран задерживается, слова загораются по очереди
function Story() {
  const ref = useRef(null);
  const [lit, setLit] = useState(reduced() ? STORY.length : 0);
  useEffect(() => {
    if (reduced()) return undefined;
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = ref.current; if (!el) return;
        const r = el.getBoundingClientRect();
        const p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - innerHeight)));
        setLit(Math.round(p * 1.15 * STORY.length));
      });
    };
    on();
    addEventListener('scroll', on, { passive: true }); addEventListener('resize', on);
    return () => { cancelAnimationFrame(raf); removeEventListener('scroll', on); removeEventListener('resize', on); };
  }, []);
  return (
    <section ref={ref} className="sell-story" aria-label="Как это выглядит для покупателя">
      <div className="sell-story-stage">
        <p className="sell-story-text" aria-label={STORY.map(([w]) => w).join(' ')}>
          {STORY.map(([w, gold], i) => <span key={i} aria-hidden="true" className={(i < lit ? 'lit' : '') + (gold ? ' gold' : '')}>{w} </span>)}
        </p>
      </div>
    </section>
  );
}

// Пример кабинета продавца — нарисован вёрсткой, чтобы показать, что получит бутик
function CabinetPreview() {
  return (
    <div className="sell-cab" aria-label="Пример кабинета продавца">
      <div className="sell-cab-head"><span>Кабинет продавца</span><span className="muted">сегодня</span></div>
      <div className="sell-cab-stats">
        <div><b>3</b><small>новых заказа</small></div>
        <div><b>214</b><small>просмотров</small></div>
        <div><b>18</b><small>в избранном</small></div>
      </div>
      <div className="sell-cab-row new"><span><b>Отложить и примерить</b><small>Платье «Седа», размер 44 · до 19:00</small></span><i>Новый</i></div>
      <div className="sell-cab-row"><span><b>Самовывоз</b><small>Рубашка белая, 50 · 3 900 ₽</small></span><i className="ok">Подтверждён</i></div>
      <div className="sell-cab-row"><span><b>Промокод SEDA10</b><small>использован 12 раз</small></span><i className="ok">Действует</i></div>
      <small className="sell-cab-note">Пример. Цифры условные.</small>
    </div>
  );
}

function LeadForm() {
  const { user } = useAuth();
  const [f, setF] = useState({ boutique: '', contact: '', phone: '', instagram: '', city: 'Грозный', kinds: [], comment: '', agree: false });
  const [msg, setMsg] = useState(''), [sent, setSent] = useState(false);
  const [busy, run] = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const phoneOk = f.phone.replace(/\D/g, '').length === 11;
  const ready = f.boutique.trim().length >= 2 && phoneOk && f.agree;
  const submit = (e) => { e.preventDefault(); return run(async () => {
    setMsg('');
    const err = await api.submitBoutiqueLead(f);
    if (err) { setMsg(err); return; }
    if (user) api.createRoleRequest(f.boutique).catch(() => {});
    setSent(true);
  }); };
  if (sent) return (
    <div className="sell-done" role="status">
      <span className="sell-done-ic"><Icon name="star" /></span>
      <h3>Заявка отправлена</h3>
      <p>Позвоним на {f.phone} в течение дня и поможем открыть кабинет. Пока можно посмотреть, как выглядят бутики в приложении.</p>
      <Link className="btn btn-secondary press" to="/boutiques">Посмотреть бутики</Link>
    </div>
  );
  return (
    <form className="sell-form" onSubmit={submit}>
      <h3>Подключить бутик</h3>
      <p className="muted small">Перезвоним в течение дня. Регистрироваться не нужно.</p>
      <div className="field"><label htmlFor="ld-b">Название бутика *</label><input id="ld-b" maxLength={80} value={f.boutique} onChange={set('boutique')} placeholder="Например, Седа" autoComplete="organization" /></div>
      <div className="field"><label htmlFor="ld-p">Телефон *</label><input id="ld-p" type="tel" inputMode="tel" autoComplete="tel" placeholder="+7 (900) 000-00-00" value={f.phone} onChange={(e) => setF({ ...f, phone: maskPhone(e.target.value) })} /></div>
      <div className="sell-2">
        <div className="field"><label htmlFor="ld-n">Ваше имя</label><input id="ld-n" maxLength={60} value={f.contact} onChange={set('contact')} autoComplete="given-name" /></div>
        <div className="field"><label htmlFor="ld-c">Город</label><select id="ld-c" value={f.city} onChange={set('city')}>{CITIES.map((c) => <option key={c}>{c}</option>)}</select></div>
      </div>
      <div className="field"><label htmlFor="ld-i">Instagram бутика</label><input id="ld-i" maxLength={60} value={f.instagram} onChange={set('instagram')} placeholder="@seda.boutique" autoCapitalize="none" /></div>
      <fieldset className="sell-kinds"><legend>Что продаёте</legend>
        {KINDS.map((k) => { const on = f.kinds.includes(k); return <button key={k} type="button" aria-pressed={on} className={'chip' + (on ? ' on' : '')} onClick={() => setF({ ...f, kinds: on ? f.kinds.filter((x) => x !== k) : [...f.kinds, k] })}>{k}</button>; })}
      </fieldset>
      <div className="field"><label htmlFor="ld-m">Комментарий</label><input id="ld-m" maxLength={500} value={f.comment} onChange={set('comment')} placeholder="Удобное время для звонка, вопросы" /></div>
      <label className="check"><input type="checkbox" checked={f.agree} onChange={(e) => setF({ ...f, agree: e.target.checked })} /> <span>Согласен на обработку данных по <Link className="link-u" to="/privacy">политике конфиденциальности</Link></span></label>
      {msg && <p className="msg" role="alert">{msg}</p>}
      <button type="submit" className="btn btn-primary press" disabled={!!busy || !ready}>{busy ? 'Отправляем…' : 'Отправить заявку'}</button>
    </form>
  );
}

// Лендинг для бутиков: зачем подключаться, как это работает, заявка без регистрации
export default function Sell() {
  const [counts, setCounts] = useState(null);
  const formRef = useRef(null), rootRef = useRef(null);
  // Карточки плавно появляются, когда до них долистали (если браузер не умеет — просто видны)
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !('IntersectionObserver' in window) || reduced()) return undefined;
    root.classList.add('js-reveal');
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
    root.querySelectorAll('.reveal').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    const t = document.title; document.title = 'Продавайте в Kavkaz Look — бутики Грозного и Чечни';
    api.platformCounts().then(setCounts);
    return () => { document.title = t; };
  }, []);
  const toForm = () => formRef.current?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
  return (
    <main className="sell" ref={rootRef}>
      <section className="sell-hero" style={HERO ? { '--hero': `url(${HERO})` } : undefined}>
        <div className="sell-wrap">
          <span className="sell-eyebrow rise"><i />Для бутиков Чечни</span>
          <h1 className="sell-h1 rise" style={{ '--d': 1 }}>Ваш бутик — в&nbsp;телефоне у&nbsp;каждого покупателя <em>Грозного</em></h1>
          <p className="sell-lead rise" style={{ '--d': 2 }}>Kavkaz Look собирает местные бутики в одном приложении. Покупатели находят ваши вещи, откладывают на примерку и заказывают — а вы получаете уведомление.</p>
          <div className="sell-cta rise" style={{ '--d': 3 }}>
            <button type="button" className="btn btn-primary press" onClick={toForm}>Подключить бутик <Icon name="arrow" /></button>
            <Link className="btn btn-secondary press" to="/catalog">Как видят покупатели</Link>
          </div>
          <div className="sell-stats rise" style={{ '--d': 4 }}>
            <div><b>0 ₽</b><small>подключение и размещение</small></div>
            <div><b>1 мин</b><small>оставить заявку</small></div>
            {counts?.products >= 50 ? <div><b>{counts.products}</b><small>товаров уже в приложении</small></div> : <div><b>2 мин</b><small>добавить товар с телефона</small></div>}
          </div>
        </div>
      </section>

      <OrnamentBand />

      <section className="sell-wrap sell-sec">
        <span className="sell-eyebrow"><i />Что получает бутик</span>
        <h2 className="sell-h2">Всё, чтобы продавать больше — <em>без лишней работы</em></h2>
        <div className="sell-grid">
          {BENEFITS.map(([ic, t, d], i) => (
            <article key={t} className="sell-card reveal" style={{ '--d': i }}>
              <span className="sell-ic"><Icon name={ic} /></span>
              <h3>{t}</h3><p>{d}</p>
            </article>
          ))}
        </div>
      </section>

      <Story />

      <section className="sell-wrap sell-sec sell-split">
        <div>
          <span className="sell-eyebrow"><i />Кабинет продавца</span>
          <h2 className="sell-h2">Заказы, остатки и статистика — <em>в одном месте</em></h2>
          <ul className="sell-list">
            <li><Icon name="bell" /><span><b>Уведомление о каждом заказе</b> — телефон покупателя и что он выбрал</span></li>
            <li><Icon name="box" /><span><b>Остатки по размерам</b> — не продадут то, чего нет</span></li>
            <li><Icon name="sparkles" /><span><b>Промокоды</b> — для Instagram, праздников и постоянных клиентов</span></li>
            <li><Icon name="chart" /><span><b>Статистика</b> — что смотрят, что добавляют в избранное, что покупают</span></li>
          </ul>
        </div>
        <CabinetPreview />
      </section>

      <OrnamentBand delay={0.2} />

      <section className="sell-wrap sell-sec">
        <span className="sell-eyebrow"><i />Как подключиться</span>
        <h2 className="sell-h2">Четыре шага до <em>первого заказа</em></h2>
        <ol className="sell-steps">{STEPS.map(([t, d], i) => <li key={t} className="reveal" style={{ '--d': i }}><span>{i + 1}</span><b>{t}</b><small>{d}</small></li>)}</ol>
      </section>

      <section className="sell-wrap sell-sec" ref={formRef} id="zayavka">
        <LeadForm />
      </section>

      <section className="sell-wrap sell-sec">
        <span className="sell-eyebrow"><i />Вопросы</span>
        <h2 className="sell-h2">О чём обычно спрашивают</h2>
        <div className="sell-faq">{FAQ.map(([q, a]) => <details key={q}><summary>{q}<Icon name="down" /></summary><p>{a}</p></details>)}</div>
      </section>

      <section className="sell-final">
        <OrnamentBand height={24} />
        <h2 className="sell-h2">Сейчас подключаем первые бутики Грозного</h2>
        <p className="sell-lead">Места в подборках на главной пока свободны.</p>
        <button type="button" className="btn btn-primary press" onClick={toForm}>Оставить заявку</button>
        <Link className="link-muted" to="/support">Есть вопрос? Напишите в поддержку</Link>
      </section>
    </main>
  );
}
