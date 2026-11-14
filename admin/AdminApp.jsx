import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../src/auth/AuthContext.jsx';
import { supabase } from '../src/lib/supabase.js';
import { api } from '../src/api/index.js';
import { Icon } from '../src/components/Icons.jsx';
import { SITE_URL } from '../src/lib/sites.js';
import Admin, { SECTIONS } from '../src/pages/Admin.jsx';

const AdminSection = lazy(() => import('../src/pages/AdminSection.jsx'));
const Loading = () => <main className="wrap"><p className="lead">Загрузка…</p></main>;

function Login() {
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setMsg('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setMsg(/Invalid login/i.test(error.message) ? 'Неверная почта или пароль.' : 'Не удалось войти. Проверьте интернет.');
  };
  return (
    <main className="adm-login">
      <form className="form adm-login-card" onSubmit={submit}>
        <h1>Kavkaz Look · Админка</h1>
        <p className="muted small">Вход только для администраторов.</p>
        <div className="field"><label htmlFor="ae">Почта</label><input id="ae" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="field"><label htmlFor="ap">Пароль</label><input id="ap" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        {msg && <p className="msg" role="alert">{msg}</p>}
        <button type="submit" className="btn btn-primary press" disabled={busy || !email || !password}>{busy ? 'Входим…' : 'Войти'}</button>
      </form>
    </main>
  );
}

function NoAccess({ onOut }) {
  return (
    <main className="adm-login">
      <div className="adm-login-card">
        <h1>Нет доступа</h1>
        <p className="muted">Этот раздел — только для администраторов Kavkaz Look.</p>
        <button type="button" className="btn btn-secondary press" onClick={onOut}>Выйти</button>
        <a className="link-muted" href={SITE_URL}>Перейти в приложение</a>
      </div>
    </main>
  );
}

// Рабочее место: меню слева (на компьютере), сверху — название раздела, «Открыть сайт», «Выйти»
function Shell() {
  const { signOut } = useAuth();
  const { pathname } = useLocation();
  const nav = useNavigate();
  const [n, setN] = useState({});
  useEffect(() => { api.adminCounters().then(setN); const t = setInterval(() => api.adminCounters().then(setN), 60000); return () => clearInterval(t); }, []);
  const home = pathname === '/admin' || pathname === '/admin/';
  return (
    <div className="adm">
      <aside className="adm-side" aria-label="Разделы">
        <NavLink to="/admin" end className="adm-brand">Kavkaz <b>Look</b><small>админка</small></NavLink>
        {SECTIONS.map(([group, items]) => (
          <div key={group} className="adm-side-group">
            <span>{group}</span>
            {items.map(([key, icon, title, , counter]) => (
              <NavLink key={key} to={'/admin/s/' + key} className={({ isActive }) => 'adm-link' + (isActive ? ' on' : '')}>
                <Icon name={icon} /><span className="grow">{title}</span>{counter && n[counter] > 0 && <i className="pill-count">{n[counter]}</i>}
              </NavLink>
            ))}
          </div>
        ))}
      </aside>
      <div className="adm-main">
        <header className="adm-top">
          {!home && <button type="button" className="adm-back" onClick={() => nav(window.history.state?.idx > 0 ? -1 : '/admin')} aria-label="Назад"><Icon name="back" /></button>}
          <span className="adm-top-title">Kavkaz Look · Админка</span>
          <a className="adm-top-link" href={SITE_URL} target="_blank" rel="noopener noreferrer">Открыть сайт</a>
          <button type="button" className="adm-top-link" onClick={signOut}>Выйти</button>
        </header>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Navigate to="/admin" replace />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/admin/s/:section" element={<AdminSection />} />
            <Route path="/admin/s/:section/:id" element={<AdminSection />} />
            <Route path="/admin/tools/:tab" element={<AdminSection />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </Suspense>
      </div>
    </div>
  );
}

export default function AdminApp() {
  const { user, role, loading, signOut } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Login />;
  if (role !== 'admin') return <NoAccess onOut={signOut} />;
  return <Shell />;
}
