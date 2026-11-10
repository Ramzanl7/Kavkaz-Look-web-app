import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../auth/AuthContext.jsx';
export default function Login() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (user) nav('/profile', { replace: true }); }, [user, nav]);
  const run = async (mode) => {
    setMsg('');
    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 120 || password.length < 8 || password.length > 72) { setMsg('Введите почту и пароль не короче 8 символов.'); return; }
    setBusy(true);
    const { error } = mode === 'in' ? await supabase.auth.signInWithPassword({ email, password }) : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) setMsg('Не получилось. Проверьте данные и попробуйте ещё раз.');
    else if (mode === 'up') setMsg('Готово. Если пришло письмо, подтвердите адрес и войдите.');
  };
  return (
    <main className="wrap">
      <h1 className="screen-title">Вход</h1>
      <p className="notice">Тестовый режим. Настоящие данные пока не вводите. Вход по звонку-сбросу появится позже.</p>
      <form className="form" onSubmit={(e) => { e.preventDefault(); run('in'); }}>
        <div className="field"><label htmlFor="em">Почта</label><input id="em" type="email" autoComplete="email" maxLength={120} value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="field"><label htmlFor="pw">Пароль</label><input id="pw" type="password" autoComplete="current-password" maxLength={72} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        {msg && <p className="msg" role="status">{msg}</p>}
        <button className="btn btn-primary press" type="submit" disabled={busy}>Войти</button>
        <button className="btn btn-secondary press" type="button" disabled={busy} onClick={() => run('up')}>Создать аккаунт</button>
      </form>
    </main>
  );
}
