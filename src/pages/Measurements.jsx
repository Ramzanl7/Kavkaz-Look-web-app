import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { useToast } from '../store/toast.jsx';
import { useAction } from '../lib/useAction.js';
import { FIELDS, suggestSize } from '../lib/sizes.js';
import { api } from '../api/index.js';
import FitQuiz from '../components/FitQuiz.jsx';

const EMPTY = { gender: '', height_cm: '', weight_kg: '', chest_cm: '', waist_cm: '', hips_cm: '', shoulder_cm: '', inseam_cm: '', shoe_eu: '' };

export default function Measurements() {
  const { user } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  // пришли с примерки — после сохранения вернём туда
  const from = useLocation().state?.from;
  const back = typeof from === 'string' && from.startsWith('/tryon/') ? from : null;
  const [m, setM] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, run] = useAction();
  const [pref, setPref] = useState(undefined);
  useEffect(() => {
    api.getMeasurements().then((r) => (setPref(r?.fit_pref || {}), setM(r ? Object.fromEntries(Object.keys(EMPTY).map((k) => [k, r[k] == null ? '' : String(r[k]).replace('.', ',')])) : EMPTY)));
  }, []);
  if (!m) return <main className="wrap"><h1 className="screen-title">Мои мерки</h1><div className="skeleton" style={{ height: 320, borderRadius: 16 }} /></main>;

  const set = (k) => (e) => setM({ ...m, [k]: e.target.value });
  const num = (v) => (v === '' ? null : Number(String(v).replace(',', '.')));
  const preview = suggestSize({ gender: m.gender, chest_cm: num(m.chest_cm), hips_cm: num(m.hips_cm), shoe_eu: num(m.shoe_eu) }, 'Женское');
  const shoe = num(m.shoe_eu);
  const save = (e) => { e.preventDefault(); return run(async () => {
    setMsg('');
    const err = await api.saveMeasurements(user.id, { ...m, shoe_eu: m.shoe_eu });
    if (err) setMsg(err); else { toast('Мерки сохранены'); if (back) nav(back, { replace: true }); }
  }, 'save'); };
  const savePref = (a) => run(async () => {
    const err = await api.saveFitPref(user.id, a);
    if (err) toast(err); else { setPref(a); toast('Ответы сохранены'); }
  }, 'pref');
  const clear = () => run(async () => {
    if (!window.confirm('Удалить все мерки?')) return;
    if (await api.clearMeasurements(user.id)) { setM(EMPTY); setPref({}); toast('Мерки удалены'); }
  }, 'clear');

  return (
    <main className="wrap">
      <h1 className="screen-title rise">Мои мерки</h1>
      <p className="lead">По меркам мы подскажем ваш размер на странице товара. Заполните только то, что хотите, — все поля необязательны.</p>
      <form className="form" onSubmit={save}>
        <div className="seg" role="radiogroup" aria-label="Сетка размеров">
          {[['female', 'Женщина'], ['male', 'Мужчина']].map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={m.gender === v} className={'chip' + (m.gender === v ? ' on' : '')} onClick={() => setM({ ...m, gender: v })}>{l}</button>
          ))}
        </div>
        {FIELDS.map(([k, label, unit, min, max, hint]) => (
          <div key={k} className="field">
            <label htmlFor={'m-' + k}>{label}, {unit}</label>
            <input id={'m-' + k} inputMode="decimal" maxLength={5} placeholder={`${min}–${max}`} value={m[k]} onChange={set(k)} />
            <small className="hint">{hint}</small>
          </div>
        ))}
        {(preview || shoe) && (
          <div className="size-card">
            <span className="muted">Ориентировочно ваш размер</span>
            <strong>{preview ? 'Одежда: ' + preview.size : ''}{preview && shoe ? ' · ' : ''}{shoe ? 'Обувь: ' + String(shoe).replace('.', ',') : ''}</strong>
          </div>
        )}
        {msg && <p className="msg" role="status">{msg}</p>}
        <button type="submit" className="btn btn-primary press" disabled={!!busy}>{busy === 'save' ? 'Сохраняем…' : back ? 'Сохранить и примерить' : 'Сохранить мерки'}</button>
        <button type="button" className="link-muted" disabled={!!busy} onClick={clear}>Удалить мои мерки</button>
      </form>
      <h2 className="quiz-head">Как вы любите носить</h2>
      <FitQuiz key={JSON.stringify(pref) + m.gender} initial={pref} gender={m.gender} compact busy={busy === 'pref'} onSave={savePref} />
      <p className="notice">Мерки видите только вы. Продавцы их не видят. Они удаляются вместе с аккаунтом или кнопкой выше.</p>
    </main>
  );
}
