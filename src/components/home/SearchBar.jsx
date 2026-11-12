import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../Icons.jsx';
import { api } from '../../api/index.js';
import { searches } from '../../lib/local.js';
import { GRID } from '../../lib/fit.js';

// Поиск: по товарам, бутикам и брендам; история запросов (на устройстве) и подсказки при вводе; кнопка фильтров.
export default function SearchBar({ value, onChange, filters, onFilters, onBrand }) {
  const nav = useNavigate();
  const [focus, setFocus] = useState(false);
  const [hints, setHints] = useState([]);
  const [hist, setHist] = useState(searches.list);
  const [sheet, setSheet] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (value.trim().length < 2) { setHints([]); return undefined; }
    let on = true;
    const t = setTimeout(() => api.suggest(value).then((r) => on && setHints(r)), 250);
    return () => { on = false; clearTimeout(t); };
  }, [value]);
  useEffect(() => {
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setFocus(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  const commit = (q) => { searches.add(q); setHist(searches.list()); setFocus(false); };
  const pick = (h) => {
    commit(value || h.label);
    if (h.kind === 'product') nav('/product/' + h.id);
    else if (h.kind === 'boutique') nav('/boutiques/' + h.id);
    else onBrand?.(h.id);
  };
  const active = (filters.minPrice ? 1 : 0) + (filters.maxPrice ? 1 : 0) + (filters.size ? 1 : 0) + (filters.sort !== 'new' ? 1 : 0);
  const showHist = focus && !value && hist.length > 0;
  const showHints = focus && value.trim().length >= 2 && hints.length > 0;
  return (
    <div className="search-wrap" ref={box}>
      <form className="search-box" role="search" onSubmit={(e) => { e.preventDefault(); commit(value); e.currentTarget.querySelector('input')?.blur(); }}>
        <Icon name="search" />
        <input type="search" aria-label="Поиск" placeholder="Найти одежду, бутик или бренд" value={value} maxLength={80}
          onFocus={() => setFocus(true)} onChange={(e) => onChange(e.target.value)} enterKeyHint="search" autoComplete="off" />
        {value && <button type="button" className="search-clear" aria-label="Очистить" onClick={() => onChange('')}><Icon name="close" /></button>}
        <button type="button" className={'search-filter' + (active ? ' on' : '')} aria-label={'Фильтры' + (active ? `, выбрано: ${active}` : '')} onClick={() => setSheet(true)}>
          <Icon name="sliders" />{active > 0 && <i>{active}</i>}
        </button>
      </form>
      {(showHist || showHints) && (
        <div className="search-drop" role="listbox">
          {showHist && <>
            <div className="drop-head"><span>Вы искали</span><button type="button" className="link-muted" onClick={() => { searches.clear(); setHist([]); }}>Очистить</button></div>
            {hist.map((h) => <button key={h} type="button" role="option" className="drop-item" onClick={() => { onChange(h); commit(h); }}><Icon name="clock" />{h}</button>)}
          </>}
          {showHints && hints.map((h) => (
            <button key={h.kind + h.id} type="button" role="option" className="drop-item" onClick={() => pick(h)}>
              <Icon name={h.kind === 'product' ? 'search' : 'store'} /><span className="grow">{h.label}</span>
              <small className="muted">{h.kind === 'product' ? 'товар' : h.kind === 'boutique' ? 'бутик' : 'бренд'}</small>
            </button>
          ))}
        </div>
      )}
      {sheet && <FilterSheet filters={filters} onApply={(f) => { onFilters(f); setSheet(false); }} onClose={() => setSheet(false)} />}
    </div>
  );
}

const SORTS = [['new', 'Новинки'], ['price_asc', 'Сначала дешёвые'], ['price_desc', 'Сначала дорогие'], ['rating', 'По рейтингу']];
const SIZE_LIST = [...new Set([...GRID.female, ...GRID.male])].sort((a, b) => a - b);

function FilterSheet({ filters, onApply, onClose }) {
  const [f, setF] = useState(filters);
  const num = (v) => v.replace(/[^0-9]/g, '').slice(0, 7);
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="flt-t" onClick={(e) => e.stopPropagation()}>
        <h2 id="flt-t">Фильтры</h2>
        <span className="muted">Цена, ₽</span>
        <div className="price-range">
          <div className="field"><input inputMode="numeric" aria-label="Цена от" placeholder="от" value={f.minPrice} onChange={(e) => setF({ ...f, minPrice: num(e.target.value) })} /></div>
          <div className="field"><input inputMode="numeric" aria-label="Цена до" placeholder="до" value={f.maxPrice} onChange={(e) => setF({ ...f, maxPrice: num(e.target.value) })} /></div>
        </div>
        <span className="muted">Размер (российский)</span>
        <div className="chips wrapchips">
          {SIZE_LIST.map((s) => <button key={s} type="button" className={'chip' + (f.size === s ? ' on' : '')} aria-pressed={f.size === s} onClick={() => setF({ ...f, size: f.size === s ? '' : s })}>{s}</button>)}
        </div>
        <span className="muted">Сортировка</span>
        <div className="chips wrapchips">
          {SORTS.map(([v, l]) => <button key={v} type="button" className={'chip' + (f.sort === v ? ' on' : '')} aria-pressed={f.sort === v} onClick={() => setF({ ...f, sort: v })}>{l}</button>)}
        </div>
        <div className="sheet-actions">
          <button type="button" className="btn btn-secondary press grow" onClick={() => setF({ minPrice: '', maxPrice: '', size: '', sort: 'new' })}>Сбросить</button>
          <button type="button" className="btn btn-primary press grow" onClick={() => onApply(f)}>Показать</button>
        </div>
      </div>
    </div>
  );
}
