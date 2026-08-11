const VAPI_URL = 'https://api.vapi.ai';
const VAPI_KEY = process.env.VAPI_API_KEY!;

function headers() {
  return { 'Authorization': `Bearer ${VAPI_KEY}`, 'Content-Type': 'application/json' };
}

async function findPhoneNumberId(number: string): Promise<string | null> {
  const res = await fetch(`${VAPI_URL}/phone-number?limit=100`, { headers: headers() });
  if (!res.ok) return null;
  const data = await res.json();
  const list = Array.isArray(data) ? data : (data.results ?? []);
  const found = list.find((n: any) => n.number === number || n.phoneNumber === number);
  return found?.id ?? null;
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

export async function resumeVapiAgent(phoneNumber: string, assistantId: string): Promise<void> {
  if (!phoneNumber || !assistantId) return;
  const id = await findPhoneNumberId(phoneNumber);
  if (!id) return;
  await fetch(`${VAPI_URL}/phone-number/${id}`, {
    method:  'PATCH',
    headers: headers(),
    body:    JSON.stringify({ assistantId }),
  });
}
