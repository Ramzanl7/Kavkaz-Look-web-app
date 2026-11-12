import { useState } from 'react';
import { Icon } from '../Icons.jsx';
import { CITIES } from '../../api/index.js';

// Шапка главной: логотип с золотым символом гор, подпись «Стиль Кавказа», выбор города.
// Фон — горный пейзаж (src/assets/home-hero.jpg, если добавлен), с затемнением для читаемости.
const heroes = import.meta.glob('../../assets/home-hero.{jpg,webp}', { eager: true, query: '?url', import: 'default' });
const hero = Object.values(heroes)[0];

export function Mountains() {
  return (
    <svg className="mark-mountains" viewBox="0 0 120 40" aria-hidden="true">
      <defs><linearGradient id="mtn-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#F0D99A" /><stop offset="1" stopColor="#B8913F" /></linearGradient></defs>
      <path d="M0 39 34 6l12 12L60 0l30 30 8-6 22 15h-9L98 30l-8 6-30-30-14 18L34 14 9 39z" fill="url(#mtn-g)" />
      <path d="M53 9l7-7 7 7-4-1-3 3-3-3zM29 11l5-5 5 5-3-1-2 2-2-2z" fill="#F7EBC8" />
    </svg>
  );
}

export default function HomeHeader({ city, onCity }) {
  const [open, setOpen] = useState(false);
  return (
    <header className={'home-head' + (hero ? ' has-hero' : '')} style={hero ? { '--hero': `url(${hero})` } : undefined}>
      <div className="home-logo">
        <Mountains />
        <span className="home-word">Kavkaz <span>Look</span></span>
        <small>Стиль Кавказа</small>
      </div>
      <button type="button" className="city-btn press" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Icon name="pin" /><span>{city || 'Вся Чечня'}</span><Icon name="down" />
      </button>
      {open && (
        <div className="sheet-bg" onClick={() => setOpen(false)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="city-t" onClick={(e) => e.stopPropagation()}>
            <h2 id="city-t">Ваш город</h2>
            <p className="hint" style={{ margin: 0 }}>Покажем товары бутиков из выбранного города.</p>
            <div className="city-list">
              {['', ...CITIES].map((c) => (
                <button key={c || 'all'} type="button" className={'city-opt press' + (c === city ? ' on' : '')} onClick={() => { onCity(c); setOpen(false); }}>
                  {c || 'Вся Чеченская Республика'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
