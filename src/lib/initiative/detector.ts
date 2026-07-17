import { createAdminClient } from '@/lib/supabase/admin';
import { sendWhatsApp } from '@/lib/whatsapp/send';

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

async function notify(
  agentId: string,
  pattern: Pattern,
  message: string,
  transferWhatsapp: string,
  supabase: ReturnType<typeof createAdminClient>,
): Promise<void> {
  await supabase
    .from('initiative_logs')
    .insert({ agent_id: agentId, pattern, message });
  await sendWhatsApp(transferWhatsapp, message).catch(console.error);
}

/**
 * Checks patterns triggered by a completed voice call.
 * Call from webhook after() for inbound calls with outcome != 'unanswered'.
 */
export async function checkVoiceInitiative(
  agentId: string,
  agentName: string,
  transferWhatsapp: string | null | undefined,
): Promise<void> {
  if (!transferWhatsapp) return;

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
        const msg = `🔁 *Iniciativa — ${agentName}*\n\nEl número ${number} llamó *${count} veces hoy* sin llegar a lead, cita ni pedido. Puede que tenga una duda que no está en mi base de conocimiento. ¿Quieres que le contacte por WhatsApp?`;
        await notify(agentId, 'repeated_caller', msg, transferWhatsapp, supabase);
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
      const msg = `📚 *Iniciativa — ${agentName}*\n\nTuve *${count} llamadas puramente informativas* hoy. Parece que hay preguntas frecuentes que respondo repetidamente. ¿Quieres que revise las transcripciones y te sugiera qué agregar a mi base de conocimiento?`;
      await notify(agentId, 'faq_bottleneck', msg, transferWhatsapp, supabase);
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
  transferWhatsapp: string | null | undefined,
): Promise<void> {
  if (!transferWhatsapp) return;

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
        const msg = `📄 *Iniciativa — ${agentName}*\n\nEsta semana generé *${count} ${label}*. Si es algo que necesitas regularmente, puedo configurar un reporte automático para que se genere solo, sin que me lo pidas cada vez. ¿Te interesa?`;
        await notify(agentId, 'repeated_doc', msg, transferWhatsapp, supabase);
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
      const msg = `📬 *Iniciativa — ${agentName}*\n\nTengo *${count} correos pendientes de revisar* que llegaron hoy. ¿Quieres que los procese ahora y te proponga respuestas para aprobar?`;
      await notify(agentId, 'email_flood', msg, transferWhatsapp, supabase);
    }
  }
}
