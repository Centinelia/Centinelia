import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeToE164 } from '@/lib/leads/dedup';
import { isWithinBusinessHours, nextOpenTime } from '@/lib/voice/business-hours';
import { isValidE164 } from '@/lib/billing/fallback-validate';

/**
 * Twilio voice-gate — intercepta TODA llamada entrante ANTES de que llegue
 * a Vapi. Es el ÚNICO punto donde podemos gatear calls, porque los phone
 * numbers de Vapi tienen `assistantId` pre-set y por eso Vapi NO consulta
 * nuestro serverUrl (`/api/voice/inbound`) para `assistant-request`. Toda
 * la lógica histórica en `inbound/route.ts` (blocklist, agent paused,
 * account suspended, business hours, pool exhausted + fallback, daily cap)
 * NUNCA se ejecutó en producción desde que se pre-configuran assistantIds.
 *
 * Twilio POST (form-encoded) incluye: From, To, CallSid, AccountSid, etc.
 * Responde TwiML:
 *   - <Reject>    → cuelga sin cobrar nada
 *   - <Say>+<Hangup> → mensaje al llamante y cuelga (TTS Polly es-MX)
 *   - <Dial>      → transfiere a otro número (fallback personal del dueño)
 *   - <Redirect>  → forward al webhook original de Vapi (flow normal)
 *
 * Config:
 *   - Twilio incoming_phone_number.voice_url apuntando aquí
 *   - TWILIO_AUTH_TOKEN en env para validar signature
 *   - VAPI_TWILIO_WEBHOOK_URL opcional override (default: Vapi oficial)
 */

const VAPI_WEBHOOK_URL = process.env.VAPI_TWILIO_WEBHOOK_URL
  ?? 'https://api.vapi.ai/twilio/inbound_call';

const SAY_VOICE_ATTR = 'voice="Polly.Mia" language="es-MX"';

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

/** Escapa caracteres especiales para TwiML (único riesgo: ampersand, quotes, <, >). */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function sayHangup(message: string): string {
  return `<Say ${SAY_VOICE_ATTR}>${escapeXml(message)}</Say><Hangup/>`;
}

function dial(number: string): string {
  return `<Dial>${escapeXml(number)}</Dial>`;
}

function redirectToVapi(): string {
  return `<Redirect method="POST">${VAPI_WEBHOOK_URL}</Redirect>`;
}

interface AgentRow {
  id:                 string;
  portal_email:       string | null;
  business_name:      string | null;
  business_hours:     unknown;
  timezone:           string | null;
  active:             boolean | null;
  billing_status:     string | null;
  transfer_number:    string | null;
  transfer_whatsapp:  string | null;
  daily_minutes_cap:  number | null;
  minutes_used:       number | null;
  minutes_included:   number | null;
}

function sameTenDigits(a: string | null | undefined, b: string): boolean {
  if (!a) return false;
  const aa = a.replace(/\D/g, '').slice(-10);
  const bb = b.replace(/\D/g, '').slice(-10);
  return aa.length >= 7 && aa === bb;
}

