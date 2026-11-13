import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icons.jsx';
import OrnamentBand from '../components/OrnamentBand.jsx';
import PhoneInput, { phoneComplete } from '../components/PhoneInput.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { api, CITIES } from '../api/index.js';
import { useAction } from '../lib/useAction.js';
import { HERO, HeroTitle, Story, reduced, useReveal, useTitle } from '../components/Landing.jsx';

const HERO_WORDS = [['Новые'], ['покупатели'], ['для\u00a0вашего'], ['бутика\u00a0—'], ['каждый', 1], ['день', 1]];

const BENEFITS = [
  ['box', 'Заказы онлайн', 'Покупатель оформляет заказ в пару нажатий — вам приходит уведомление с его телефоном и адресом.'],
  ['bag', 'Доставка или самовывоз — как вам удобно', 'Включите то, что подходит: свой курьер, самовывоз или и то и другое.'],
  ['clock', 'Примерка в бутике', 'Если человек сомневается в размере, он бронирует вещь и приходит примерить. Вы не теряете покупателя.'],
  ['pin', 'Клиенты из вашего города', 'Поиск по городам Чечни: вас находят те, кому до вас 10 минут.'],
  ['sparkles', 'Промокоды под вашу рекламу', 'Свой код для Instagram и WhatsApp-статусов — видно, сколько покупателей он привёл.'],
  ['phone', 'Без сайта и программиста', 'Товар добавляется с телефона за 2 минуты: фото, цена, размеры, остатки.'],
];
const STEPS = [
  ['Оставьте заявку', 'Минута, без регистрации.'],
  ['Мы позвоним', 'В течение дня поможем всё настроить.'],
  ['Добавьте товары', 'С телефона: фото, цены, размеры.'],
  ['Получайте заказы', 'Уведомление — и покупатель уже ваш.'],
];
const FAQ = [
  ['Сколько это стоит?', 'Сейчас подключение и размещение бесплатны. Если условия изменятся, предупредим заранее.'],
  ['Что можно продавать?', 'Мужскую, женскую и детскую одежду, национальные костюмы, обувь и аксессуары.'],
  ['У меня нет магазина, продаю через Instagram. Можно?', 'Да. Укажите это в заявке — подскажем, как оформить.'],
  ['Как покупатель платит?', 'Сейчас при получении — наличными или переводом вам. Онлайн-оплату добавим позже.'],
  ['Кто доставляет?', 'Вы решаете сами: свой курьер, самовывоз или примерка в бутике. Можно включить всё сразу.'],
  ['А если вещь закончилась?', 'Укажите остатки по размерам — больше, чем есть, не продадут.'],
  ['Кто видит телефон покупателя?', 'Только вы, и только пока заказ активен.'],
];
const KINDS = ['Мужское', 'Женское', 'Детское', 'Национальное', 'Обувь', 'Аксессуары'];
// История по строкам; последняя — золотом
const STORY_LINES = [['Ваш бутик закрылся в 19:00.'], ['В 23:00 человек листает Kavkaz Look и находит у вас то, что искал.'], ['Два нажатия — заказ оформлен.'], ['Утром вас ждёт новый покупатель.', 1]];



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
      <div className="sell-cab-row new"><span><b>Доставка</b><small>Костюм классический, 50 · 12 500 ₽</small></span><i>Новый</i></div>
      <div className="sell-cab-row"><span><b>Самовывоз</b><small>Платье вечернее, 44 · 6 900 ₽</small></span><i className="ok">Подтверждён</i></div>
      <div className="sell-cab-row"><span><b>Примерка</b><small>Кроссовки, 42 · сегодня до 19:00</small></span><i className="ok">Подтверждён</i></div>
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
  const phoneOk = phoneComplete(f.phone);
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
      <p>Позвоним на {f.phone} в течение дня и поможем всё настроить. А пока посмотрите, как бутики выглядят в приложении.</p>
      <Link className="btn btn-secondary press" to="/boutiques">Посмотреть бутики</Link>
    </div>
  );
  return (
    <form className="sell-form" onSubmit={submit}>
      <h3>Подключить бутик</h3>
      <p className="muted small">Перезвоним в течение дня. Регистрироваться не нужно.</p>
      <div className="field"><label htmlFor="ld-b">Название бутика *</label><input id="ld-b" maxLength={80} value={f.boutique} onChange={set('boutique')} placeholder="Как на вывеске или в Instagram" autoComplete="organization" /></div>
      <div className="field"><label htmlFor="ld-p">Телефон *</label><PhoneInput id="ld-p" value={f.phone} onChange={(phone) => setF((x) => ({ ...x, phone }))} /></div>
      <div className="sell-2">
        <div className="field"><label htmlFor="ld-n">Ваше имя</label><input id="ld-n" maxLength={60} value={f.contact} onChange={set('contact')} autoComplete="given-name" /></div>
        <div className="field"><label htmlFor="ld-c">Город</label><select id="ld-c" value={f.city} onChange={set('city')}>{CITIES.map((c) => <option key={c}>{c}</option>)}</select></div>
      </div>
      <div className="field"><label htmlFor="ld-i">Instagram бутика</label><input id="ld-i" maxLength={60} value={f.instagram} onChange={set('instagram')} placeholder="@vash.butik" autoCapitalize="none" /></div>
      <fieldset className="sell-kinds"><legend>Что продаёте</legend>
        {KINDS.map((k) => { const on = f.kinds.includes(k); return <button key={k} type="button" aria-pressed={on} className={'chip' + (on ? ' on' : '')} onClick={() => setF({ ...f, kinds: on ? f.kinds.filter((x) => x !== k) : [...f.kinds, k] })}>{k}</button>; })}
      </fieldset>
      <div className="field"><label htmlFor="ld-m">Комментарий</label><input id="ld-m" maxLength={500} value={f.comment} onChange={set('comment')} placeholder="Удобное время для звонка, вопросы" /></div>
      <label className="check"><input type="checkbox" checked={f.agree} onChange={(e) => setF({ ...f, agree: e.target.checked })} /> <span>Даю согласие на обработку данных по <Link className="link-u" to="/privacy">политике конфиденциальности</Link></span></label>
      {msg && <p className="msg" role="alert">{msg}</p>}
      <button type="submit" className="btn btn-primary press" disabled={!!busy || !ready}>{busy ? 'Отправляем…' : 'Отправить заявку'}</button>
    </form>
  );
}

