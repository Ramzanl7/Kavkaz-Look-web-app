// Фоновый скрипт Kavkaz Look — ТОЛЬКО для push-уведомлений.
// Ничего не кэширует и не перехватывает запросы, чтобы не мешать обновлениям сайта.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { title: 'Kavkaz Look', body: event.data?.text() || '' }; }
  const url = typeof d.url === 'string' && d.url.startsWith('/') ? d.url : '/notifications';
  event.waitUntil(self.registration.showNotification(d.title || 'Kavkaz Look', {
    body: d.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url },
    tag: url,
    // Новый заказ: кнопка «Принять» прямо в уведомлении (Android; на iPhone откроется заказ)
    actions: /^\/seller\/orders\/[0-9a-f-]{36}$/.test(url) && /^(Новый заказ|Заказ ждёт подтверждения)$/.test(d.title || '') ? [{ action: 'accept', title: 'Принять' }] : [],
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  let url = event.notification.data?.url || '/notifications';
  if (event.action === 'accept') url = url.replace('/seller/orders/', '/seller/orders/accept/');
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin === self.location.origin) { await w.focus(); w.navigate?.(url); return; }
    }
    await self.clients.openWindow(url);
  })());
});
