import { useState } from 'react';
import { Icon } from '../Icons.jsx';
import { CITIES } from '../../api/index.js';

// Шапка главной: логотип с золотым символом гор, подпись «Стиль Кавказа», выбор города.
// Фон — горный пейзаж (src/assets/home-hero.jpg, если добавлен), с затемнением для читаемости.
const heroes = import.meta.glob('../../assets/home-hero.{jpg,webp}', { eager: true, query: '?url', import: 'default' });
const hero = Object.values(heroes)[0];

export function Mountains() {
  return (
    <svg className="mark-mountains" viewBox="0 0 64 22" aria-hidden="true">
      <path d="M1 21 19 4l7 7 8-9 13 13 4-3 12 9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M15 8l4-4 4 4M30 6l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" opacity=".7" />
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
        <Icon name="pin" /><span>{city || 'Вся Чечня'}</span>
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