// Лендинг для бутиков: зачем подключаться, как это работает, заявка без регистрации
export default function Sell() {
  const [counts, setCounts] = useState(null);
  const formRef = useRef(null), rootRef = useReveal();
  useTitle('Продавайте в Kavkaz Look — бутики Грозного и Чечни');
  useEffect(() => { api.platformCounts().then(setCounts); }, []);
  const toForm = () => formRef.current?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
  return (
    <main className="sell" ref={rootRef}>
      <section className="sell-hero" style={HERO ? { '--hero': `url(${HERO})` } : undefined}>
        <div className="sell-wrap">
          <span className="sell-eyebrow hero-in" style={{ '--t': 0.2 }}><i />Для продавцов одежды Чечни</span>
          <HeroTitle words={HERO_WORDS} />
          <p className="sell-sub hero-in" style={{ '--t': 1.45 }}>Даже когда ваш бутик закрыт.</p>
          <p className="sell-lead hero-in" style={{ '--t': 1.75 }}>Люди ищут одежду, обувь и аксессуары в Kavkaz&nbsp;Look. Покажите им свой ассортимент — они закажут с доставкой, заберут сами или придут примерить. А вам сразу придёт уведомление.</p>
          <div className="sell-cta hero-in" style={{ '--t': 2.05 }}>
            <button type="button" className="btn btn-primary press hero-glow" onClick={toForm}>Подключить бутик <Icon name="arrow" /></button>
            <Link className="btn btn-secondary press" to="/catalog">Как видят покупатели</Link>
          </div>
          <div className="sell-stats">
            <div className="hero-in" style={{ '--t': 2.35 }}><b>0 ₽</b><small>подключение и размещение</small></div>
            <div className="hero-in" style={{ '--t': 2.5 }}><b>1 мин</b><small>оставить заявку</small></div>
            {counts?.products >= 50 ? <div className="hero-in" style={{ '--t': 2.65 }}><b>{counts.products}</b><small>товаров уже в приложении</small></div> : <div className="hero-in" style={{ '--t': 2.65 }}><b>2 мин</b><small>добавить товар с телефона</small></div>}
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

      <Story lines={STORY_LINES} label="Как это выглядит для покупателя" />

      <section className="sell-wrap sell-sec sell-split">
        <div>
          <span className="sell-eyebrow"><i />Кабинет продавца</span>
          <h2 className="sell-h2">Заказы, остатки и статистика — <em>в одном месте</em></h2>
          <ul className="sell-list">
            <li><Icon name="bell" /><span><b>Уведомление о каждом заказе</b> — кто, что и как хочет получить</span></li>
            <li><Icon name="box" /><span><b>Остатки по размерам</b> — не продадут то, чего нет</span></li>
            <li><Icon name="sparkles" /><span><b>Промокоды</b> — для рекламы, праздников и постоянных клиентов</span></li>
            <li><Icon name="chart" /><span><b>Статистика</b> — что смотрят, что сохраняют, что покупают</span></li>
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
        <h2 className="sell-h2">Сейчас подключаем <em>первые бутики</em> Чечни</h2>
        <p className="sell-lead">Первые партнёры первыми попадают к покупателям — места в подборках на главной пока свободны.</p>
        <button type="button" className="btn btn-primary press" onClick={toForm}>Оставить заявку</button>
        <Link className="link-muted" to="/support">Есть вопрос? Напишите в поддержку</Link>
      </section>
    </main>
  );
}
