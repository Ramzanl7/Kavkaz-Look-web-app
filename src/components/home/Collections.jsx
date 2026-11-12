import { Link } from 'react-router-dom';
import { Icon } from '../Icons.jsx';

// Подборки на главной: крупные карточки с обложкой, листаются вбок
export default function Collections({ items }) {
  if (!items?.length) return null;
  return (
    <section className="home-sec" aria-labelledby="coll-h">
      <div className="sec-head2"><h2 id="coll-h"><Icon name="sparkles" />Подборки</h2></div>
      <div className="hscroll colls">
        {items.map((c) => (
          <Link key={c.id} className={'coll-card press' + (c.cover ? ' has-cover' : '')} to={'/collections/' + c.id} style={c.cover ? { '--cover': `url(${c.cover})` } : undefined}>
            <strong>{c.title}</strong>{c.subtitle && <small>{c.subtitle}</small>}
          </Link>
        ))}
      </div>
    </section>
  );
}
