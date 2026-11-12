import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { api } from '../api/index.js';
import { useAction } from '../lib/useAction.js';
import { useToast } from '../store/toast.jsx';

// Новый пароль по ссылке из письма: ссылка временно входит в аккаунт, здесь задаётся новый пароль
export default function ResetPassword() {
  const nav = useNavigate();
  const toast = useToast();
  const [ok, setOk] = useState(null);
  const [pw, setPw] = useState(''), [pw2, setPw2] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, run] = useAction();
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((ev, session) => { if (ev === 'PASSWORD_RECOVERY' || session) setOk(true); });
    supabase.auth.getSession().then(({ data: d }) => setOk((v) => v || !!d.session));
    const t = setTimeout(() => setOk((v) => v ?? false), 2500);
    return () => { data.subscription.unsubscribe(); clearTimeout(t); };
  }, []);
  const save = (e) => { e.preventDefault(); return run(async () => {
    setMsg('');
    if (pw !== pw2) { setMsg('Пароли не совпадают.'); return; }
    const err = await api.updatePassword(pw);
    if (err) { setMsg(err); return; }
    toast('Пароль изменён'); nav('/profile', { replace: true });
  }); };
  return (
    <main className="wrap">
      <h1 className="screen-title">Новый пароль</h1>
      {ok === null ? <p className="lead">Проверяем ссылку…</p> : ok ? (
        <form className="form" onSubmit={save}>
          <div className="field"><label htmlFor="np">Новый пароль</label><input id="np" type="password" autoComplete="new-password" minLength={8} maxLength={72} value={pw} onChange={(e) => setPw(e.target.value)} /></div>
          <div className="field"><label htmlFor="np2">Повторите пароль</label><input id="np2" type="password" autoComplete="new-password" minLength={8} maxLength={72} value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
          <span className="hint">Не короче 8 символов.</span>
          {msg && <p className="msg" role="status">{msg}</p>}
          <button className="btn btn-primary press" type="submit" disabled={!!busy || pw.length < 8}>{busy ? 'Сохраняем…' : 'Сохранить пароль'}</button>
        </form>
      ) : (
        <>
          <p className="lead">Ссылка устарела или уже использована.</p>
          <Link className="btn btn-primary press" to="/login">Запросить новую ссылку</Link>
        </>
      )}
    </main>
  );
}
