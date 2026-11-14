// Приём статусов доставки от подключённых служб (Локали, BeriVery и т. п.).
// POST /functions/v1/delivery-webhook
//   Authorization: Bearer <ключ службы, выданный в админке Kavkaz Look>
//   { "delivery_id": "...", "status": "assigned|picked_up|delivered|failed|cancelled",
//     "courier_name": "...", "courier_phone": "+79...", "tracking_url": "https://...", "note": "...", "set_external_id": "..." }
// Ключ проверяет база (хранится только его хэш). Функция развёртывается без проверки JWT Supabase: службы — не наши пользователи.
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!/^kl_[0-9a-f]{48}$/.test(token)) return json({ ok: false, error: 'bad_token' }, 401);
  let payload: Record<string, unknown>;
  try {
    const text = await req.text();
    if (text.length > 4000) return json({ ok: false, error: 'too_large' }, 413);
    payload = JSON.parse(text);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error();
  } catch { return json({ ok: false, error: 'bad_json' }, 400); }
  const { data, error } = await db.rpc('delivery_webhook', { token, payload });
  if (error) return json({ ok: false, error: 'server_error' }, 500);
  const status = data?.ok ? 200 : data?.error === 'bad_token' ? 401 : data?.error === 'not_found' ? 404 : 400;
  return json(data, status);
});
