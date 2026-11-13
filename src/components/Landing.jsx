import { Fragment, useEffect, useRef, useState } from 'react';
import '../design/sell.css';

// Общие части лендингов (/sell для бутиков и приветствие для покупателей)
const heroes = import.meta.glob('../assets/home-hero.{jpg,webp}', { eager: true, query: '?url', import: 'default' });
export const HERO = Object.values(heroes)[0];
export const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Заголовок первого экрана: слова выплывают по одному. words = [[слово, золотом?], …]
export function HeroTitle({ words, start = 0.45 }) {
  return (
    <h1 className="sell-h1" aria-label={words.map(([w]) => w.replace(/ /g, ' ')).join(' ')}>
      {words.map(([w, gold], i) => (
        <Fragment key={i}>
          <span aria-hidden="true" className={'hero-word' + (gold ? ' gold' : '')} style={{ '--t': start + i * 0.13 }}>{w}</span>
          {i < words.length - 1 ? ' ' : ''}
        </Fragment>
      ))}
    </h1>
  );
}

// Сцена «истории»: при прокрутке экран задерживается, слова загораются по очереди.
// lines = [[строка, золотом?], …]
export function Story({ lines, label }) {
  const ref = useRef(null);
  const words = lines.flatMap(([t, gold], line) => t.split(' ').map((w) => [w, gold, line]));
  const [lit, setLit] = useState(reduced() ? words.length : 0);
  useEffect(() => {
    if (reduced()) return undefined;
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = ref.current; if (!el) return;
        const r = el.getBoundingClientRect();
        const p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - innerHeight)));
        setLit(Math.round(p * 1.15 * words.length));
      });
    };
    on();
    addEventListener('scroll', on, { passive: true }); addEventListener('resize', on);
    return () => { cancelAnimationFrame(raf); removeEventListener('scroll', on); removeEventListener('resize', on); };
  }, [words.length]);
  return (
    <section ref={ref} className="sell-story" aria-label={label}>
      <div className="sell-story-stage">
        <p className="sell-story-text" aria-label={lines.map(([t]) => t).join(' ')}>
          {lines.map((_, line) => (
            <span key={line} className="sell-story-line" aria-hidden="true">
              {words.map(([w, gold, l], i) => l === line && <span key={i} className={(i < lit ? 'lit' : '') + (gold ? ' gold' : '')}>{w} </span>)}
            </span>
          ))}
        </p>
      </div>
    </section>
  );
}

// Карточки с классом .reveal плавно появляются, когда до них долистали (если браузер не умеет — просто видны)
export function useReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const root = ref.current;
    if (!root || !('IntersectionObserver' in window) || reduced()) return undefined;
    root.classList.add('js-reveal');
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
    root.querySelectorAll('.reveal').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return ref;
}

// Заголовок вкладки браузера на время показа страницы
export function useTitle(title) {
  useEffect(() => { const t = document.title; document.title = title; return () => { document.title = t; }; }, [title]);
}
