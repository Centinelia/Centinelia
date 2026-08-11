// Helper compartido para alertas de crons cuando procesan parcialmente
// (fix H13 audit 2026-08-10). Antes: reset-minutes procesaba 40 de 42 y
// nadie se enteraba; siguiente ciclo el cliente descubría minutos no
// reseteados. Ahora cada cron llama alertCronPartialFailure() al final y
// dispara WhatsApp al owner + registra platform_incident si hubo errores
// o procesamiento incompleto.
//
// Rate-limit: máximo 1 alerta por cron por hora para evitar spam en caso
// de falla persistente (el segundo run del mismo ciclo verá el incident
// ya abierto y no duplica).

import type { createAdminClient } from '@/lib/supabase/admin';
import { sendWhatsApp } from '@/lib/whatsapp/send';

interface AlertArgs {
  cronName:   string;
  expected:   number;     // items encontrados a procesar
  processed:  number;     // items completados exitosamente
  errors?:    string[];   // mensajes de error acumulados (opcional)
}

export async function alertCronPartialFailure(
  supabase: ReturnType<typeof createAdminClient>,
  args: AlertArgs,
): Promise<void> {
  const missing = args.expected - args.processed;
  const errCount = args.errors?.length ?? 0;
  if (missing <= 0 && errCount === 0) return; // Todo OK, silencio.

  // Rate-limit: existe incident abierto para el mismo cron en la última hora?
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: recent } = await supabase
    .from('platform_incidents')
    .select('id')
    .eq('source', 'error_log')
    .eq('source_id', `cron:${args.cronName}`)
    .in('status', ['open', 'in_progress', 'sent_to_claude_code', 'awaiting_verification'])
    .gte('created_at', oneHourAgo)
    .maybeSingle();
  if (recent) return;

  const priority = missing > args.expected / 2 ? 'critical' : 'high';
  const errSample = (args.errors ?? []).slice(0, 3).join(' | ');

  const title = `Cron ${args.cronName} parcial — ${args.processed}/${args.expected}`;
  const description = [
    `Cron: ${args.cronName}`,
    `Items encontrados: ${args.expected}`,
    `Procesados OK: ${args.processed}`,
    `Faltantes: ${missing}`,
    `Errores capturados: ${errCount}`,
    errSample ? `Muestra de errores:\n${errSample}` : '',
    ``,
    `Investigar el próximo run — si vuelve a fallar, elevar a fix urgente.`,
  ].filter(Boolean).join('\n');

  await supabase.from('platform_incidents').insert({
    title,
    description,
    priority,
    source:      'error_log',
    source_id:   `cron:${args.cronName}`,
    status:      'open',
    assigned_to: 'owner',
  });

  const owner = process.env.OWNER_WHATSAPP;
  if (owner) {
    const emoji = priority === 'critical' ? '🚨' : '⚠️';
    const msg = `${emoji} Cron *${args.cronName}* procesó ${args.processed}/${args.expected}. ${missing} faltantes${errCount ? `, ${errCount} errores` : ''}. Ver /admin/soporte.`;
    await sendWhatsApp(owner, msg).catch(err => console.error('[alertCronPartialFailure] WA send failed', err));
  }
}
