import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { useToast } from '../store/toast.jsx';
import { api } from '../api/index.js';
import { buildLabel } from '../lib/updater.js';

export default function Settings() {
  const { user } = useAuth();
  const toast = useToast();
  const [name, setName] = useState('');
  useEffect(() => { if (user) api.getProfileName(user.id).then(setName); }, [user]);
  const save = async (e) => {
    e.preventDefault();
    toast((await api.setProfileName(user.id, name)) ? 'Имя сохранено' : 'Не удалось сохранить');
  };
  return (
    <main className="wrap">
      <h1 className="screen-title rise">Настройки</h1>
      <form className="form" onSubmit={save}>
        <div className="field">
          <label htmlFor="nm">Имя (видно в отзывах)</label>
          <input id="nm" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" />
        </div>
        <button type="submit" className="btn btn-primary press">Сохранить</button>
      </form>
      <div className="bcard"><strong>Почта для входа</strong><span className="muted">{user?.email}</span></div>
      <p className="muted">Версия приложения: {buildLabel()}</p>
    </main>
  );
}
