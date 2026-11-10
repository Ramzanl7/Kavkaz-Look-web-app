import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import VisitsChart, { SERIES } from '../components/VisitsChart.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { useToast } from '../store/toast.jsx';
import { api } from '../api/index.js';

const ROLES = { buyer: 'Покупатель', seller: 'Продавец', admin: 'Админ' };
const PERIODS = [[7, '7 дней'], [30, '30 дней'], [90, '90 дней']];
const FILTERS = [['all', 'Все'], ['online', 'В сети'], ['blocked', 'Заблокированы']];
const ONLINE_MS = 5 * 60 * 1000;

const ago = (iso) => {
  if (!iso) return 'ни разу';
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 5) return 'в сети';
  if (m < 60) return m + ' мин назад';
  if (m < 24 * 60) return Math.round(m / 60) + ' ч назад';
  const d = Math.round(m / 1440);
  return d === 1 ? 'вчера' : d < 30 ? d + ' дн назад' : new Date(iso).toLocaleDateString('ru-RU');
};
const date = (iso) => (iso ? new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const isOnline = (u) => u.last_seen_at && Date.now() - new Date(u.last_seen_at) < ONLINE_MS;

function Tile({ label, value, hint }) {
  return <div className="kpi"><span className="kpi-l">{label}</span><strong className="kpi-v">{value ?? '—'}</strong>{hint && <span className="kpi-h">{hint}</span>}</div>;
}

// Полоса последних 30 дней: закрашен день, в который человек заходил.
function DaysStrip({ days }) {
  const set = new Set(days);
  const list = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.now() - (29 - i) * 864e5).toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' });
    return [d, set.has(d)];
  });
  return (
    <div className="strip" aria-label={`Заходил ${list.filter((x) => x[1]).length} из 30 дней`}>
      {list.map(([d, on]) => <i key={d} className={on ? 'on' : ''} title={new Date(d + 'T00:00:00').toLocaleDateString('ru-RU') + (on ? ' — заходил' : '')} />)}
    </div>
  );
}

