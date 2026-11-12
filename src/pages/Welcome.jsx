import { Link } from 'react-router-dom';
import Ornament from '../components/Ornament.jsx';
import PhotoSlot from '../components/PhotoSlot.jsx';
export default function Welcome() {
  return (
    <main className="wrap">
      <div className="topbar rise"><span className="wordmark">Kavkaz Look</span><span className="pill">ЧР | Грозный</span></div>
      <Ornament />
      <p className="eyebrow rise" style={{ '--d': 1 }}>Модный гид по городу</p>
      <h1 className="display rise" style={{ '--d': 2 }}>Стиль Грозного — в одном месте.</h1>
      <p className="lead rise" style={{ '--d': 3 }}>Открывайте местные бутики, находите новые образы и выбирайте одежду рядом.</p>
      <div className="row rise" style={{ '--d': 4 }}>
        <Link className="btn btn-cream press" to="/catalog">Смотреть каталог ↗</Link>
        <Link className="link-u" to="/sell">Я представляю бутик</Link>
      </div>
      <div className="rise" style={{ '--d': 5 }}><PhotoSlot ratio="4 / 3" /></div>
      <p className="caption">Местные магазины • Грозный</p>
      <Ornament />
      <nav className="legal" aria-label="Документы"><Link to="/privacy">Политика конфиденциальности</Link></nav>
    </main>
  );
}
