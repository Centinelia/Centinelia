import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail, shell, badge, heading, infoCard, sectionLabel } from '@/lib/email/send';

// How many hours must pass before sending the same pattern again (per agent)
const COOLDOWN_HOURS = 8;

type Pattern =
  | 'repeated_caller'
  | 'faq_bottleneck'
  | 'repeated_doc'
  | 'email_flood';

async function hasRecentLog(
  agentId: string,
  pattern: Pattern,
  supabase: ReturnType<typeof createAdminClient>,
): Promise<boolean> {
  const since = new Date(Date.now() - COOLDOWN_HOURS * 3_600_000).toISOString();
  const { count } = await supabase
    .from('initiative_logs')
    .select('id', { count: 'exact', head: true })
    .eq('agent_id', agentId)
    .eq('pattern', pattern)
    .gte('created_at', since);
  return (count ?? 0) > 0;
}

// 2026-09-10: canal migrado de WhatsApp (transfer_whatsapp) a email
// (client_email). El sandbox de Twilio rechazaba freeform fuera de ventana
// 24h → ninguna iniciativa de Noah llegaba desde meses atrás (ver CSV
// twilio 239 fallos con error 63015, y regla [[feedback-no-whatsapp]]).
async function resolveNotifyEmail(
  agentId: string,
  supabase: ReturnType<typeof createAdminClient>,
): Promise<string | null> {
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('client_email, portal_email, notify_email')
    .eq('id', agentId)
    .maybeSingle();
  if (!agent) return null;
  if (agent.notify_email === false) return null;
  const email = (agent.client_email as string | null)?.trim()
    || (agent.portal_email as string | null)?.trim()
    || null;
  return email;
}

function initiativeEmailHtml(agentName: string, pattern: Pattern, message: string, cta?: string): string {
  const patternLabels: Record<Pattern, string> = {
    repeated_caller: 'Cliente recurrente',
    faq_bottleneck:  'Preguntas frecuentes',
    repeated_doc:    'Documento recurrente',
    email_flood:     'Correos acumulados',
  };
  // Convierte markdown-lite del mensaje original (*bold*, saltos de línea) a HTML.
  const rendered = message
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*([^*]+)\*/g, '<strong style="color:#F1EEFF">$1</strong>')
    .replace(/\n/g, '<br>');
  const ctaBlock = cta ? `<p style="color:#C8BEE8;font-size:14px;line-height:1.7;margin:16px 0 0">${cta}</p>` : '';
  return shell(`
    ${badge(`Iniciativa · ${patternLabels[pattern]}`, '#9B6DFF')}
    ${heading(agentName, 'Detecté un patrón que puede ayudarte')}
    ${infoCard(`
      ${sectionLabel('Lo que noté')}
      <p style="color:#F1EEFF;font-size:14px;line-height:1.7;margin:0">${rendered}</p>
      ${ctaBlock}
    `, true)}
    <p style="color:#8C7FB8;font-size:12px;line-height:1.6;margin:16px 0 0;text-align:center">
      Responde a este correo si quieres que actúe con base en esta iniciativa.
    </p>
  `);
}

async function notify(
  agentId: string,
  agentName: string,
  pattern: Pattern,
  message: string,
  supabase: ReturnType<typeof createAdminClient>,
): Promise<void> {
  await supabase
    .from('initiative_logs')
    .insert({ agent_id: agentId, pattern, message });

  const to = await resolveNotifyEmail(agentId, supabase);
  if (!to) return;

  const subject = `Iniciativa de ${agentName}`;
  await sendEmail({ to, subject, html: initiativeEmailHtml(agentName, pattern, message) })
    .catch(err => console.error('[initiative] email send failed', err));
}

/**
 * Checks patterns triggered by a completed voice call.
 * Call from webhook after() for inbound calls with outcome != 'unanswered'.
 */
