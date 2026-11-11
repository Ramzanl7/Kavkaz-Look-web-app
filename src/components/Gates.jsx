import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { CONSENT_VERSION } from '../lib/consent.js';
import { api } from '../api/index.js';
import { useAction } from '../lib/useAction.js';

// Пока нет согласия по текущей версии документа — аккаунтом пользоваться нельзя.
export function ConsentGate() {
  const { refresh, signOut } = useAuth();
  const [agree, setAgree] = useState(false);
  const [busy, run] = useAction();
  const [msg, setMsg] = useState('');
  const accept = () => run(async () => {
    setMsg('');
    if (await api.giveConsent(CONSENT_VERSION)) await refresh();
    else setMsg('Не удалось сохранить. Попробуйте ещё раз.');
  });
  return (
    <main className="wrap gate">
      <h1 className="screen-title rise">Согласие на обработку данных</h1>
      <p className="lead">Чтобы пользоваться аккаунтом, нужно согласие на обработку персональных данных: почта, имя, заказы, избранное, отзывы, дни, когда вы заходили в приложение, и мерки, если вы их укажете.</p>
      <Link className="link-u" to="/privacy">Прочитать политику конфиденциальности</Link>
      <label className="check">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span>Я прочитал(а) политику и согласен(на) на обработку моих персональных данных</span>
      </label>
      {msg && <p className="msg" role="status">{msg}</p>}
      <button type="button" className="btn btn-primary press" disabled={!agree || busy} onClick={accept}>{busy ? 'Сохраняем…' : 'Согласен'}</button>
      <button type="button" className="btn btn-secondary press" onClick={signOut}>Не согласен — выйти</button>
    </main>
  );
}

export function BlockedScreen({ reason }) {
  const { signOut } = useAuth();
  return (
    <main className="wrap gate">
      <h1 className="screen-title rise">Аккаунт заблокирован</h1>
      {reason ? <p className="notice">Причина: {reason}</p> : <p className="lead">Причина не указана.</p>}
      <p className="lead">Если вы считаете, что это ошибка, напишите в поддержку.</p>
      <Link className="btn btn-primary press" to="/support">Связаться с поддержкой</Link>
      <button type="button" className="btn btn-secondary press" onClick={signOut}>Выйти</button>
    </main>
  );
}
