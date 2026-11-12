import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/index.js';
import { useAction } from '../lib/useAction.js';
import { useToast } from '../store/toast.jsx';
import { rub } from '../store/cart.jsx';

const readContact = () => { try { return JSON.parse(localStorage.getItem('kl-contact')) || {}; } catch { return {}; } };
const mapUrl = (b) => 'https://yandex.ru/maps/?text=' + encodeURIComponent([b.city, b.address].filter(Boolean).join(', '));

// «Отложить и примерить в бутике»: бронь до конца сегодняшнего или завтрашнего дня, оплата — в магазине, если подошло
export default function ReserveSheet({ p, boutique, size: initialSize, onClose }) {
  const nav = useNavigate();
  const toast = useToast();
  const [busy, run] = useAction(1500);
  const [size, setSize] = useState(initialSize || null);
  const [day, setDay] = useState('today');
  const [phone, setPhone] = useState(() => readContact().phone || '');
  const [msg, setMsg] = useState('');
  const sizes = p.sizes?.length ? p.sizes.filter((s) => p.stock?.[s] !== 0) : [];
  const phoneOk = /^\+?[0-9]{10,15}$/.test(phone.replace(/[^0-9+]/g, ''));
  const ready = phoneOk && (!p.sizes?.length || size);
  const reserve = () => run(async () => {
    setMsg('');
    const r = await api.placeOrder([{ id: p.id, qty: 1, size }], { phone, delivery: 'reserve', day }, crypto.randomUUID());
    if (r.error) { setMsg(r.error); return; }
    try { localStorage.setItem('kl-contact', JSON.stringify({ ...readContact(), phone })); } catch { /* приватный режим */ }
    toast('Отложено! Ждём вас в бутике'); onClose(); nav('/orders');
  });
  return createPortal(
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="rs-t" onClick={(e) => e.stopPropagation()}>
        <h2 id="rs-t">Отложить и примерить</h2>
        <p className="hint" style={{ margin: 0 }}>Бутик отложит вещь для вас. Приходите, примерьте и оплатите, если подойдёт. Ни к чему не обязывает.</p>
        <div className="bcard reserve-shop">
          <strong>{boutique.name}</strong>
          <span className="muted small">{[boutique.city, boutique.address].filter(Boolean).join(', ')}{boutique.hours ? ' · ' + boutique.hours : ''}</span>
          {boutique.address && <a className="link-u small" href={mapUrl(boutique)} target="_blank" rel="noopener noreferrer">Открыть на карте</a>}
        </div>
        <strong className="small">{p.title} · {rub(p.price)}</strong>
        {p.sizes?.length > 0 && (
          <div className="chips wrapchips" role="radiogroup" aria-label="Размер">
            {sizes.map((s) => <button key={s} type="button" role="radio" aria-checked={size === s} className={'chip' + (size === s ? ' on' : '')} onClick={() => setSize(s)}>{s}</button>)}
          </div>
        )}
        <div className="seg" role="radiogroup" aria-label="До какого дня отложить">
          {[['today', 'Приду сегодня'], ['tomorrow', 'Приду завтра']].map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={day === v} className={'chip' + (day === v ? ' on' : '')} onClick={() => setDay(v)}>{l}</button>
          ))}
        </div>
        <div className="field"><label htmlFor="rs-ph">Телефон — бутик позвонит, если что-то изменится</label>
          <input id="rs-ph" type="tel" inputMode="tel" autoComplete="tel" maxLength={20} placeholder="+7 900 000-00-00" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        <p className="hint" style={{ margin: 0 }}>Бронь держится до конца {day === 'today' ? 'сегодняшнего' : 'завтрашнего'} дня, потом вещь вернётся в продажу.</p>
        {msg && <p className="msg" role="status">{msg}</p>}
        <button type="button" className="btn btn-primary press" disabled={!ready || !!busy} onClick={reserve}>{busy ? 'Откладываем…' : 'Отложить'}</button>
        <button type="button" className="btn btn-secondary press" onClick={onClose}>Отмена</button>
      </div>
    </div>,
    document.body,
  );
}
