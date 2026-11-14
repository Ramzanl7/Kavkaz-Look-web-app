import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { Icon } from '../components/Icons.jsx';
import OrnamentBand from '../components/OrnamentBand.jsx';
import { HERO, HeroTitle, Story, useReveal, useTitle } from '../components/Landing.jsx';

const HERO_WORDS = [['Вся'], ['одежда'], ['Грозного —'], ['в одном', 1], ['приложении', 1]];
const BENEFITS = [
  ['shop', 'Все бутики в одном месте', 'Не нужно листать десятки Instagram-страниц. Ассортимент, цены и размеры — сразу.'],
  ['box', 'Заказ в пару нажатий', 'Доставка курьером или самовывоз. Оплата при получении.'],
  ['clock', 'Примерка в бутике', 'Сомневаетесь в размере? Отложите вещь и приходите примерить.'],
  ['sparkles', 'ИИ-стилист', 'Назовите повод и бюджет — подберём готовый образ.'],
  ['bell', 'Новинки любимых бутиков', 'Подпишитесь на бутик и узнавайте о поступлениях первыми.'],
  ['flame', 'Скидки и промокоды', 'Акции бутиков и промокоды прямо при оформлении.'],
];
const STORY_LINES = [['Не нужно объезжать весь город.'], ['Все бутики Чечни\u00a0— в\u00a0одном приложении.'], ['Нашли, заказали, получили.'], ['Ваш стиль\u00a0— в\u00a0двух нажатиях.', 1]];
const STEPS = [
  ['Выберите', 'Фильтры по размеру, цене, цвету и городу.'],
  ['Закажите', 'Доставка, самовывоз или примерка.'],
  ['Получите', 'Оплата при получении, без предоплаты.'],
];
const FAQ = [
  ['Нужно ли платить заранее?', 'Нет. Оплата при получении — наличными или переводом продавцу.'],
  ['А если не подойдёт размер?', 'Выберите «Отложить и примерить» — вещь подождёт вас в бутике.'],
  ['Сколько стоит доставка?', 'Условия доставки указывает каждый бутик на своей странице.'],
  ['Нужно ли регистрироваться?', 'Смотреть каталог можно без регистрации. Вход нужен, чтобы оформить заказ и сохранять избранное.'],
  ['Можно ли установить как приложение?', 'Да. В браузере нажмите «Поделиться» → «На экран Домой».'],
];

// Человек уже пользовался приложением на этом устройстве — приветствие ему не показываем
function returning() {
  try {
    if (localStorage.getItem('kl-welcomed') || localStorage.getItem('kl-viewed') || localStorage.getItem('kl-contact')) return true;
    for (let i = 0; i < localStorage.length; i++) if (/^sb-.+-auth-token$/.test(localStorage.key(i) || '')) return true;
  } catch { /* приватный режим — покажем приветствие */ }
  return false;
}

// Приветствие для покупателей: новые видят его один раз, дальше приложение открывается сразу с каталога.
// По адресу /welcome показывается всегда — эту ссылку удобно отправлять.
export default function Welcome() {
  const { pathname, search } = useLocation();
  const [skip] = useState(() => pathname !== '/welcome' && returning());
  const rootRef = useReveal();
  useTitle('Kavkaz Look — одежда бутиков Грозного и Чечни');
  useEffect(() => { try { localStorage.setItem('kl-welcomed', '1'); } catch { /* приватный режим */ } }, []);
  if (skip) return <Navigate to={'/home' + search} replace />;
  return (
    <main className="sell" ref={rootRef}>
      <section className="sell-hero" style={HERO ? { '--hero': `url(${HERO})` } : undefined}>
        <div className="sell-wrap">
          <span className="sell-eyebrow hero-in" style={{ '--t': 0.2 }}><i />Kavkaz Look · Стиль Кавказа</span>
          <HeroTitle words={HERO_WORDS} />
          <p className="sell-sub hero-in" style={{ '--t': 1.3 }}>Найдите свой стиль — не выходя из дома.</p>
          <p className="sell-lead hero-in" style={{ '--t': 1.6 }}>Мужская и женская одежда, национальные костюмы, обувь и аксессуары из местных бутиков. Закажите с доставкой, заберите сами или отложите и примерьте в бутике.</p>
          <div className="sell-cta hero-in" style={{ '--t': 1.9 }}>
            <Link className="btn btn-primary press hero-glow" to="/home">Смотреть каталог <Icon name="arrow" /></Link>
            <Link className="btn btn-secondary press" to="/sell">Я продаю одежду</Link>
          </div>
          <div className="sell-stats">
            <div className="hero-in" style={{ '--t': 2.2 }}><b>0 ₽</b><small>регистрация</small></div>
            <div className="hero-in" style={{ '--t': 2.35 }}><b>Оплата</b><small>при получении</small></div>
            <div className="hero-in" style={{ '--t': 2.5 }}><b>Рядом</b><small>бутики вашего города</small></div>
          </div>
        </div>
      </section>

      <OrnamentBand />

      <section className="sell-wrap sell-sec">
        <span className="sell-eyebrow"><i />Почему Kavkaz Look</span>
        <h2 className="sell-h2">Всё, чтобы найти своё&nbsp;— <em>без лишних поездок</em></h2>
        <div className="sell-grid">
          {BENEFITS.map(([ic, t, d], i) => (
            <article key={t} className="sell-card reveal" style={{ '--d': i }}>
              <span className="sell-ic"><Icon name={ic} /></span>
              <h3>{t}</h3><p>{d}</p>
            </article>
          ))}
        </div>
      </section>

      <Story lines={STORY_LINES} label="Почему это удобно" />

      <section className="sell-wrap sell-sec">
        <span className="sell-eyebrow"><i />Как это работает</span>
        <h2 className="sell-h2">Три шага до <em>новой вещи</em></h2>
        <ol className="sell-steps">{STEPS.map(([t, d], i) => <li key={t} className="reveal" style={{ '--d': i }}><span>{i + 1}</span><b>{t}</b><small>{d}</small></li>)}</ol>
      </section>

      <OrnamentBand delay={0.2} />

      <section className="sell-wrap sell-sec">
        <span className="sell-eyebrow"><i />Вопросы</span>
        <h2 className="sell-h2">О чём обычно спрашивают</h2>
        <div className="sell-faq">{FAQ.map(([q, a]) => <details key={q}><summary>{q}<Icon name="down" /></summary><p>{a}</p></details>)}</div>
      </section>

      <section className="sell-final">
        <OrnamentBand height={24} />
        <h2 className="sell-h2">Ваш следующий образ уже ждёт в&nbsp;одном из <em>бутиков Грозного</em></h2>
        <Link className="btn btn-primary press" to="/home">Смотреть каталог</Link>
        <Link className="link-muted" to="/sell">Продаёте одежду? Подключите свой бутик</Link>
        <Link className="link-muted" to="/privacy">Политика конфиденциальности</Link>
      </section>
    </main>
  );
}
