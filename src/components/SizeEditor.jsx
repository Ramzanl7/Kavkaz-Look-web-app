import { TYPES, gridFor, guessType } from '../lib/fit.js';

// Блок «Размеры и посадка» для продавца: тип вещи, размеры в наличии и (необязательно) замеры готовой вещи.
// value = { type, sizes: ['46', ...], chart: { '46': { chest, waist, hips, length } } }
const COLS = [['chest', 'Грудь'], ['waist', 'Талия'], ['hips', 'Бёдра'], ['length', 'Длина']];

export default function SizeEditor({ value, onChange, title = '', category = '' }) {
  const type = value.type || guessType({ title, category, garmentType: null });
  const set = (patch) => onChange({ ...value, type, ...patch });
  const grid = [...new Set([...gridFor(type, category === 'Мужское' ? 'male' : 'female'), ...(type === 'shoes' ? gridFor(type, 'male') : []), ...value.sizes])].sort((a, b) => a - b);
  const toggle = (s) => set({ sizes: value.sizes.includes(s) ? value.sizes.filter((x) => x !== s) : [...value.sizes, s].sort((a, b) => a - b) });
  const cell = (s, k) => value.chart?.[s]?.[k] ?? '';
  const setCell = (s, k, v) => set({ chart: { ...value.chart, [s]: { ...(value.chart?.[s] || {}), [k]: type === 'shoes' ? v.replace(/[^0-9.,]/g, '').slice(0, 4) : v.replace(/[^0-9]/g, '').slice(0, 3) } } });
  const zones = type === 'shoes' ? [['length', 'Стелька']] : type === 'pants' || type === 'skirt' ? COLS.filter(([k]) => k !== 'chest') : COLS;
  return (
    <fieldset className="size-editor">
      <legend>Размеры и примерка</legend>
      <div className="field">
        <label htmlFor="gt">Тип вещи — от него зависит, как она сядет на манекене</label>
        <select id="gt" value={type} onChange={(e) => set({ type: e.target.value })}>
          {Object.entries(TYPES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
        </select>
      </div>
      {type !== 'none' && (
        <>
          <span className="hint">{type === 'shoes' ? 'Размеры в наличии (европейские, EU).' : 'Размеры в наличии (российская сетка).'} Покупатель сможет примерить каждый на свой 3D-манекен.</span>
          <div className="chips wrapchips">{grid.map((s) => <button key={s} type="button" className={'chip' + (value.sizes.includes(s) ? ' on' : '')} onClick={() => toggle(s)}>{s}</button>)}</div>
          {value.sizes.length > 0 && (
            <details className="chart-details">
              <summary>Точные замеры вещи, см (необязательно, но примерка будет точнее)</summary>
              <span className="hint">{type === 'shoes' ? 'Длина стельки внутри обуви, см (например 25,5).' : 'Обхват по готовой вещи. Длина: платье и верх — от плеча, юбка — от талии, брюки — по внутреннему шву.'}</span>
              <div className="chart-table" style={{ gridTemplateColumns: `48px repeat(${zones.length}, 1fr)` }}>
                <b /> {zones.map(([, l]) => <b key={l}>{l}</b>)}
                {value.sizes.map((s) => [
                  <b key={s}>{s}</b>,
                  ...zones.map(([k]) => <input key={s + k} inputMode={type === 'shoes' ? 'decimal' : 'numeric'} aria-label={`Размер ${s}, ${k}`} value={cell(s, k)} onChange={(e) => setCell(s, k, e.target.value)} />),
                ])}
              </div>
            </details>
          )}
        </>
      )}
    </fieldset>
  );
}
