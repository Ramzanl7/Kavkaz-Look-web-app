import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { CONSENT_VERSION } from '../lib/consent.js';
import { useAction } from '../lib/useAction.js';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../auth/AuthContext.jsx';
export default function Login() {
  const nav = useNavigate();
  // Куда вернуть после входа: на экран, с которого отправили на вход (например, «Избранное»).
  const from = useLocation().state?.from;
  const back = typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') ? from : '/profile';
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, run] = useAction(1000);
  const [agree, setAgree] = useState(false);
  useEffect(() => { if (user) nav(back, { replace: true }); }, [user, nav, back]);
  const go = (mode) => run(async () => {
    setMsg('');
    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 120 || password.length < 8 || password.length > 72) { setMsg('Введите почту и пароль не короче 8 символов.'); return; }
    if (mode === 'up' && !agree) { setMsg('Чтобы создать аккаунт, отметьте согласие на обработку персональных данных.'); return; }
    const { error } = mode === 'in'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { data: { consent_version: CONSENT_VERSION } } });
    if (error?.code === 'user_banned' || /banned/i.test(error?.message || '')) setMsg('Аккаунт заблокирован. Чтобы узнать причину или оспорить блокировку, напишите в поддержку.');
    else if (error) setMsg('Не получилось. Проверьте данные и попробуйте ещё раз.');
    else if (mode === 'up') setMsg('Готово. Если пришло письмо, подтвердите адрес и войдите.');
  });
  return (
    <main className="wrap">
      <h1 className="screen-title">Вход</h1>
      <p className="notice">Тестовый режим. Настоящие данные пока не вводите. Вход по звонку-сбросу появится позже.</p>
      <form className="form" onSubmit={(e) => { e.preventDefault(); go('in'); }}>
        <div className="field"><label htmlFor="em">Почта</label><input id="em" type="email" autoComplete="email" maxLength={120} value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="field"><label htmlFor="pw">Пароль</label><input id="pw" type="password" autoComplete="current-password" maxLength={72} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <label className="check">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>Для нового аккаунта: я согласен на обработку персональных данных по <Link className="link-u" to="/privacy">политике конфиденциальности</Link></span>
        </label>
        {msg && <p className="msg" role="status">{msg}{/заблокирован/.test(msg) && <> <Link className="link-u" to="/support">Поддержка</Link></>}</p>}
        <button className="btn btn-primary press" type="submit" disabled={busy}>Войти</button>
        <button className="btn btn-secondary press" type="button" disabled={busy || !agree} onClick={() => go('up')}>Создать аккаунт</button>
      </form>
    </main>
  );
}
