import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/index.js';
import { useAction } from '../lib/useAction.js';
import { useToast } from '../store/toast.jsx';
import { rub } from '../store/cart.jsx';

const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
const EMPTY = { code: '', title: '', kind: 'percent', value: '10', min_order: '', max_discount: '', starts_at: day(new Date()), ends_at: '', usage_limit: '', per_user: '1', first_order_only: false, is_active: true };
const describe = (p) => (p.kind === 'percent' ? `−${p.value}%${p.max_discount ? ` (до ${rub(p.max_discount)})` : ''}` : `−${rub(p.value)}`) + (p.min_order ? ` от ${rub(p.min_order)}` : '');

// Промокоды: у продавца — свои (скидку даёт бутик), у админа — площадки (скидку возмещает площадка)
export default function PromoManager({ boutiqueId = null }) {
  const [list, setList] = useState(null), [stats, setStats] = useState({}), [ed, setEd] = useState(null), [msg, setMsg] = useState('');
  const [busy, run] = useAction(); const toast = useToast();
  const load = useCallback(async () => {
    const l = await api.listPromos(boutiqueId); setList(l);
    const s = {}; await Promise.all(l.map(async (p) => { s[p.id] = await api.promoStats(p.id); })); setStats(s);
  }, [boutiqueId]);
  useEffect(() => { load(); }, [load]);
  const open = (p) => { setMsg(''); setEd(p ? { ...p, starts_at: day(p.starts_at), ends_at: day(p.ends_at), value: String(p.value), min_order: p.min_order ? String(p.min_order) : '', max_discount: p.max_discount ? String(p.max_discount) : '', usage_limit: p.usage_limit ? String(p.usage_limit) : '', per_user: String(p.per_user) } : EMPTY); };
  const save = () => run(async () => { const err = await api.savePromo(ed, boutiqueId); if (err) { setMsg(err); return; } toast('Промокод сохранён'); setEd(null); load(); });
  const set = (k) => (e) => setEd({ ...ed, [k]: e.target.value });
  const num = (k) => (e) => setEd({ ...ed, [k]: e.target.value.replace(/[^0-9]/g, '') });
  return <>
    <button type="button" className="btn btn-primary press" onClick={() => open(null)}>Новый промокод</button>
    <p className="hint">{boutiqueId ? 'Промокод действует только на товары вашего бутика, скидку даёт ваш бутик.' : 'Промокод площадки действует на все бутики. Скидку площадка возмещает бутикам — сумма видна во вкладке «Обороты».'}</p>
    {list === null ? <p className="lead">Загрузка…</p> : list.length ? list.map((p) => {
      const st = stats[p.id]; const live = p.is_active && (!p.ends_at || new Date(p.ends_at) > new Date());
      return (
        <div key={p.id} className="bcard">
          <strong className="promo-code">{p.code} <span className={'status' + (live ? ' ok' : '')}>{live ? 'Действует' : 'Выключен'}</span></strong>
          <span className="small">{describe(p)}{p.first_order_only ? ' · только первый заказ' : ''}{p.title ? ' · ' + p.title : ''}</span>
          <span className="muted small">Использований: {st?.uses ?? '…'}{p.usage_limit ? ' из ' + p.usage_limit : ''} · скидок выдано: {st ? rub(st.discount) : '…'}{p.ends_at ? ' · до ' + day(p.ends_at) : ''}</span>
          <div className="acts">
            <button type="button" className="act press" onClick={() => open(p)}>Изменить</button>
            <button type="button" className="act press" onClick={async () => { try { await navigator.clipboard.writeText(p.code); toast('Код скопирован'); } catch { toast(p.code); } }}>Копировать</button>
            <button type="button" className="act danger press" disabled={!!busy} onClick={() => run(async () => { if (window.confirm('Удалить промокод ' + p.code + '?') && (await api.deletePromo(p.id))) load(); })}>Удалить</button>
          </div>
        </div>
      );
    }) : <p className="muted">Промокодов пока нет.</p>}
    {ed && (
      <div className="sheet-bg" onClick={() => setEd(null)}>
        <div className="sheet form" role="dialog" aria-modal="true" aria-labelledby="pm-t" onClick={(e) => e.stopPropagation()}>
          <h2 id="pm-t">{ed.id ? 'Промокод ' + ed.code : 'Новый промокод'}</h2>
          {!ed.id && <div className="field"><label htmlFor="pm-c">Код (латиница и цифры)</label><input id="pm-c" maxLength={20} value={ed.code} onChange={(e) => setEd({ ...ed, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} placeholder="BAYRAM10" autoCapitalize="characters" /></div>}
          <div className="field"><label htmlFor="pm-t2">Описание (видит покупатель)</label><input id="pm-t2" maxLength={80} value={ed.title || ''} onChange={set('title')} placeholder="Скидка к празднику" /></div>
          <div className="seg">{[['percent', 'Процент'], ['fixed', 'Сумма, ₽']].map(([v, l]) => <button key={v} type="button" className={'chip' + (ed.kind === v ? ' on' : '')} onClick={() => setEd({ ...ed, kind: v })}>{l}</button>)}</div>
          <div className="pm-row">
            <div className="field"><label htmlFor="pm-v">{ed.kind === 'percent' ? 'Скидка, %' : 'Скидка, ₽'}</label><input id="pm-v" inputMode="numeric" maxLength={6} value={ed.value} onChange={num('value')} /></div>
            {ed.kind === 'percent' && <div className="field"><label htmlFor="pm-mx">Не больше, ₽</label><input id="pm-mx" inputMode="numeric" maxLength={7} value={ed.max_discount} onChange={num('max_discount')} placeholder="без ограничения" /></div>}
          </div>
          <div className="field"><label htmlFor="pm-mo">Минимальная сумма заказа, ₽</label><input id="pm-mo" inputMode="numeric" maxLength={8} value={ed.min_order} onChange={num('min_order')} placeholder="0" /></div>
          <div className="pm-row">
            <div className="field"><label htmlFor="pm-ul">Всего использований</label><input id="pm-ul" inputMode="numeric" maxLength={7} value={ed.usage_limit} onChange={num('usage_limit')} placeholder="без ограничения" /></div>
            <div className="field"><label htmlFor="pm-pu">На одного покупателя</label><input id="pm-pu" inputMode="numeric" maxLength={3} value={ed.per_user} onChange={num('per_user')} /></div>
          </div>
          <div className="pm-row">
            <div className="field"><label htmlFor="pm-s">Начало</label><input id="pm-s" type="date" value={ed.starts_at} onChange={set('starts_at')} /></div>
            <div className="field"><label htmlFor="pm-e">Окончание</label><input id="pm-e" type="date" value={ed.ends_at || ''} onChange={set('ends_at')} /></div>
          </div>
          <label className="check"><input type="checkbox" checked={ed.first_order_only} onChange={(e) => setEd({ ...ed, first_order_only: e.target.checked })} /> Только для первого заказа покупателя</label>
          <label className="check"><input type="checkbox" checked={ed.is_active} onChange={(e) => setEd({ ...ed, is_active: e.target.checked })} /> Действует</label>
          {msg && <p className="msg">{msg}</p>}
          <button type="button" className="btn btn-primary press" disabled={!!busy} onClick={save}>{busy ? 'Сохраняем…' : 'Сохранить'}</button>
        </div>
      </div>
    )}
  </>;
}
