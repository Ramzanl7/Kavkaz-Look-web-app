import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import EmptyState from '../components/EmptyState.jsx';
import FitQuiz from '../components/FitQuiz.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { useToast } from '../store/toast.jsx';
import { useAction } from '../lib/useAction.js';
import { api } from '../api/index.js';
import { bodyFrom, guessType, garmentFor, evaluate, bestSize, zoneText, garmentColor, gridFor, STATUS, ZONE_LABEL, TYPES, FIT_PREFS } from '../lib/fit.js';

// Манекен с three.js грузится отдельно — только когда покупатель открыл примерку
const Mannequin = lazy(() => import('../components/Mannequin.jsx'));

// Внешность манекена: только на этом устройстве, на сервер не отправляется
const LOOKS = {
  female: { hair: [['scarf', 'Платок'], ['long', 'Волосы собраны'], ['none', 'Без волос']] },
  male: { hair: [['short', 'Короткие'], ['none', 'Без волос']], beard: [['none', 'Без бороды'], ['short', 'Короткая'], ['full', 'Густая']] },
};
const LOOK_KEY = 'kl-tryon-look';
const readLook = () => { try { return JSON.parse(localStorage.getItem(LOOK_KEY)) || {}; } catch { return {}; } };

export default function TryOn() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const [busy, run] = useAction();
  const [p, setP] = useState(() => api.peekProduct(id) ?? undefined);
  const [m, setM] = useState(undefined);
  const [size, setSize] = useState(null);
  const [heat, setHeat] = useState(false);
  const [quiz, setQuiz] = useState(false);
  const [looks, setLooks] = useState(readLook);
  useEffect(() => { api.getProduct(id).then((r) => setP((prev) => r ?? prev ?? null)); }, [id]);
  useEffect(() => { if (user) api.getMeasurements().then(setM); else setM(null); }, [user]);

  const body = useMemo(() => (m ? bodyFrom(m) : null), [m]);
  const type = p ? guessType(p) : null;
  const sizes = useMemo(() => (p?.sizes?.length ? p.sizes : body && type ? gridFor(type, body.gender) : []), [p, body, type]);
  const best = useMemo(() => (p && body && type !== 'none' ? bestSize(p, type, body, sizes) : null), [p, body, type, sizes]);
  const current = size && sizes.includes(size) ? size : best;
  const garment = useMemo(() => (p && body && current && type !== 'none' ? garmentFor(p, type, current, body.gender) : null), [p, body, current, type]);
  const fit = useMemo(() => (garment ? evaluate(body, garment, type) : []), [garment, body, type]);
  const g = body?.gender === 'male' ? 'male' : 'female';
  const look = useMemo(() => {
    const l = looks[g] || {};
    return { hair: l.hair || (g === 'male' ? 'short' : 'scarf'), beard: g === 'male' ? l.beard || 'none' : 'none' };
  }, [looks, g]);
  const setLook = (k, v) => { const next = { ...looks, [g]: { ...look, [k]: v } }; setLooks(next); try { localStorage.setItem(LOOK_KEY, JSON.stringify(next)); } catch { /* приватный режим */ } };
  const hasPref = !!(m?.fit_pref && Object.keys(m.fit_pref).length);
  const savePref = (a) => run(async () => {
    const err = await api.saveFitPref(user.id, a);
    if (err) { toast(err); return; }
    setM({ ...m, fit_pref: a }); setQuiz(false); setSize(null);
  }, 'pref');

  if (p === undefined || m === undefined) return <main className="wrap"><div className="mannequin skeleton" /></main>;
  if (!p) return <main className="wrap"><EmptyState title="Товар не найден" /></main>;
  if (!user) return <main className="wrap"><h1 className="screen-title">Примерка</h1><EmptyState title="Войдите, чтобы примерить" text="Манекен строится по вашим меркам." action={<Link className="btn btn-primary press" to="/login">Войти</Link>} /></main>;
  if (type === 'none') return <main className="wrap"><h1 className="screen-title">Примерка</h1><EmptyState title="Эту вещь примерить нельзя" text="Примерка доступна для одежды и обуви." /></main>;
  const needs = type === 'shoes' ? !body?.shoe : !body?.complete;
  if (!m || needs) return (
    <main className="wrap">
      <h1 className="screen-title">Примерка: {p.title}</h1>
      <EmptyState title={type === 'shoes' ? 'Нужен ваш размер обуви' : 'Нужны ваши мерки'}
        text={type === 'shoes' ? 'Укажите европейский размер обуви — по нему мы узнаем длину стопы и покажем, как сядет пара.' : 'Укажите рост и обхваты груди и бёдер — манекен соберётся по ним, и вы увидите, как сядет вещь.'}
        action={<Link className="btn btn-primary press" to="/measurements" state={{ from: '/tryon/' + id }}>Указать мерки</Link>} />
    </main>
  );
  // опросник — один раз, до первой примерки одежды (можно пропустить)
  const askQuiz = quiz || (!hasPref && type !== 'shoes' && !sessionStorageGet('kl-quiz-skip'));
  if (askQuiz) return (
    <main className="wrap tryon">
      <h1 className="screen-title rise">Примерка</h1>
      <FitQuiz initial={m.fit_pref || {}} busy={busy === 'pref'} onSave={savePref} onSkip={() => { sessionStorageSet('kl-quiz-skip'); setQuiz(false); setM({ ...m }); }} />
    </main>
  );

  const isShoes = type === 'shoes';
  // вердикт по посадке; длина платья/юбки — отдельной строкой ниже, на оценку размера не влияет
  const body3 = isShoes ? fit : fit.filter((z) => z.zone !== 'length');
  const worst = body3.find((z) => z.status === 'tight') ? 'tight' : body3.find((z) => z.status === 'loose') ? 'loose' : isShoes && body3.find((z) => z.status === 'snug') ? 'snug' : body3.find((z) => z.note?.startsWith('плотнее')) ? 'firm' : 'good';
  const prefFit = FIT_PREFS[m.fit_pref?.fit];
  return (
    <main className="wrap tryon">
      <h1 className="screen-title rise">Примерка</h1>
      <p className="lead">{p.title} · {TYPES[type].label.toLowerCase()}</p>
      <div className="mannequin-wrap">
        <Suspense fallback={<div className="mannequin skeleton" />}>
          <Mannequin body={body} look={look} type={type} garment={garment} fit={fit} color={garmentColor(p.title)} heat={heat} />
        </Suspense>
        <button type="button" className={'heat-btn' + (heat ? ' on' : '')} aria-pressed={heat} onClick={() => setHeat(!heat)}>{heat ? 'Показать вещь' : 'Карта посадки'}</button>
        {heat && <div className="heat-legend">{Object.entries(STATUS).filter(([k]) => k !== 'snug').map(([k, s]) => <span key={k}><i style={{ background: s.color }} />{s.label}</span>)}</div>}
      </div>
      <p className="hint center">Поворачивайте манекен пальцем.</p>

      <div className="look-pick">
        <span className="muted">Манекен</span>
        <div className="chips wrapchips">
          {LOOKS[g].hair.map(([v, l]) => <button key={v} type="button" className={'chip' + (look.hair === v ? ' on' : '')} aria-pressed={look.hair === v} onClick={() => setLook('hair', v)}>{l}</button>)}
        </div>
        {LOOKS[g].beard && (
          <div className="chips wrapchips">
            {LOOKS[g].beard.map(([v, l]) => <button key={v} type="button" className={'chip' + (look.beard === v ? ' on' : '')} aria-pressed={look.beard === v} onClick={() => setLook('beard', v)}>{l}</button>)}
          </div>
        )}
      </div>

      <div className="size-pick">
        <span className="muted">Размер{isShoes ? ' (EU)' : ''}{p.sizes?.length ? ' — в наличии' : ''}</span>
        <div className="chips wrapchips">
          {sizes.map((s) => (
            <button key={s} type="button" className={'chip' + (s === current ? ' on' : '')} aria-pressed={s === current} onClick={() => setSize(s)}>
              {s}{s === best ? ' ★' : ''}
            </button>
          ))}
        </div>
      </div>

      <section className={'fit-card ' + (worst === 'snug' || worst === 'firm' ? 'loose' : worst)}>
        <strong>{worst === 'tight' ? `Размер ${current} будет мал` : worst === 'snug' ? `Размер ${current} — впритык` : worst === 'firm' ? `Размер ${current} плотнее, чем вы любите` : worst === 'loose' ? (isShoes ? `Размер ${current} будет велик` : body3.some((z) => z.note) ? `Размер ${current} свободнее, чем вы любите` : `Размер ${current} будет свободным`) : `Размер ${current} сядет хорошо`}</strong>
        {best && best !== current && <button type="button" className="link-u" onClick={() => setSize(best)}>Вам лучше подойдёт {best} — примерить</button>}
        {best === current && <span className="muted">★ Рекомендуем этот размер{isShoes ? ' по длине стопы' : prefFit ? ` — с учётом посадки «${prefFit.label.toLowerCase()}»` : ' по вашим меркам'}</span>}
        <ul className="fit-zones">
          {fit.map((z) => (
            <li key={z.zone}><i style={{ background: STATUS[z.status].color }} /><b>{isShoes ? 'Стопа' : ZONE_LABEL[z.zone]}</b><span>{zoneText(z)}</span></li>
          ))}
        </ul>
      </section>

      {!isShoes && (
        <div className="pref-line">
          <span>{prefFit ? `Вы любите носить: ${prefFit.label.toLowerCase()}` : 'Предпочтения по посадке не указаны'}</span>
          <button type="button" className="link-u" onClick={() => setQuiz(true)}>{hasPref ? 'Изменить' : 'Ответить на 3 вопроса'}</button>
        </div>
      )}
      <p className="hint">
        {garment?.fromChart ? (isShoes ? 'Посадка рассчитана по длине стельки от продавца.' : 'Посадка рассчитана по замерам вещи от продавца.') : isShoes ? 'Продавец не указал длину стельки, поэтому расчёт — по стандартной европейской сетке.' : 'Продавец не указал точные замеры, поэтому посадка рассчитана по стандартной российской размерной сетке.'}{' '}
        Это ориентир: лекала у брендов разные — уточните у продавца.
      </p>
      <Link className="link-u" style={{ justifySelf: 'start' }} to="/measurements" state={{ from: '/tryon/' + id }}>Изменить мои мерки</Link>
    </main>
  );
}

function sessionStorageGet(k) { try { return sessionStorage.getItem(k) === '1'; } catch { return false; } }
function sessionStorageSet(k) { try { sessionStorage.setItem(k, '1'); } catch { /* приватный режим */ } }
