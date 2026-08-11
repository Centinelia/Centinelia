import { createAdminClient } from '@/lib/supabase/admin';

const VAPI_URL = 'https://api.vapi.ai';
const VAPI_KEY = process.env.VAPI_API_KEY!;

function headers() {
  return { 'Authorization': `Bearer ${VAPI_KEY}`, 'Content-Type': 'application/json' };
}

async function findPhoneNumberId(number: string): Promise<{ id: string | null; err?: string }> {
  try {
    const res = await fetch(`${VAPI_URL}/phone-number?limit=100`, { headers: headers(), signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return { id: null, err: `Vapi phone-number list HTTP ${res.status}` };
    const data = await res.json();
    const list = Array.isArray(data) ? data : (data.results ?? []);
    const found = list.find((n: any) => n.number === number || n.phoneNumber === number);
    return { id: found?.id ?? null };
  } catch (err) {
    return { id: null, err: `Vapi phone-number list threw: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function pauseVapiAgent(phoneNumber: string): Promise<void> {
  // NO-OP intencional (2026-08-11). Antes: PATCH { assistantId: null } al
  // phone number — Vapi rechazaba llamadas sin assistant y el llamante
  // escuchaba silencio. Ahora la pausa efectiva vive en DB (active=false)
  // y `/api/voice/inbound` detecta ese estado + responde con un mensaje
  // explicativo. Dejamos el assistantId asignado para que Vapi siga
  // enrutando calls al serverUrl. Ver [[feedback-audit-read-path-fidelity]].
  void phoneNumber;
  return;
}

/**
 * Reactiva el assistant en el phone number Vapi. ANTES: void return, sin
 * verify res.ok, sin platform_incident si fallaba → cliente pagaba renewal
 * y su agente seguía dormido (upgrade path o payment_succeeded no reasignaba
 * assistant al phone number). Ver Scope C1 CRIT #1 y Scope D2 RACE 3.
 */
export async function resumeVapiAgent(phoneNumber: string, assistantId: string): Promise<{ ok: boolean; error?: string }> {
  if (!phoneNumber || !assistantId) return { ok: false, error: 'missing_args' };
  const lookup = await findPhoneNumberId(phoneNumber);
  if (!lookup.id) {
    await recordVapiIncident({
      title:       `Vapi: no encontré phone_number ${phoneNumber} al reactivar`,
      description: `resumeVapiAgent lookup falló. ${lookup.err ?? 'phone_number no está en la cuenta Vapi.'} Cliente pagó pero su agente sigue dormido hasta intervención manual.`,
      phoneNumber, assistantId,
    });
    return { ok: false, error: lookup.err ?? 'phone_not_found' };
  }
  try {
    const res = await fetch(`${VAPI_URL}/phone-number/${lookup.id}`, {
      method:  'PATCH',
      headers: headers(),
      body:    JSON.stringify({ assistantId }),
      signal:  AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      await recordVapiIncident({
        title:       `Vapi: PATCH phone-number falló al reactivar assistant`,
        description: `HTTP ${res.status} · phoneNumber=${phoneNumber} assistantId=${assistantId} · body: ${body.slice(0, 500)}`,
        phoneNumber, assistantId,
      });
      return { ok: false, error: `Vapi PATCH HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await recordVapiIncident({
      title:       `Vapi: PATCH phone-number lanzó excepción`,
      description: `phoneNumber=${phoneNumber} assistantId=${assistantId} · error: ${msg}`,
      phoneNumber, assistantId,
    });
    return { ok: false, error: msg };
  }
}

async function recordVapiIncident(args: {
  title: string; description: string; phoneNumber: string; assistantId: string;
}): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase.from('platform_incidents').insert({
      source:      'vapi_resume_failed',
      source_id:   `${args.phoneNumber}_${Date.now()}`,
      title:       args.title,
      description: args.description,
      priority:    'critical',
      status:      'open',
      assigned_to: 'owner',
      metadata:    { phone_number: args.phoneNumber, assistant_id: args.assistantId },
    });
  } catch (err) {
    console.error('[recordVapiIncident] failed to insert platform_incident:', err);
  }
}
