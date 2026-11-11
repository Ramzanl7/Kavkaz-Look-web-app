// Функция отправки push-уведомлений (Web Push) для Kavkaz Look.
// GET  /push            → публичный ключ VAPID (нужен браузеру для подписки).
// POST /push {id}       → отправить уведомление с этим id на устройства его владельца.
// Защита: отправляется только свежее (до 10 минут) и ещё не отправленное уведомление, ровно один раз,
// и только на адреса официальных push-сервисов. Поэтому вызов «со стороны» ничего не даёт.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const SUBJECT = 'https://kavkaz-look.vercel.app';
const PUSH_HOSTS = /^https:\/\/(fcm\.googleapis\.com|web\.push\.apple\.com|[a-z0-9.-]+\.push\.apple\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com)\//;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

let keys: { public_key: string; private_key: string } | null = null;
async function getKeys() {
  if (keys) return keys;
  let { data } = await db.from('push_vapid').select('public_key,private_key').eq('id', 1).maybeSingle();
  if (!data) {
    // первый запуск: создаём ключи и сохраняем (если параллельно создал другой экземпляр — берём его ключи)
    const k = webpush.generateVAPIDKeys();
    await db.from('push_vapid').upsert({ id: 1, public_key: k.publicKey, private_key: k.privateKey }, { onConflict: 'id', ignoreDuplicates: true });
    ({ data } = await db.from('push_vapid').select('public_key,private_key').eq('id', 1).single());
  }
  keys = data!;
  webpush.setVapidDetails(SUBJECT, keys.public_key, keys.private_key);
  return keys;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  try {
    const k = await getKeys();
    if (req.method === 'GET') return json({ publicKey: k.public_key });
    if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

    const { id } = await req.json().catch(() => ({}));
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'bad id' }, 400);

    // «забираем» уведомление: отметка pushed_at гарантирует, что оно уйдёт только один раз
    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: n } = await db.from('notifications')
      .update({ pushed_at: new Date().toISOString() })
      .eq('id', id).is('pushed_at', null).gte('created_at', since)
      .select('user_id,title,body,link').maybeSingle();
    if (!n) return json({ sent: 0 });

    const { data: subs } = await db.from('push_subscriptions').select('id,endpoint,p256dh,auth').eq('user_id', n.user_id).limit(10);
    const payload = JSON.stringify({ title: n.title, body: n.body ?? '', url: n.link ?? '/notifications' });
    let sent = 0;
    await Promise.all((subs ?? []).filter((s) => PUSH_HOSTS.test(s.endpoint)).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600, urgency: 'normal' });
        sent++;
      } catch (e) {
        // устройство отписалось или подписка устарела — убираем её
        const code = (e as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) await db.from('push_subscriptions').delete().eq('id', s.id);
      }
    }));
    return json({ sent });
  } catch (_e) {
    return json({ error: 'internal' }, 500);
  }
});
