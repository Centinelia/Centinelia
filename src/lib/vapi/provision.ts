const VAPI_URL = 'https://api.vapi.ai';
const VAPI_KEY = process.env.VAPI_API_KEY!;

function vapiHeaders() {
  return { Authorization: `Bearer ${VAPI_KEY}`, 'Content-Type': 'application/json' };
}

function twilioBasicAuth() {
  const sid   = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  return `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`;
}

// MX tiene dos tipos comerciales: Local (geográfico) y Mobile (celular). El
// param `AreaCode` de Twilio SÓLO funciona para US (donde el "area code" son
// los primeros 3 dígitos después de +1). Para MX numeración es +52NN... y hay
// que filtrar con `Contains=+52${lada}` para que Twilio matchee el inicio del
// número. Antes con `AreaCode=81` Twilio regresaba 0 aunque hubiera 5 números
// +5281XXXXXXXX disponibles — bug que hacía el LadaPicker inútil.
const MX_NUMBER_TYPES = ['Local', 'Mobile'] as const;

async function searchTwilioNumbersOfType(type: string, areaCode?: string): Promise<string[]> {
  const sid    = process.env.TWILIO_ACCOUNT_SID!;
  const params = new URLSearchParams({ VoiceEnabled: 'true', PageSize: '5' });
  if (areaCode) params.set('Contains', `+52${areaCode}`);

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/AvailablePhoneNumbers/MX/${type}.json?${params}`,
    { headers: { Authorization: twilioBasicAuth() } }
  );
  if (!res.ok) return [];
  const { available_phone_numbers } = await res.json();
  return (available_phone_numbers ?? []).map((n: any) => n.phone_number as string);
}

export async function searchTwilioNumbers(areaCode?: string): Promise<string[]> {
  const results = await Promise.all(MX_NUMBER_TYPES.map(t => searchTwilioNumbersOfType(t, areaCode)));
  return results.flat();
}

async function buyTwilioNumber(areaCode?: string): Promise<{ number: string; sid: string; ladaFallback: boolean } | null> {
  const sid = process.env.TWILIO_ACCOUNT_SID!;

  // Try requested area code first, then fall back to any MX number.
  // ladaFallback=true si el cliente pidió una lada específica pero cayó al
  // general MX pool → notify caller. Antes: silent fallback, cliente MTY (81)
  // podía recibir número GDL (33) sin aviso. Ver Scope D1 F6.
  let candidates: string[] = [];
  let ladaFallback = false;
  if (areaCode) {
    candidates = await searchTwilioNumbers(areaCode);
  }
  if (!candidates.length) {
    if (areaCode) ladaFallback = true;
    candidates = await searchTwilioNumbers(); // no area code filter
  }
  if (!candidates.length) {
    console.error('provision: no available Mexican numbers');
    return null;
  }

  const numberToBuy = candidates[0];

  const buyParams: Record<string, string> = { PhoneNumber: numberToBuy };
  // Mexico local numbers require both a Regulatory Bundle (BU...) and a
  // registered Address (AD...) — Twilio 21631 fires without AddressSid.
  const bundleSid  = process.env.TWILIO_REGULATORY_BUNDLE_SID;
  const addressSid = process.env.TWILIO_ADDRESS_SID;
  if (bundleSid)  buyParams.BundleSid  = bundleSid;
  if (addressSid) buyParams.AddressSid = addressSid;

  const buyRes = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json`,
    {
      method:  'POST',
      headers: { Authorization: twilioBasicAuth(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams(buyParams).toString(),
    }
  );


  if (!buyRes.ok) {
    console.error('provision: Twilio buy failed', await buyRes.text());
    return null;
  }

  const data = await buyRes.json();
  const number = data.phone_number as string | undefined;
  const twilioSid = data.sid as string | undefined;
  if (!number || !twilioSid) return null;
  return { number, sid: twilioSid, ladaFallback };
}

/**
 * CRÍTICO: PATCH el `voice_url` del Twilio incoming phone number para que
 * apunte a NUESTRO voice-gate, no al webhook de Vapi. Sin este paso, Vapi
 * recibe las calls directo y ningún gate del nuestro corre (blocklist,
 * paused, suspended, business hours, pool exhausted, daily cap).
 *
 * Vapi configura voice_url automáticamente a `api.vapi.ai/twilio/inbound_call`
 * durante el import. Nosotros lo sobrescribimos aquí para interponernos.
 *
 * Ver `.brain/decisions/2026-10-05-twilio-voice-gate-as-real-gate.md`.
 */
async function patchTwilioVoiceUrlToGate(twilioSid: string): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
  if (!sid) {
    console.error('provision: patchTwilioVoiceUrl: TWILIO_ACCOUNT_SID missing');
    return false;
  }
  const gateUrl = `${appUrl}/api/twilio/voice-gate`;
  const body = new URLSearchParams({ VoiceUrl: gateUrl, VoiceMethod: 'POST' });

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers/${twilioSid}.json`,
        {
          method:  'POST',
          headers: { Authorization: twilioBasicAuth(), 'Content-Type': 'application/x-www-form-urlencoded' },
          body:    body.toString(),
          signal:  AbortSignal.timeout(15_000),
        },
      );
      if (res.ok) return true;
      const text = await res.text().catch(() => '');
      console.error(`provision: patchTwilioVoiceUrl HTTP ${res.status} (attempt ${attempt}):`, text);
      if (res.status < 500) return false;
    } catch (err) {
      console.error(`provision: patchTwilioVoiceUrl threw (attempt ${attempt}):`, err);
    }
    if (attempt < 3) await new Promise(r => setTimeout(r, 300 * Math.pow(2, attempt - 1)));
  }
  return false;
}

async function importToVapi(phoneNumber: string): Promise<string | null> {
  // Retry 3× con backoff. Vapi import puede fallar por 5xx transient — sin
  // retry, cliente pagó pero su phone_number quedaba sin vapi_phone_number_id
  // (llamadas rechazadas). Ver Scope D1 F3.
  const body = JSON.stringify({
    provider:         'twilio',
    number:           phoneNumber,
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
    twilioAuthToken:  process.env.TWILIO_AUTH_TOKEN,
  });
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${VAPI_URL}/phone-number`, {
        method:  'POST',
        headers: vapiHeaders(),
        body,
        signal:  AbortSignal.timeout(15_000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.id) return data.id as string;
      } else {
        const text = await res.text().catch(() => '');
        console.error(`provision: Vapi import HTTP ${res.status} (attempt ${attempt}):`, text);
        if (res.status < 500) return null; // 4xx no retry
      }
    } catch (err) {
      console.error(`provision: Vapi import threw (attempt ${attempt}):`, err);
    }
    if (attempt < 3) await new Promise(r => setTimeout(r, 300 * Math.pow(2, attempt - 1)));
  }
  return null;
}

