import { useState } from 'react';
import { api } from '../api/index.js';
import { useAction } from '../lib/useAction.js';
export default function BecomeSeller() {
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, run] = useAction();
  const submit = (e) => { e.preventDefault(); return run(async () => {
    const ok = await api.createRoleRequest(name);
    setMsg(ok ? 'Заявка отправлена. Мы свяжемся с вами после проверки.' : 'Не получилось. Возможно, заявка уже отправлена.');
  }); };
  return (
    <main className="wrap">
      <h1 className="screen-title">Заявка на бутик</h1>
      <p className="lead">Укажите название бутика. После проверки администратор откроет вам кабинет продавца.</p>
      <form className="form" onSubmit={submit}>
        <div className="field"><label htmlFor="bn">Название бутика</label><input id="bn" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></div>
        {msg && <p className="msg" role="status">{msg}</p>}
        <button className="btn btn-primary press" type="submit" disabled={busy || name.trim().length < 2}>Отправить заявку</button>
      </form>
    </main>
  );
}
