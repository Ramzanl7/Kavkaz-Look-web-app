// Ссылки на Яндекс Карты (открываются в приложении Карт или Навигатора, если оно установлено)
const ll = (p) => `${p.lat},${p.lng}`;
export const pointUrl = (p) => `https://yandex.ru/maps/?pt=${p.lng},${p.lat}&z=17&l=map`;
// Маршрут от текущего места курьера: через бутик (если у него есть точка) к покупателю
export const routeUrl = (shop, client) => `https://yandex.ru/maps/?rtext=~${shop?.lat != null ? ll(shop) + '~' : ''}${ll(client)}&rtt=auto`;
// Поделиться ссылкой (WhatsApp, Telegram…) или скопировать, если «Поделиться» недоступно
export async function shareLink(title, url, toast) {
  try { if (navigator.share) { await navigator.share({ title, text: title, url }); return; } } catch (e) { if (e?.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(url); toast?.('Ссылка скопирована — отправьте её курьеру'); } catch { window.open(url, '_blank', 'noopener'); }
}