async function assignAssistant(vapiPhoneId: string, vapiAssistantId: string, _concurrencyLimit?: number): Promise<boolean> {
  const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
  const secret  = process.env.VAPI_SERVER_SECRET ?? '';
  const serverUrl = `${appUrl}/api/voice/inbound?secret=${secret}`;

  // concurrencyLimit se removió del endpoint /phone-number en Vapi API — ahora
  // vive a nivel assistant (assistant.maxCallDuration/etc). El param queda en
  // la firma con guion bajo para no romper callers, pero NO se envía al PATCH.
  // Antes: Vapi respondía 400 "property concurrencyLimit should not exist" y
  // el assistant quedaba sin asignar al número (llamadas rechazadas).
  const patch: Record<string, unknown> = { assistantId: vapiAssistantId, serverUrl };

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${VAPI_URL}/phone-number/${vapiPhoneId}`, {
        method:  'PATCH',
        headers: vapiHeaders(),
        body:    JSON.stringify(patch),
        signal:  AbortSignal.timeout(15_000),
      });
      if (res.ok) return true;
      const text = await res.text().catch(() => '');
      console.error(`provision: assign assistant HTTP ${res.status} (attempt ${attempt}):`, text);
      if (res.status < 500) return false;
    } catch (err) {
      console.error(`provision: assign assistant threw (attempt ${attempt}):`, err);
    }
    if (attempt < 3) await new Promise(r => setTimeout(r, 300 * Math.pow(2, attempt - 1)));
  }
  return false;
}

export interface ProvisionResult {
  phoneNumber:   string;
  vapiPhoneId:   string | null;
  ladaFallback:  boolean;   // true si el número no matchea el areaCode pedido
  requestedLada: string | null;
  /** true = TODA la cadena quedó bien (Twilio bought + Vapi imported + gate
   *  patcheado + assistant asignado). false = algún paso falló y el agente
   *  está en estado inconsistente — llamar a repairAgentProvisioning() o
   *  bloquear el flow de admin. Ver policy no-silent-provisioning-failures. */
  fullyProvisioned: boolean;
  errors:            string[];
}

/**
 * Audita que un phone number ya provisionado tenga TODA la config correcta:
 * - Twilio incoming_phone_number.voice_url → /api/twilio/voice-gate
 * - Vapi phone_number.assistantId → set
 * - Vapi phone_number.serverUrl → /api/voice/inbound (fallback) o nuestro URL
 *
 * Devuelve lista de problemas encontrados. Vacío = todo bien.
 * Usado por scripts/audit-twilio-voice-urls.mjs y por el health check tras
 * provisioning nuevo. Ver policy no-silent-provisioning-failures.
 */
export async function auditPhoneProvisioning(twilioSid: string, vapiPhoneId: string | null): Promise<string[]> {
  const problems: string[] = [];
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
  const twSid  = process.env.TWILIO_ACCOUNT_SID;

  // Check 1: Twilio voice_url
  if (twSid) {
    try {
      const r = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twSid}/IncomingPhoneNumbers/${twilioSid}.json`,
        { headers: { Authorization: twilioBasicAuth() } },
      );
      if (r.ok) {
        const data = await r.json();
        const vu = (data.voice_url as string) ?? '';
        if (!vu.includes('/api/twilio/voice-gate')) {
          problems.push(`Twilio voice_url NO apunta al gate: "${vu}". Calls bypasean blocklist/pausado/pool.`);
        }
      } else {
        problems.push(`Twilio API HTTP ${r.status} al verificar voice_url.`);
      }
    } catch (err) {
      problems.push(`Twilio check threw: ${(err as Error).message}`);
    }
  } else {
    problems.push('TWILIO_ACCOUNT_SID missing en env');
  }

  // Check 2: Vapi phone number assistantId + serverUrl
  if (vapiPhoneId) {
    try {
      const r = await fetch(`${VAPI_URL}/phone-number/${vapiPhoneId}`, { headers: vapiHeaders() });
      if (r.ok) {
        const p = await r.json();
        if (!p.assistantId) problems.push(`Vapi phone_number sin assistantId.`);
        const su = (p.serverUrl as string) ?? '';
        if (!su.includes('/api/voice/')) {
          problems.push(`Vapi phone_number.serverUrl no apunta a nuestro backend: "${su}".`);
        }
      } else {
        problems.push(`Vapi API HTTP ${r.status} al verificar phone_number.`);
      }
    } catch (err) {
      problems.push(`Vapi check threw: ${(err as Error).message}`);
    }
  } else {
    problems.push('vapiPhoneId null al auditar (Vapi import falló).');
  }

  // Log si hay problemas — admin/UI puede mostrar al provisionar.
  if (problems.length) {
    console.error(`[provision-audit] Agent twilioSid=${twilioSid} vapiPhoneId=${vapiPhoneId}:\n  - ${problems.join('\n  - ')}`);
  }
  return problems;
}