export async function checkVoiceInitiative(
  agentId: string,
  agentName: string,
): Promise<void> {
  const supabase = createAdminClient();
  const since24h = new Date(Date.now() - 86_400_000).toISOString();

  // ── Pattern 1: Same caller without resolution (2+ times today) ───────────
  if (!await hasRecentLog(agentId, 'repeated_caller', supabase)) {
    const { data: rows } = await supabase
      .from('voice_calls')
      .select('caller_number')
      .eq('agent_id', agentId)
      .gte('created_at', since24h)
      .not('outcome', 'in', '("lead_created","appointment_booked","order_taken","unanswered")')
      .neq('caller_number', '');

    if (rows?.length) {
      const counts: Record<string, number> = {};
      for (const { caller_number } of rows as { caller_number: string }[]) {
        if (caller_number) counts[caller_number] = (counts[caller_number] ?? 0) + 1;
      }
      const repeated = Object.entries(counts).filter(([, n]) => n >= 2);
      if (repeated.length > 0) {
        const [number, count] = repeated.sort(([, a], [, b]) => b - a)[0];
        const msg = `El número ${number} llamó *${count} veces hoy* sin llegar a lead, cita ni pedido. Puede que tenga una duda que no está en mi base de conocimiento. ¿Quieres que le contacte?`;
        await notify(agentId, agentName, 'repeated_caller', msg, supabase);
        return;
      }
    }
  }

  // ── Pattern 2: FAQ bottleneck — 5+ info-only calls in 24h ────────────────
  if (!await hasRecentLog(agentId, 'faq_bottleneck', supabase)) {
    const { count } = await supabase
      .from('voice_calls')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', agentId)
      .eq('outcome', 'info_provided')
      .gte('created_at', since24h);

    if ((count ?? 0) >= 5) {
      const msg = `Tuve *${count} llamadas puramente informativas* hoy. Parece que hay preguntas frecuentes que respondo repetidamente. ¿Quieres que revise las transcripciones y te sugiera qué agregar a mi base de conocimiento?`;
      await notify(agentId, agentName, 'faq_bottleneck', msg, supabase);
    }
  }
}

/**
 * Checks patterns triggered by office activity (documents, tasks, emails).
 * Call fire-and-forget from agent-chat after each session.
 */
export async function checkOfficeInitiative(
  agentId: string,
  agentName: string,
): Promise<void> {
  const supabase = createAdminClient();
  const since7d  = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const since24h = new Date(Date.now() - 86_400_000).toISOString();

  // ── Pattern 3: Repeated document type (3+ same type in 7 days) ───────────
  if (!await hasRecentLog(agentId, 'repeated_doc', supabase)) {
    const { data: docs } = await supabase
      .from('ops_documents')
      .select('template_type')
      .eq('agent_id', agentId)
      .gte('created_at', since7d);

    if (docs?.length) {
      const counts: Record<string, number> = {};
      for (const { template_type } of docs as { template_type: string }[]) {
        if (template_type) counts[template_type] = (counts[template_type] ?? 0) + 1;
      }
      const TYPE_LABELS: Record<string, string> = {
        pdf:         'PDFs generales',
        general:     'documentos generales',
        proposal:    'propuestas',
        letter:      'cartas',
        word:        'documentos Word',
        excel:       'hojas de Excel',
        powerpoint:  'presentaciones',
        slides:      'presentaciones',
      };
      const repeated = Object.entries(counts)
        .filter(([, n]) => n >= 3)
        .sort(([, a], [, b]) => b - a);

      if (repeated.length > 0) {
        const [type, count] = repeated[0];
        const label = TYPE_LABELS[type] ?? `documentos tipo "${type}"`;
        const msg = `Esta semana generé *${count} ${label}*. Si es algo que necesitas regularmente, puedo configurar un reporte automático para que se genere solo, sin que me lo pidas cada vez. ¿Te interesa?`;
        await notify(agentId, agentName, 'repeated_doc', msg, supabase);
        return;
      }
    }
  }

  // ── Pattern 4: Email flood — 3+ pending inbox items in 24h ───────────────
  if (!await hasRecentLog(agentId, 'email_flood', supabase)) {
    const { count } = await supabase
      .from('ops_inbox')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', agentId)
      .eq('status', 'pending')
      .gte('created_at', since24h);

    if ((count ?? 0) >= 3) {
      const msg = `Tengo *${count} correos pendientes de revisar* que llegaron hoy. ¿Quieres que los procese ahora y te proponga respuestas para aprobar?`;
      await notify(agentId, agentName, 'email_flood', msg, supabase);
    }
  }
}
