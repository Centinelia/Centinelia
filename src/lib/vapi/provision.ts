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

async function searchTwilioNumbers(areaCode?: string): Promise<string[]> {
  const sid    = process.env.TWILIO_ACCOUNT_SID!;
  const params = new URLSearchParams({ VoiceEnabled: 'true', Limit: '5' });
  if (areaCode) params.set('AreaCode', areaCode);

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/AvailablePhoneNumbers/MX/Local.json?${params}`,
    { headers: { Authorization: twilioBasicAuth() } }
  );
  if (!res.ok) return [];
  const { available_phone_numbers } = await res.json();
  return (available_phone_numbers ?? []).map((n: any) => n.phone_number as string);
}

async function buyTwilioNumber(areaCode?: string): Promise<{ number: string; ladaFallback: boolean } | null> {
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
  return number ? { number, ladaFallback } : null;
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

async function assignAssistant(vapiPhoneId: string, vapiAssistantId: string, concurrencyLimit?: number): Promise<boolean> {
  const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
  const secret  = process.env.VAPI_SERVER_SECRET ?? '';
  const serverUrl = `${appUrl}/api/voice/inbound?secret=${secret}`;

  const patch: Record<string, unknown> = { assistantId: vapiAssistantId, serverUrl };
  if (concurrencyLimit !== undefined) patch.concurrencyLimit = concurrencyLimit;

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
}

/**
 * Full provisioning:
 * 1. Buy a Mexican number in Twilio
 * 2. Import it into Vapi (Vapi auto-configures the Twilio webhook)
 * 3. Assign the Vapi assistant
 *
 * Returns { phoneNumber, vapiPhoneId, ladaFallback } on success, null on failure.
 * ladaFallback=true → caller debe notificar al cliente que su lada no estaba
 * disponible y le asignamos otra (Scope D1 F6).
 */
export async function provisionPhoneNumber(vapiAssistantId: string, areaCode?: string, concurrencyLimit?: number): Promise<ProvisionResult | null> {
  const bought = await buyTwilioNumber(areaCode);
  if (!bought) return null;

  const vapiPhoneId = await importToVapi(bought.number);
  if (!vapiPhoneId) {
    console.error('provision: number bought but Vapi import failed:', bought.number);
    return { phoneNumber: bought.number, vapiPhoneId: null, ladaFallback: bought.ladaFallback, requestedLada: areaCode ?? null };
  }

  await assignAssistant(vapiPhoneId, vapiAssistantId, concurrencyLimit);
  return { phoneNumber: bought.number, vapiPhoneId, ladaFallback: bought.ladaFallback, requestedLada: areaCode ?? null };
}
