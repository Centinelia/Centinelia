// Helper compartido para alertas de crons cuando procesan parcialmente
// (fix H13 audit 2026-08-10). Antes: reset-minutes procesaba 40 de 42 y
// nadie se enteraba; siguiente ciclo el cliente descubría minutos no
// reseteados. Ahora cada cron llama alertCronPartialFailure() al final y
// dispara email a soporte + registra platform_incident si hubo errores
// o procesamiento incompleto.
//
// Rate-limit: máximo 1 alerta por cron por hora para evitar spam en caso
// de falla persistente (el segundo run del mismo ciclo verá el incident
// ya abierto y no duplica).
//
// 2026-09-10: canal migrado de WhatsApp (sandbox Twilio) a email. El
// sandbox rechazaba freeform fuera de ventana 24h y ninguna alerta llegaba
// desde hace meses. Ver CSV twilio 239 fallos con error 63015.

import type { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail, shell, badge, heading, infoCard, sectionLabel, btn } from '@/lib/email/send';

interface AlertArgs {
  cronName:   string;
  expected:   number;     // items encontrados a procesar
  processed:  number;     // items completados exitosamente
  errors?:    string[];   // mensajes de error acumulados (opcional)
}

/**
 * Extrae un mensaje humano-legible de cualquier error.
 *
 * `err instanceof Error ? err.message : String(err)` era el patrón usado en
 * todos los crons. Falla con Supabase PostgrestError (POJO con `.message`,
 * `.code`, `.details`) porque NO es instance de Error → cae a `String(err)`
 * que devuelve "[object Object]". Fix 2026-09-10: leer `.message` /
 * `.details` / `.code` cuando existan; caer a JSON.stringify si no.
 */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    const msg = typeof obj.message === 'string' ? obj.message : null;
    const details = typeof obj.details === 'string' ? obj.details : null;
    const code = typeof obj.code === 'string' ? obj.code : null;
    if (msg || details || code) {
      return [msg, details, code ? `[${code}]` : null].filter(Boolean).join(' · ');
    }
    try { return JSON.stringify(err); } catch { return '[unserializable error]'; }
  }
  return String(err);
}

const INTERNAL_ALERT_EMAIL = process.env.INTERNAL_ALERT_EMAIL
  ?? process.env.NEXT_PUBLIC_SUPPORT_EMAIL
  ?? 'hola@centinelia.mx';

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

  const priorityLabel = priority === 'critical' ? 'CRITICO' : 'ALTA';
  const priorityColor = priority === 'critical' ? '#DC2626' : '#F59E0B';
  const errBlock = errCount > 0
    ? infoCard(`
        ${sectionLabel('Muestra de errores')}
        <pre style="color:#F1EEFF;font-size:12px;line-height:1.6;margin:0;white-space:pre-wrap;font-family:Menlo,Monaco,Consolas,monospace">${escapeHtml(errSample)}</pre>
      `, true)
    : '';

  const html = shell(`
    ${badge(`Cron parcial · ${priorityLabel}`, priorityColor)}
    ${heading(args.cronName, `${args.processed}/${args.expected} procesados`)}
    ${infoCard(`
      ${sectionLabel('Diagnóstico')}
      <p style="color:#F1EEFF;font-size:14px;line-height:1.7;margin:0">
        <strong style="color:#F1EEFF">${missing}</strong> item${missing === 1 ? '' : 's'} sin procesar.<br>
        <strong style="color:#F1EEFF">${errCount}</strong> error${errCount === 1 ? '' : 'es'} capturado${errCount === 1 ? '' : 's'}.
      </p>
    `)}
    ${errBlock}
    ${btn('Ver /admin/soporte →', 'https://www.centinelia.mx/admin/soporte')}
  `);

  await sendEmail({
    to:      INTERNAL_ALERT_EMAIL,
    subject: `[${priorityLabel}] Cron ${args.cronName} — ${args.processed}/${args.expected}`,
    html,
  }).catch(err => console.error('[alertCronPartialFailure] email send failed', err));
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
