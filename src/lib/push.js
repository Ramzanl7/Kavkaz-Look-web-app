import { supabase } from './supabase.js';

// Push-уведомления на телефон (Web Push).
// На iPhone работают только в приложении, добавленном на главный экран (iOS 16.4+).
const FN = import.meta.env.VITE_SUPABASE_URL + '/functions/v1/push';
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

export function pushSupport() {
  if (isIOS() && !standalone()) return 'ios-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return 'ok';
}

const b64ToBytes = (s) => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
const register = () => navigator.serviceWorker.register('/sw.js', { scope: '/' });

export async function pushEnabled() {
  if (pushSupport() !== 'ok' || Notification.permission !== 'granted') return false;
  const reg = await navigator.serviceWorker.getRegistration('/');
  return !!(await reg?.pushManager.getSubscription());
}

const WANT = 'kl-push'; // на этом устройстве пользователь включал уведомления
const want = (v) => { try { if (v) localStorage.setItem(WANT, '1'); else localStorage.removeItem(WANT); } catch { /* приватный режим */ } };
const wanted = () => { try { return localStorage.getItem(WANT) === '1'; } catch { return false; } };

// Привязать подписку устройства к аккаунту. Если адрес подписки остался за другим аккаунтом
// (например, выход был без интернета) — выпускаем устройству новую подписку.
async function attach(reg, userId, publicKey) {
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
  for (let i = 0; i < 2; i++) {
    const j = sub.toJSON();
    // уже привязана к этому аккаунту — ничего не делаем
    const { data: mine } = await supabase.from('push_subscriptions').select('endpoint').eq('endpoint', j.endpoint).maybeSingle();
    if (mine) return 'ok';
    const { error } = await supabase.from('push_subscriptions').insert({ user_id: userId, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth });
    if (!error) return 'ok';
    if (error.code !== '23505') return 'error';
    // адрес занят другим аккаунтом — выпускаем устройству новую подписку
    await sub.unsubscribe();
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
  }
  return 'error';
}

// Включить: спросить разрешение (только по нажатию), подписать устройство, сохранить подписку.
export async function enablePush(userId) {
  const s = pushSupport();
  if (s !== 'ok') return s;
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return 'denied';
  const reg = await register();
  await navigator.serviceWorker.ready;
  const { publicKey } = await fetch(FN).then((r) => r.json());
  const r = await attach(reg, userId, publicKey);
  if (r === 'ok') want(true);
  return r;
}

// После входа: если на этом устройстве уведомления были включены — включаем снова, без вопросов.
let resumed = null;
export async function resumePush(userId) {
  try {
    if (!userId || resumed === userId || pushSupport() !== 'ok' || Notification.permission !== 'granted') return;
    resumed = userId;
    const reg = await register();
    // включали раньше (или подписка устройства сохранилась после выхода из аккаунта)
    if (!wanted() && !(await reg.pushManager.getSubscription())) return;
    await navigator.serviceWorker.ready;
    const { publicKey } = await fetch(FN).then((r) => r.json());
    if (await attach(reg, userId, publicKey) === 'ok') want(true); else resumed = null;
  } catch { resumed = null; /* нет сети — попробуем при следующем запуске */ }
}

// Выключить на этом устройстве (кнопкой в «Уведомлениях»).
// При выходе из аккаунта (keepDevice) только отвязываем устройство от аккаунта — чужие уведомления
// приходить не будут, а после следующего входа уведомления включатся сами.
export async function disablePush({ keepDevice = false } = {}) {
  try {
    if (!keepDevice) want(false);
    resumed = null;
    const reg = await navigator.serviceWorker?.getRegistration('/');
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    if (!keepDevice) await sub.unsubscribe();
  } catch { /* нет поддержки — нечего выключать */ }
}

// Если разрешение уже дано — держим фоновый скрипт зарегистрированным (он мог обновиться).
export function keepPushWorker() {
  try { if ('serviceWorker' in navigator && window.Notification?.permission === 'granted') register(); } catch { /* ignore */ }
}
