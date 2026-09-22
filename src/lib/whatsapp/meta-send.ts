/**
 * Sender WhatsApp via Meta Cloud API (Graph API v20+).
 *
 * Distinto a Twilio: Meta requiere `phone_number_id` (id de Meta, no el numero
 * E.164) para saber DESDE que numero mandar. El id se obtiene al conectar el
 * numero a la Cloud API en el Meta Business Manager.
 *
 * Costo: mensajes de servicio (respuestas dentro de 24h post-mensaje del user)
 * son gratis / muy baratos. Mensajes de marketing/utilidad requieren template
 * pre-aprobado y cobran ~$0.005-0.02 USD por conversation window de 24h.
 *
 * Env vars requeridas para operar:
 *   META_WA_ACCESS_TOKEN  — permanent access token del System User de la
 *                           WhatsApp Business App (no user token corto).
 *   META_WA_API_VERSION   — opcional, default 'v20.0'.
 */

const META_API_BASE = 'https://graph.facebook.com';

export interface MetaSendResult {
  ok:               true;
  wamid:            string;
  contactWaId:      string;
}

export interface MetaSendError {
  ok:               false;
  error:            string;
  statusCode?:      number;
  metaErrorCode?:   number;
}

export type MetaSendReturn = MetaSendResult | MetaSendError;

function e164(num: string): string {
  const clean = num.replace(/[^\d+]/g, '');
  return clean.startsWith('+') ? clean.slice(1) : clean;
}

/**
 * Manda un mensaje de texto plano al numero `to` DESDE el `phoneNumberId` de
 * Meta. Solo funciona para responder dentro de la ventana de 24h post-mensaje
 * del user; fuera de ventana Meta rechaza y hay que usar template.
 */
export async function sendMetaText(input: {
  phoneNumberId:  string;
  to:             string;
  body:           string;
  accessToken?:   string;
  apiVersion?:    string;
}): Promise<MetaSendReturn> {
  const token = input.accessToken ?? process.env.META_WA_ACCESS_TOKEN;
  if (!token) {
    return { ok: false, error: 'META_WA_ACCESS_TOKEN no configurado' };
  }
  const version = input.apiVersion ?? process.env.META_WA_API_VERSION ?? 'v20.0';
  const url = `${META_API_BASE}/${version}/${input.phoneNumberId}/messages`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type:    'individual',
      to:                e164(input.to),
      type:              'text',
      text:              { body: input.body, preview_url: false },
    }),
  });

  if (!res.ok) {
    let errBody: { error?: { message?: string; code?: number } } = {};
    try { errBody = await res.json(); } catch { /* ignore parse */ }
    return {
      ok:            false,
      error:         errBody.error?.message ?? `HTTP ${res.status}`,
      statusCode:    res.status,
      metaErrorCode: errBody.error?.code,
    };
  }

  const data = await res.json() as {
    messages?: Array<{ id: string }>;
    contacts?: Array<{ wa_id: string }>;
  };
  const wamid       = data.messages?.[0]?.id       ?? '';
  const contactWaId = data.contacts?.[0]?.wa_id    ?? e164(input.to);
  return { ok: true, wamid, contactWaId };
}