export async function POST(req: NextRequest) {
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
    return twiml(redirectToVapi());
  }

  const supabase = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, portal_email, business_name, business_hours, timezone, active, billing_status, transfer_number, transfer_whatsapp, daily_minutes_cap, minutes_used, minutes_included')
    .eq('phone_number', to)
    .limit(1)
    .maybeSingle() as { data: AgentRow | null };

  if (!agent) {
    // Sin agent asociado — forward a Vapi para no romper (ej. demo numbers).
    return twiml(redirectToVapi());
  }

  const callerE164 = normalizeToE164(from);
  const callerDigits = callerE164.replace(/\D/g, '').slice(-10);
  const isOwner = sameTenDigits(agent.transfer_number, callerDigits)
                || sameTenDigits(agent.transfer_whatsapp, callerDigits);

  const businessName = agent.business_name?.trim() || 'nuestra oficina';

  // GATE 1: blocklist (not owner) → Reject busy
  if (!isOwner && agent.portal_email) {
    const { data: blocked } = await supabase
      .from('blocked_numbers')
      .select('id, reason')
      .eq('portal_email', agent.portal_email)
      .eq('phone_e164', callerE164)
      .maybeSingle();
    if (blocked) {
      console.log(`[voice-gate] blocklist REJECT ${callerE164} → ${to} (${agent.portal_email}) reason=${blocked.reason ?? '-'}`);
      return twiml('<Reject reason="busy"/>');
    }
  }

  // GATE 2: agent paused (active=false) → Say + Hangup
  if (agent.active === false) {
    const transferNum = (agent.transfer_number ?? '').trim();
    const reasonPhrase = agent.billing_status === 'pago_fallido'
      ? 'temporalmente por una situación administrativa'
      : 'en este momento';
    const msg = transferNum
      ? `Gracias por llamar a ${businessName}. No podemos atenderte por este número ${reasonPhrase}. Por favor comunícate al ${transferNum} o intenta más tarde. Gracias.`
      : `Gracias por llamar a ${businessName}. No podemos atenderte por este número ${reasonPhrase}. Por favor intenta más tarde o contáctanos por otros medios. Gracias.`;
    console.log(`[voice-gate] agent paused ${to} (${agent.portal_email ?? '-'})`);
    return twiml(sayHangup(msg));
  }

  // GATE 3+: necesitamos la organización (suspended, fallback_phone_number)
  let fallbackPhone: string | null = null;
  if (agent.portal_email) {
    const { data: org } = await supabase
      .from('organizations')
      .select('account_status, suspended_until, fallback_phone_number')
      .eq('portal_email', agent.portal_email)
      .maybeSingle();

    if (org) {
      // GATE 3: account suspended/terminated → Reject
      const isSuspended = org.account_status === 'suspended'
        && (!org.suspended_until || new Date(org.suspended_until as string) > new Date());
      const isTerminated = org.account_status === 'terminated';
      if (isSuspended || isTerminated) {
        console.log(`[voice-gate] account ${org.account_status} ${to} (${agent.portal_email})`);
        return twiml('<Reject reason="rejected"/>');
      }
      fallbackPhone = (org.fallback_phone_number as string | null) ?? null;
    }
  }

  // GATE 4: business hours (not owner) → Say + Hangup
  if (!isOwner && agent.business_hours) {
    try {
      // isWithinBusinessHours maneja timezone null defaulteando a America/Mexico_City
      const hours = agent.business_hours as Parameters<typeof isWithinBusinessHours>[0];
      const tz    = agent.timezone ?? 'America/Mexico_City';
      if (!isWithinBusinessHours(hours, tz)) {
        const next = nextOpenTime(hours as NonNullable<typeof hours>, tz);
        const msg = next
          ? `Gracias por llamar a ${businessName}. En este momento estamos cerrados. Puedes llamarnos de nuevo ${next}. Hasta luego.`
          : `Gracias por llamar a ${businessName}. En este momento estamos fuera de horario. Por favor intenta más tarde.`;
        console.log(`[voice-gate] closed (business hours) ${to}`);
        return twiml(sayHangup(msg));
      }
    } catch (err) {
      // Si falla el chequeo, no bloqueamos — fail-open.
      console.error('[voice-gate] business_hours check error, ignoring:', err);
    }
  }

  // GATE 5: pool exhausted (not owner)
  if (!isOwner && agent.portal_email) {
    const { data: acctMins } = await supabase
      .from('account_minutes')
      .select('minutes_used, minutes_included')
      .eq('portal_email', agent.portal_email)
      .maybeSingle();
    const minutesIncluded = (acctMins?.minutes_included as number | null) ?? agent.minutes_included ?? 0;
    const minutesUsed     = (acctMins?.minutes_used     as number | null) ?? agent.minutes_used     ?? 0;

    if (minutesIncluded > 0 && minutesUsed >= minutesIncluded) {
      if (fallbackPhone && isValidE164(fallbackPhone)) {
        console.log(`[voice-gate] pool exhausted → DIAL ${fallbackPhone} ${to}`);
        return twiml(dial(fallbackPhone));
      }
      const msg = `Gracias por llamar a ${businessName}. En este momento el servicio automatizado se encuentra temporalmente pausado. Por favor contacte al negocio directamente. Gracias.`;
      console.log(`[voice-gate] pool exhausted no fallback ${to}`);
      return twiml(sayHangup(msg));
    }
  }

  // GATE 6: daily cap (not owner)
  if (!isOwner && agent.portal_email && agent.daily_minutes_cap && agent.daily_minutes_cap > 0) {
    try {
      const { data: todayRow } = await supabase
        .rpc('account_minutes_today', { p_portal_email: agent.portal_email })
        .single();
      const minutesToday = Number(todayRow ?? 0);
      if (minutesToday >= agent.daily_minutes_cap) {
        const msg = `Gracias por llamar a ${businessName}. En este momento el servicio ha alcanzado su capacidad diaria. Por favor intente mañana o contacte al negocio directamente. Gracias.`;
        console.log(`[voice-gate] daily cap reached ${to}`);
        return twiml(sayHangup(msg));
      }
    } catch (err) {
      // Fail-open ante error del RPC
      console.error('[voice-gate] daily_cap RPC error, ignoring:', err);
    }
  }

  // Todo OK: forward al webhook de Vapi preservando los params originales.
  return twiml(redirectToVapi());
}
