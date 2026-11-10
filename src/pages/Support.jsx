import { useEffect, useState } from 'react';
import EmptyState from '../components/EmptyState.jsx';
import { Icon } from '../components/Icons.jsx';
import { api } from '../api/index.js';

// Ссылки собираются только из проверенных значений (см. normalizeContacts и ограничения в базе).
const digits = (p) => p.replace(/[^0-9]/g, '');
export const channels = (c) => [
  c.telegram && { key: 'tg', icon: 'send', label: 'Telegram', value: '@' + c.telegram, href: 'https://t.me/' + c.telegram },
  c.whatsapp && { key: 'wa', icon: 'chat', label: 'WhatsApp', value: c.whatsapp, href: 'https://wa.me/' + digits(c.whatsapp) },
  c.phone && { key: 'tel', icon: 'phone', label: 'Позвонить', value: c.phone, href: 'tel:' + c.phone },
  c.sms && { key: 'sms', icon: 'chat', label: 'SMS', value: c.sms, href: 'sms:' + c.sms },
  c.email && { key: 'mail', icon: 'mail', label: 'Почта', value: c.email, href: 'mailto:' + c.email },
].filter(Boolean);

export default function Support() {
  const [c, setC] = useState(null);
  useEffect(() => { api.getSupportContacts().then(setC); }, []);
  const list = c ? channels(c) : [];
  return (
    <main className="wrap">
      <h1 className="screen-title rise">Поддержка</h1>
      <p className="lead">Вопрос по заказу, бутику или приложению — напишите нам удобным способом.</p>
      {c === null ? <p className="lead">Загрузка…</p> : list.length ? (
        <div className="menu">
          {list.map((x) => (
            <a key={x.key} className="menu-item press" href={x.href} target={x.href.startsWith('https') ? '_blank' : undefined} rel="noopener noreferrer">
              <span className="menu-ic"><Icon name={x.icon} /></span>
              <span className="grow"><strong className="block">{x.label}</strong><small className="muted">{x.value}</small></span>
              <span className="menu-arrow"><Icon name="chevron" /></span>
            </a>
          ))}
        </div>
      ) : <EmptyState title="Контакты скоро появятся" text="Мы готовим каналы связи." />}
      {c?.hours && <p className="notice">Время работы: {c.hours}</p>}
    </main>
  );
}
