import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeToE164 } from '@/lib/leads/dedup';

/**
 * Twilio voice-gate — intercepta la llamada entrante ANTES de que llegue a
 * Vapi. Si el caller está en `blocked_numbers` del org dueño del número,
 * devolvemos TwiML `<Reject>` y la llamada ni siquiera arranca (no cobra
 * Vapi, no cobra pool, no entra a voice_calls). Si no está bloqueado,
 * devolvemos `<Redirect>` al webhook original de Vapi para que el flow
 * normal continúe.
 *
 * Twilio POST (form-encoded) incluye: From, To, CallSid, AccountSid, etc.
 *
 * Flow:
 *   PSTN → Twilio → ESTE endpoint → (Reject | Redirect a Vapi)
 *
 * Config requerida:
 *   - Twilio phone number `voice_url` apuntando aquí
 *   - `TWILIO_AUTH_TOKEN` en env para validar signature
 *   - `VAPI_TWILIO_WEBHOOK_URL` opcional override (default: Vapi oficial)
 *
 * Motivación: 2026-10-05 Tortillería — hook en inbound/route.ts no se
 * ejecuta porque Vapi usa el `assistantId` pre-config del phone number
 * sin consultar nuestro serverUrl. Nelia seguía recibiendo al bot
 * +524691269029 aunque estuviera en blocklist. Twilio-level es la
 * única capa que SÍ corre antes de que Vapi gaste segundos de voz.
 */

const VAPI_WEBHOOK_URL = process.env.VAPI_TWILIO_WEBHOOK_URL
  ?? 'https://api.vapi.ai/twilio/inbound_call';

/**
 * Twilio signature verification. Twilio firma el request con HMAC-SHA1
 * del `url + sorted params as "key1value1key2value2..."` usando auth_token.
 * Comparamos contra el header `X-Twilio-Signature`.
 * Sin TWILIO_AUTH_TOKEN env (dev), fail-open con warning.
 */
function verifyTwilioSignature(req: NextRequest, params: Record<string, string>): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) {
    console.warn('[voice-gate] TWILIO_AUTH_TOKEN missing — skipping signature check');
    return true;
  }
  const sig = req.headers.get('x-twilio-signature');
  if (!sig) return false;

  // Twilio construye la URL con el host original. En Vercel usamos el header
  // x-forwarded-host + proto; si no, caemos a nextUrl (puede ser localhost).
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  const host  = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? req.nextUrl.host;
  const url   = `${proto}://${host}${req.nextUrl.pathname}${req.nextUrl.search}`;

  const sortedKeys = Object.keys(params).sort();
  const data = sortedKeys.reduce((acc, k) => acc + k + params[k], url);
  const expected = crypto.createHmac('sha1', token).update(data).digest('base64');

  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

function twiml(body: string): NextResponse {
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`,
    { status: 200, headers: { 'Content-Type': 'text/xml; charset=utf-8' } },
  );
}

export async function POST(req: NextRequest) {
  // Twilio manda application/x-www-form-urlencoded
  const text = await req.text();
  const params: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(text)) params[k] = v;

  if (!verifyTwilioSignature(req, params)) {
    console.warn('[voice-gate] invalid Twilio signature, rejecting');
    return twiml('<Reject reason="rejected"/>');
  }

  const from = params.From ?? '';
  const to   = params.To ?? '';
  if (!from || !to) {
    console.error('[voice-gate] missing From or To:', { from, to });
    // Fallback a Vapi para no romper legítimos ante payload raro
    return twiml(`<Redirect method="POST">${VAPI_WEBHOOK_URL}</Redirect>`);
  }

  const supabase = createAdminClient();

  // Resolver portal_email del número To. voice_agents.phone_number guarda
  // en E.164 con +.
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('portal_email')
    .eq('phone_number', to)
    .limit(1)
    .maybeSingle();

  if (!agent?.portal_email) {
    // Sin agent asociado — forward a Vapi para no romper (ej. número demo).
    return twiml(`<Redirect method="POST">${VAPI_WEBHOOK_URL}</Redirect>`);
  }

  const callerE164 = normalizeToE164(from);
  const { data: blocked } = await supabase
    .from('blocked_numbers')
    .select('id, reason')
    .eq('portal_email', agent.portal_email)
    .eq('phone_e164', callerE164)
    .maybeSingle();

  if (blocked) {
    console.log(`[voice-gate] REJECT ${callerE164} → ${to} (${agent.portal_email}) reason=${blocked.reason ?? '(sin razón)'}`);
    return twiml('<Reject reason="busy"/>');
  }

  // No bloqueado: forward al webhook original de Vapi preservando el body.
  // Twilio sigue el <Redirect> con otro POST que incluye todos los params
  // originales — Vapi lo procesa como si viniera directo del phone number.
  return twiml(`<Redirect method="POST">${VAPI_WEBHOOK_URL}</Redirect>`);
}
