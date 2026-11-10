import { useEffect, useState } from 'react';
import { api } from '../api/index.js';
const FIELDS = [
  ['telegram', 'Telegram (username без @)', 'kavkazlook_support', 'text'],
  ['whatsapp', 'WhatsApp (номер)', '+79281234567', 'tel'],
  ['phone', 'Телефон для звонков', '+79281234567', 'tel'],
  ['sms', 'Номер для SMS', '+79281234567', 'tel'],
  ['email', 'Почта поддержки', 'support@example.ru', 'email'],
  ['hours', 'Время работы', 'Ежедневно 10:00–20:00', 'text'],
];
// Редактор контактов поддержки для админа. Пустое поле — канал скрыт у пользователей.
export default function SupportEditor() {
  const [v, setV] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.getSupportContacts().then((c) => setV(Object.fromEntries(FIELDS.map(([k]) => [k, c[k] ?? ''])))); }, []);
  if (!v) return <p className="muted">Загрузка…</p>;
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setMsg('');
    const err = await api.saveSupportContacts(v);
    setBusy(false); setMsg(err || 'Контакты сохранены');
  };
  return (
    <form className="form bcard" onSubmit={save}>
      <span className="muted">Пустое поле — этот способ связи не показывается пользователям. Все заполненные контакты видны всем.</span>
      {FIELDS.map(([k, label, ph, type]) => (
        <div key={k} className="field">
          <label htmlFor={'sc-' + k}>{label}</label>
          <input id={'sc-' + k} type={type} inputMode={type === 'tel' ? 'tel' : undefined} placeholder={ph} maxLength={k === 'email' ? 254 : 80}
            value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
        </div>
      ))}
      {msg && <p className="msg" role="status">{msg}</p>}
      <button type="submit" className="btn btn-primary press" disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить контакты'}</button>
    </form>
  );
}
