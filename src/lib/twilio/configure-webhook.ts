const TWILIO_SID   = process.env.TWILIO_ACCOUNT_SID!;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN!;

function auth() {
  return `Basic ${Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64')}`;
}

function e164(number: string) {
  const clean = number.replace(/\s/g, '');
  return clean.startsWith('+') ? clean : `+${clean}`;
}

export async function configureTwilioWhatsAppWebhook(
  phoneNumber: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!TWILIO_SID || !TWILIO_TOKEN) {
    return { ok: false, error: 'Missing Twilio credentials' };
  }

  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/whatsapp/webhook`;
  const normalized = e164(phoneNumber);

  // 1. Find the number's SID in this Twilio account
  const searchRes = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(normalized)}`,
    { headers: { Authorization: auth() } },
  );

  if (!searchRes.ok) {
    return { ok: false, error: `Twilio lookup failed (${searchRes.status})` };
  }

  const { incoming_phone_numbers: numbers } = await searchRes.json();

  if (!numbers?.length) {
    return { ok: false, error: `Number ${normalized} not found in Twilio account` };
  }

  const sid = numbers[0].sid as string;

  // 2. Set the SmsUrl to our webhook (Twilio routes WhatsApp through SmsUrl)
  const updateRes = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/IncomingPhoneNumbers/${sid}.json`,
    {
      method:  'POST',
      headers: { Authorization: auth(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({ SmsUrl: webhookUrl, SmsMethod: 'POST' }).toString(),
    },
  );

  if (!updateRes.ok) {
    const err = await updateRes.text();
    return { ok: false, error: `Twilio update failed: ${err}` };
  }

  return { ok: true };
}
