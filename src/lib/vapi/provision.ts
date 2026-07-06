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

async function buyTwilioNumber(areaCode?: string): Promise<string | null> {
  const sid = process.env.TWILIO_ACCOUNT_SID!;

  // Try requested area code first, then fall back to any MX number
  let candidates = areaCode ? await searchTwilioNumbers(areaCode) : [];
  if (!candidates.length) {
    candidates = await searchTwilioNumbers(); // no area code filter
  }
  if (!candidates.length) {
    console.error('provision: no available Mexican numbers');
    return null;
  }

  const numberToBuy = candidates[0];

  const buyParams: Record<string, string> = { PhoneNumber: numberToBuy };
  // Mexico local numbers require an approved Regulatory Bundle (BU... SID)
  const bundleSid = process.env.TWILIO_REGULATORY_BUNDLE_SID;
  if (bundleSid) buyParams.BundleSid = bundleSid;

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
  return (data.phone_number as string) ?? null;
}

async function importToVapi(phoneNumber: string): Promise<string | null> {
  const res = await fetch(`${VAPI_URL}/phone-number`, {
    method:  'POST',
    headers: vapiHeaders(),
    body: JSON.stringify({
      provider:         'twilio',
      number:           phoneNumber,
      twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
      twilioAuthToken:  process.env.TWILIO_AUTH_TOKEN,
    }),
  });

  if (!res.ok) {
    console.error('provision: Vapi import failed', await res.text());
    return null;
  }

  const data = await res.json();
  return (data.id as string) ?? null;
}

async function assignAssistant(vapiPhoneId: string, vapiAssistantId: string, concurrencyLimit?: number): Promise<boolean> {
  const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
  const secret  = process.env.VAPI_SERVER_SECRET ?? '';
  const serverUrl = `${appUrl}/api/voice/inbound?secret=${secret}`;

  const patch: Record<string, unknown> = { assistantId: vapiAssistantId, serverUrl };
  if (concurrencyLimit !== undefined) patch.concurrencyLimit = concurrencyLimit;

  const res = await fetch(`${VAPI_URL}/phone-number/${vapiPhoneId}`, {
    method:  'PATCH',
    headers: vapiHeaders(),
    body:    JSON.stringify(patch),
  });
  if (!res.ok) console.error('provision: assign assistant failed', await res.text());
  return res.ok;
}

export interface ProvisionResult {
  phoneNumber: string;
  vapiPhoneId: string | null;
}

/**
 * Full provisioning:
 * 1. Buy a Mexican number in Twilio
 * 2. Import it into Vapi (Vapi auto-configures the Twilio webhook)
 * 3. Assign the Vapi assistant
 *
 * Returns { phoneNumber, vapiPhoneId } on success, null on failure.
 */
export async function provisionPhoneNumber(vapiAssistantId: string, areaCode?: string, concurrencyLimit?: number): Promise<ProvisionResult | null> {
  const phoneNumber = await buyTwilioNumber(areaCode);
  if (!phoneNumber) return null;

  const vapiPhoneId = await importToVapi(phoneNumber);
  if (!vapiPhoneId) {
    console.error('provision: number bought but Vapi import failed:', phoneNumber);
    return { phoneNumber, vapiPhoneId: null };
  }

  await assignAssistant(vapiPhoneId, vapiAssistantId, concurrencyLimit);
  return { phoneNumber, vapiPhoneId };
}
