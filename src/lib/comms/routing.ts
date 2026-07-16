import type { createAdminClient } from '@/lib/supabase/admin';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export interface CommsRoute {
  id:                 string;
  label:              string;
  keywords:           string[];
  forward_to:         string[];
  response_sla_hours: number;
}

export interface CommsRoutingConfig {
  enabled:                 boolean;
  routes:                  CommsRoute[];
  default_route_id:        string | null;
  acknowledgment_template: string;
  sender_name:             string;
}

export const DEFAULT_ACK_TEMPLATE = `Estimado/a {nombre},

Hemos recibido su comunicado con asunto "{asunto}" el {fecha}.

Su mensaje fue turnado al área de {departamento}.
Le contactaremos en un plazo máximo de {horas} horas hábiles.

Atentamente,
{remitente}`;

export const DEFAULT_COMMS_ROUTING: CommsRoutingConfig = {
  enabled:                 false,
  routes:                  [],
  default_route_id:        null,
  acknowledgment_template: DEFAULT_ACK_TEMPLATE,
  sender_name:             'Comunicación Social',
};

export async function getCommsRouting(agentId: string, supabase: SupabaseClient): Promise<CommsRoutingConfig> {
  const { data } = await supabase
    .from('voice_agents').select('comms_routing').eq('id', agentId).single();
  const raw = (data as any)?.comms_routing as Partial<CommsRoutingConfig> | null;
  if (!raw) return DEFAULT_COMMS_ROUTING;
  return {
    enabled:                 raw.enabled                 ?? false,
    routes:                  raw.routes                  ?? [],
    default_route_id:        raw.default_route_id        ?? null,
    acknowledgment_template: raw.acknowledgment_template ?? DEFAULT_ACK_TEMPLATE,
    sender_name:             raw.sender_name             ?? 'Comunicación Social',
  };
}

export function matchRoute(subject: string, body: string, routes: CommsRoute[]): CommsRoute | null {
  const text = `${subject} ${body}`.toLowerCase();
  return routes.find(r => r.keywords.some(k => text.includes(k.toLowerCase()))) ?? null;
}

function fillAckTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

export async function applyCommsRouting(params: {
  agentId:    string;
  supabase:   SupabaseClient;
  fromEmail:  string;
  subject:    string;
  body:       string;
  senderName: string;
}): Promise<void> {
  const { agentId, supabase, fromEmail, subject, body, senderName } = params;
  const config = await getCommsRouting(agentId, supabase);
  if (!config.enabled || !config.routes.length) return;

  const matched = matchRoute(subject, body, config.routes)
    ?? (config.default_route_id ? config.routes.find(r => r.id === config.default_route_id) ?? null : null);

  if (!matched) return;

  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) return;

  const FROM  = process.env.RESEND_FROM_EMAIL ?? 'Centinelia <notificaciones@centinelia.mx>';
  const fecha = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });

  async function sendEmail(to: string | string[], subject: string, text: string): Promise<void> {
    await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_KEY}` },
      body:    JSON.stringify({ from: FROM, to: Array.isArray(to) ? to : [to], subject, text }),
    }).catch((err: unknown) => console.error('[comms-routing] send error:', err));
  }

  // Forward to department
  if (matched.forward_to.length > 0) {
    const forwardBody = `--- Correo reenviado de: ${senderName ? `${senderName} <${fromEmail}>` : fromEmail} ---\n\nAsunto original: ${subject}\n\n${body}`;
    await sendEmail(matched.forward_to, `[${matched.label}] ${subject || '(sin asunto)'}`, forwardBody);
  }

  // Auto-acknowledgment to sender
  const ackText = fillAckTemplate(config.acknowledgment_template, {
    nombre:       senderName || fromEmail,
    asunto:       subject || '(sin asunto)',
    fecha,
    departamento: matched.label,
    horas:        matched.response_sla_hours.toString(),
    remitente:    config.sender_name,
  });

  await sendEmail(fromEmail, `Re: ${subject || '(sin asunto)'}`, ackText);
}
