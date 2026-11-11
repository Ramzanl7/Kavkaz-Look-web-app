import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import EmptyState from '../components/EmptyState.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api/index.js';
import { bodyFrom, guessType, garmentFor, evaluate, bestSize, zoneText, garmentColor, GRID, STATUS, ZONE_LABEL, TYPES } from '../lib/fit.js';

// Манекен с three.js грузится отдельно — только когда покупатель открыл примерку
const Mannequin = lazy(() => import('../components/Mannequin.jsx'));

export default function TryOn() {
  const { id } = useParams();
  const { user } = useAuth();
  const [p, setP] = useState(() => api.peekProduct(id) ?? undefined);
  const [m, setM] = useState(undefined);
  const [size, setSize] = useState(null);
  const [heat, setHeat] = useState(false);
  useEffect(() => { api.getProduct(id).then((r) => setP((prev) => r ?? prev ?? null)); }, [id]);
  useEffect(() => { if (user) api.getMeasurements().then(setM); else setM(null); }, [user]);

  const body = useMemo(() => (m ? bodyFrom(m) : null), [m]);
  const type = p ? guessType(p) : null;
  const sizes = useMemo(() => (p?.sizes?.length ? p.sizes : body ? GRID[body.gender] : []), [p, body]);
  const best = useMemo(() => (p && body && type !== 'none' ? bestSize(p, type, body, sizes) : null), [p, body, type, sizes]);
  const current = size ?? best;
  const garment = useMemo(() => (p && body && current && type !== 'none' ? garmentFor(p, type, current, body.gender) : null), [p, body, current, type]);
  const fit = useMemo(() => (garment ? evaluate(body, garment, type) : []), [garment, body, type]);

  if (p === undefined || m === undefined) return <main className="wrap"><div className="mannequin skeleton" /></main>;
  if (!p) return <main className="wrap"><EmptyState title="Товар не найден" /></main>;
  if (!user) return <main className="wrap"><h1 className="screen-title">Примерка</h1><EmptyState title="Войдите, чтобы примерить" text="Манекен строится по вашим меркам." action={<Link className="btn btn-primary press" to="/login">Войти</Link>} /></main>;
  if (type === 'none') return <main className="wrap"><h1 className="screen-title">Примерка</h1><EmptyState title="Эту вещь примерить нельзя" text="Примерка доступна для одежды: платья, верх, брюки, юбки, верхняя одежда." /></main>;
  if (!m || !body.complete) return (
    <main className="wrap">
      <h1 className="screen-title">Примерка: {p.title}</h1>
      <EmptyState title="Нужны ваши мерки" text="Укажите рост и обхваты груди и бёдер — манекен соберётся по ним, и вы увидите, как сядет вещь." action={<Link className="btn btn-primary press" to="/measurements" state={{ from: '/tryon/' + id }}>Указать мерки</Link>} />
    </main>
  );

  const worst = fit.find((z) => z.status === 'tight') ? 'tight' : fit.find((z) => z.status === 'loose' && z.zone !== 'length') ? 'loose' : 'good';
  return (
    <main className="wrap tryon">
      <h1 className="screen-title rise">Примерка</h1>
      <p className="lead">{p.title} · {TYPES[type].label.toLowerCase()}</p>
      <div className="mannequin-wrap">
        <Suspense fallback={<div className="mannequin skeleton" />}>
          <Mannequin body={body} type={type} garment={garment} fit={fit} color={garmentColor(p.title)} heat={heat} />
        </Suspense>
        <button type="button" className={'heat-btn' + (heat ? ' on' : '')} aria-pressed={heat} onClick={() => setHeat(!heat)}>{heat ? 'Показать вещь' : 'Карта посадки'}</button>
        {heat && <div className="heat-legend">{Object.entries(STATUS).filter(([k]) => k !== 'snug').map(([k, s]) => <span key={k}><i style={{ background: s.color }} />{s.label}</span>)}</div>}
      </div>
      <p className="hint center">Поворачивайте манекен пальцем.</p>

      <div className="size-pick">
        <span className="muted">Размер{p.sizes?.length ? ' (в наличии)' : ''}</span>
        <div className="chips wrapchips">
          {sizes.map((s) => (
            <button key={s} type="button" className={'chip' + (s === current ? ' on' : '')} onClick={() => setSize(s)}>
              {s}{s === best ? ' ★' : ''}
            </button>
          ))}
        </div>
      </div>

      <section className={'fit-card ' + worst}>
        <strong>{worst === 'tight' ? `Размер ${current} будет мал` : worst === 'loose' ? `Размер ${current} будет свободным` : `Размер ${current} сядет хорошо`}</strong>
        {best && best !== current && <button type="button" className="link-u" onClick={() => setSize(best)}>Вам лучше подойдёт {best} — примерить</button>}
        {best === current && <span className="muted">★ Рекомендуем этот размер по вашим меркам</span>}
        <ul className="fit-zones">
          {fit.map((z) => (
            <li key={z.zone}><i style={{ background: STATUS[z.status].color }} /><b>{ZONE_LABEL[z.zone]}</b><span>{zoneText(z)}</span></li>
          ))}
        </ul>
      </section>

      <p className="hint">
        {garment?.fromChart ? 'Посадка рассчитана по замерам вещи от продавца.' : 'Продавец не указал точные замеры, поэтому посадка рассчитана по стандартной российской размерной сетке.'}{' '}
        Это ориентир: лекала у брендов разные — уточните у продавца.
      </p>
      <Link className="link-u" style={{ justifySelf: 'start' }} to="/measurements" state={{ from: '/tryon/' + id }}>Изменить мои мерки</Link>
    </main>
  );
}
