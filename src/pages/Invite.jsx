import { useEffect, useState } from 'react';
import { api } from '../api/index.js';
import { useToast } from '../store/toast.jsx';

// Пригласить друзей: личная ссылка и счётчик. Наград пока нет — по активным пригласившим разыгрываем призы.
export default function Invite() {
  const [code, setCode] = useState(undefined), [st, setSt] = useState(null);
  const toast = useToast();
  useEffect(() => { api.myReferralCode().then(setCode); api.myReferrals().then(setSt); }, []);
  const link = code ? location.origin + '/?ref=' + code : '';
  const text = 'Смотри, Kavkaz Look — одежда из бутиков Грозного в одном приложении: ';
  const share = async () => {
    if (navigator.share) { try { await navigator.share({ title: 'Kavkaz Look', text, url: link }); return; } catch { /* отменили */ } }
    try { await navigator.clipboard.writeText(link); toast('Ссылка скопирована'); } catch { toast(link); }
  };
  return (
    <main className="wrap">
      <h1 className="screen-title rise">Пригласить друзей</h1>
      <p className="lead">Отправьте друзьям свою ссылку. Друг, который зарегистрируется по ней и сделает покупку, засчитается вам.</p>
      {code === undefined ? <p className="lead">Загрузка…</p> : code ? <>
        <div className="bcard invite-card">
          <span className="muted small">Ваш код</span>
          <b className="invite-code">{code}</b>
          <span className="small invite-link">{link}</span>
          <button type="button" className="btn btn-primary press" onClick={share}>Поделиться ссылкой</button>
          <a className="btn btn-secondary press" href={'https://wa.me/?text=' + encodeURIComponent(text + link)} target="_blank" rel="noopener noreferrer">Отправить в WhatsApp</a>
        </div>
        <div className="stat-grid">
          <div className="stat"><b>{st?.invited ?? 0}</b><span>зарегистрировались</span></div>
          <div className="stat"><b>{st?.qualified ?? 0}</b><span>сделали покупку</span></div>
        </div>
        <p className="hint">Время от времени мы разыгрываем призы среди тех, кто привёл друзей с покупкой. Следите за уведомлениями.</p>
      </> : <p className="msg">Не удалось получить ссылку. Попробуйте позже.</p>}
    </main>
  );
}