function UserRow({ u, me, onBan, open, onToggle }) {
  const [days, setDays] = useState(null);
  useEffect(() => { if (open && days === null) api.adminUserDays(u.id).then(setDays); }, [open, days, u.id]);
  const online = isOnline(u);
  return (
    <div className={'urow' + (open ? ' open' : '')}>
      <button type="button" className="urow-main" onClick={onToggle} aria-expanded={open}>
        <span className={'dot' + (online ? ' on' : '')} aria-hidden="true" />
        <span className="urow-who">
          <strong>{u.display_name || u.email.split('@')[0]}</strong>
          <small>{u.email}</small>
        </span>
        <span className="urow-meta">
          <span className={online ? 'seen on' : 'seen'}>{ago(u.last_seen_at)}</span>
          <small>{u.days_30} дн. из 30</small>
        </span>
      </button>
      <div className="urow-tags">
        <span className="status">{ROLES[u.role] || u.role}</span>
        {u.is_blocked && <span className="status bad">Заблокирован</span>}
        {!u.consent_at && <span className="status">Нет согласия</span>}
      </div>
      {open && (
        <div className="urow-more">
          <dl>
            <dt>Регистрация</dt><dd>{date(u.created_at)}</dd>
            <dt>Последний визит</dt><dd>{date(u.last_seen_at)}</dd>
            <dt>Согласие на ПДн</dt><dd>{u.consent_at ? date(u.consent_at) : 'не дано'}</dd>
            {u.is_blocked && <><dt>Заблокирован</dt><dd>{date(u.blocked_at)}{u.blocked_reason ? ' · ' + u.blocked_reason : ''}</dd></>}
          </dl>
          <span className="muted">Дни посещений за последние 30 дней</span>
          {days === null ? <p className="muted">Загрузка…</p> : <DaysStrip days={days} />}
          {u.id !== me && u.role !== 'admin' && (
            <div className="acts">
              {u.is_blocked
                ? <button type="button" className="act ok press" onClick={() => onBan(u, false)}>Разблокировать</button>
                : <button type="button" className="act danger press" onClick={() => onBan(u, true)}>Заблокировать</button>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminStats() {
  const { user } = useAuth();
  const toast = useToast();
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState(undefined);
  const [users, setUsers] = useState(undefined);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [openId, setOpenId] = useState(null);
  const [showTable, setShowTable] = useState(false);
  const [ban, setBan] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const loadStats = useCallback(() => api.adminStats(days).then(setStats), [days]);
  const loadUsers = useCallback(() => api.adminListUsers({ search, limit: 100 }).then(setUsers), [search]);
  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { const t = setTimeout(loadUsers, 300); return () => clearTimeout(t); }, [loadUsers]);

  const confirmBan = async () => {
    setBusy(true);
    const err = await api.adminSetBlocked(ban.u.id, ban.block, reason);
    setBusy(false);
    if (err) { toast(err); return; }
    toast(ban.block ? 'Пользователь заблокирован' : 'Пользователь разблокирован');
    setBan(null); setReason(''); loadUsers(); loadStats();
  };

  const shown = (users || []).filter((u) => (filter === 'online' ? isOnline(u) : filter === 'blocked' ? u.is_blocked : true));
  const s = stats;
  const sum = (k) => (s?.series || []).reduce((a, d) => a + d[k], 0);

  return (
    <main className="wrap">
      <h1 className="screen-title rise">Статистика</h1>
      {s === null && <p className="notice">Не удалось загрузить статистику. Проверьте, что вы вошли как администратор.</p>}

      <div className="kpis rise" style={{ '--d': 1 }}>
        <Tile label="Пользователей" value={s?.total_users} hint={s ? `+${s.new_7d} за 7 дней` : ''} />
        <Tile label="Сейчас в сети" value={s?.online_now} hint="за последние 5 минут" />
        <Tile label="Заходили сегодня" value={s?.active_today} hint={s ? `и ${s.guests_today} гостей` : ''} />
        <Tile label="Активны за 7 дней" value={s?.active_7d} hint={s && s.total_users ? `${Math.round((s.active_7d / s.total_users) * 100)}% от всех` : ''} />
        <Tile label="Активны за 30 дней" value={s?.active_30d} />
        <Tile label="Заблокированы" value={s?.blocked} hint={s?.no_consent ? `${s.no_consent} без согласия` : ''} />
      </div>

      <section className="panel rise" style={{ '--d': 2 }}>
        <div className="panel-head">
          <h2>Посещения по дням</h2>
          <div className="chips">{PERIODS.map(([v, l]) => <button key={v} type="button" className={'chip' + (days === v ? ' on' : '')} onClick={() => setDays(v)}>{l}</button>)}</div>
        </div>
        {s?.series ? (
          <>
            <p className="muted">За период: {sum('users')} визитов пользователей, {sum('guests')} гостей, {sum('signups')} регистраций. Нажмите на столбец — покажу день.</p>
            <VisitsChart series={s.series} />
            <button type="button" className="link-muted" onClick={() => setShowTable(!showTable)}>{showTable ? 'Скрыть таблицу' : 'Показать таблицей'}</button>
            {showTable && (
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr><th>День</th>{SERIES.map((x) => <th key={x.key}>{x.label}</th>)}<th>Регистрации</th></tr></thead>
                  <tbody>{[...s.series].reverse().map((d) => (
                    <tr key={d.day}><td>{new Date(d.day + 'T00:00:00').toLocaleDateString('ru-RU')}</td><td>{d.users}</td><td>{d.guests}</td><td>{d.signups}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </>
        ) : s === undefined ? <div className="skeleton" style={{ height: 220, borderRadius: 16 }} /> : null}
      </section>

      <section className="panel rise" style={{ '--d': 3 }}>
        <div className="panel-head"><h2>Пользователи</h2>{users && <span className="muted">{shown.length} из {users[0]?.total ?? 0}</span>}</div>
        <input className="search" type="search" placeholder="Поиск по почте или имени" maxLength={80} value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="chips">{FILTERS.map(([v, l]) => <button key={v} type="button" className={'chip' + (filter === v ? ' on' : '')} onClick={() => setFilter(v)}>{l}</button>)}</div>
        {users === undefined ? <p className="muted">Загрузка…</p> : users === null ? <p className="notice">Не удалось загрузить пользователей.</p> : shown.length ? (
          <div className="ulist">{shown.map((u) => (
            <UserRow key={u.id} u={u} me={user?.id} open={openId === u.id} onToggle={() => setOpenId(openId === u.id ? null : u.id)} onBan={(x, block) => { setBan({ u: x, block }); setReason(''); }} />
          ))}</div>
        ) : <p className="muted">Никого не нашлось.</p>}
      </section>

      {ban && createPortal(
        <div className="sheet-bg" role="presentation" onClick={() => !busy && setBan(null)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="ban-t" onClick={(e) => e.stopPropagation()}>
            <h2 id="ban-t">{ban.block ? 'Заблокировать' : 'Разблокировать'} пользователя «{ban.u.display_name || ban.u.email}»?</h2>
            {ban.block ? (
              <>
                <p className="lead">Человек сразу выйдет на всех устройствах и не сможет войти. Причину он увидит на экране блокировки.</p>
                <div className="field"><label htmlFor="rs">Причина (видна пользователю)</label><input id="rs" maxLength={200} placeholder="Например: оскорбления в отзывах" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
              </>
            ) : <p className="lead">Пользователь снова сможет входить и пользоваться приложением.</p>}
            <button type="button" className={'btn press ' + (ban.block ? 'btn-danger' : 'btn-primary')} disabled={busy} onClick={confirmBan}>{busy ? 'Подождите…' : ban.block ? 'Заблокировать' : 'Разблокировать'}</button>
            <button type="button" className="btn btn-secondary press" disabled={busy} onClick={() => setBan(null)}>Отмена</button>
          </div>
        </div>,
        document.body,
      )}
    </main>
  );
}
