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

// Включить: спросить разрешение (только по нажатию), подписать устройство, сохранить подписку.
export async function enablePush(userId) {
  const s = pushSupport();
  if (s !== 'ok') return s;
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return 'denied';
  const reg = await register();
  await navigator.serviceWorker.ready;
  const { publicKey } = await fetch(FN).then((r) => r.json());
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
  const j = sub.toJSON();
  const { error } = await supabase.from('push_subscriptions').insert({ user_id: userId, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth });
  if (error && error.code !== '23505') { await sub.unsubscribe(); return 'error'; }
  return 'ok';
}

// Выключить на этом устройстве (и при выходе из аккаунта — чтобы чужие уведомления не приходили).
export async function disablePush() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration('/');
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  } catch { /* нет поддержки — нечего выключать */ }
}

// Если разрешение уже дано — держим фоновый скрипт зарегистрированным (он мог обновиться).
export function keepPushWorker() {
  try { if ('serviceWorker' in navigator && window.Notification?.permission === 'granted') register(); } catch { /* ignore */ }
}