/**
 * Full provisioning:
 * 1. Buy a Mexican number in Twilio
 * 2. Import it into Vapi (Vapi auto-configures the Twilio voice_url to Vapi)
 * 3. PATCH Twilio voice_url al /api/twilio/voice-gate (CRÍTICO: sin este paso
 *    las calls van directo a Vapi y ningún gate nuestro corre)
 * 4. Assign the Vapi assistant
 *
 * Returns { phoneNumber, vapiPhoneId, ladaFallback } on success, null on failure.
 * ladaFallback=true → caller debe notificar al cliente que su lada no estaba
 * disponible y le asignamos otra (Scope D1 F6).
 */
export async function provisionPhoneNumber(vapiAssistantId: string, areaCode?: string, concurrencyLimit?: number): Promise<ProvisionResult | null> {
  const errors: string[] = [];
  const bought = await buyTwilioNumber(areaCode);
  if (!bought) return null;

  const vapiPhoneId = await importToVapi(bought.number);
  if (!vapiPhoneId) {
    errors.push(`Vapi import failed for ${bought.number}`);
    console.error('provision:', errors[errors.length - 1]);
    return {
      phoneNumber: bought.number, vapiPhoneId: null, ladaFallback: bought.ladaFallback,
      requestedLada: areaCode ?? null, fullyProvisioned: false, errors,
    };
  }

  // CRÍTICO: PATCH Twilio voice_url al gate ANTES de que llegue cualquier call.
  const gatePatched = await patchTwilioVoiceUrlToGate(bought.sid);
  if (!gatePatched) {
    errors.push(`Twilio voice_url NO patcheado para ${bought.number} (sid ${bought.sid}). Calls van a Vapi SIN pasar por gates (blocklist/pausado/pool/etc). Rescate: scripts/audit-twilio-voice-urls.mjs.`);
    console.error('provision:', errors[errors.length - 1]);
  }

  const assigned = await assignAssistant(vapiPhoneId, vapiAssistantId, concurrencyLimit);
  if (!assigned) {
    errors.push(`Vapi assignAssistant falló para phone ${bought.number}`);
    console.error('provision:', errors[errors.length - 1]);
  }

  // Audit post-provisioning: valida que TODO quedó bien. Si algún check falla,
  // el agente nace con bug. Lo marcamos en el resultado para que el caller
  // (admin UI, scripts) decida abortar o alertar. Ver policy
  // no-silent-provisioning-failures.
  const auditProblems = await auditPhoneProvisioning(bought.sid, vapiPhoneId);
  errors.push(...auditProblems);

  const fullyProvisioned = errors.length === 0;
  return {
    phoneNumber: bought.number, vapiPhoneId, ladaFallback: bought.ladaFallback,
    requestedLada: areaCode ?? null, fullyProvisioned, errors,
  };
}
