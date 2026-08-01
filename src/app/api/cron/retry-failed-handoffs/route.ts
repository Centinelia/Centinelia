// Retry queue del webhook /api/email/inbound cuando processHandoffReply
// falla fire-and-forget. Corre cada 15min. Ver migrations/20260731_handoff_retry_queue.sql
// + [[audit-deferred-handoff]] sección F opción A.
//
// Backoff: 15/30/60/180/720 minutos. Tras 5 intentos fallidos rinde y avisa
// a admin (hola@centinelia.mx). Row queda en la tabla con notified_admin_at
// para audit.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { processHandoffReply, type HandoffAttachment } from '@/lib/human-handoff/inbound';
import { sendEmail, shell } from '@/lib/email/send';

export const dynamic    = 'force-dynamic';
export const maxDuration = 60;

const ADMIN_EMAIL = 'hola@centinelia.mx';
const BACKOFF_MINUTES = [15, 30, 60, 180, 720];
const MAX_RETRIES = BACKOFF_MINUTES.length;

interface FailedRow {
  id:                string;
  human_request_id:  string;
  from_email:        string;
  subject:           string | null;
  text_body:         string | null;
  attachments:       HandoffAttachment[];
  retry_count:       number;
  first_failed_at:   string;
}

interface HumanRequestRow {
  id:              string;
  agent_id:        string;
  title:           string;
  status:          string;
  target_email:    string;
}

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date();

  // Cola: pendientes cuyo próximo intento ya venció. Cap 20 por corrida.
  const { data: rows, error } = await supabase
    .from('handoff_failed_responses')
    .select('id, human_request_id, from_email, subject, text_body, attachments, retry_count, first_failed_at')
    .is('resolved_at', null)
    .not('next_retry_at', 'is', null)
    .lte('next_retry_at', now.toISOString())
    .order('next_retry_at', { ascending: true })
    .limit(20);

  if (error) {
    console.error('[retry-failed-handoffs] query failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results = { picked: rows?.length ?? 0, resolved: 0, retried: 0, gave_up: 0, errors: 0 };

  for (const row of (rows ?? []) as FailedRow[]) {
    try {
      // Rehidratar human_requests — cambió estado mientras estaba en cola?
      // Si el request ya se resolvió por otro canal (ej. respondió vía portal),
      // NO reintentar el email (el guard stale-reply del processHandoffReply lo
      // manejaría, pero es más limpio marcar resolved acá).
      const { data: hr } = await supabase
        .from('human_requests')
        .select('id, agent_id, title, status, target_email')
        .eq('id', row.human_request_id)
        .single();

      if (!hr) {
        // Request eliminado → no hay nada que reintentar. Marca resolved para sacar de la cola.
        await supabase
          .from('handoff_failed_responses')
          .update({ resolved_at: now.toISOString(), last_error: 'human_request no existe', updated_at: now.toISOString() })
          .eq('id', row.id);
        results.resolved++;
        continue;
      }

      const humanRequest = hr as HumanRequestRow;

      // processHandoffReply necesita el shape de HandoffRequestMatch.
      // Lo re-construimos desde la row (el resto de campos no importan para el flujo).
      await processHandoffReply({
        request: {
          id:           humanRequest.id,
          agent_id:     humanRequest.agent_id,
          title:        humanRequest.title,
          status:       humanRequest.status,
          target_email: humanRequest.target_email,
        },
        from:        row.from_email,
        subject:     row.subject ?? '',
        text:        row.text_body ?? '',
        attachments: row.attachments ?? [],
      });

      // Éxito
      await supabase
        .from('handoff_failed_responses')
        .update({
          resolved_at:       now.toISOString(),
          last_attempted_at: now.toISOString(),
          updated_at:        now.toISOString(),
        })
        .eq('id', row.id);
      results.resolved++;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const nextCount = row.retry_count + 1;

      if (nextCount >= MAX_RETRIES) {
        // Rinde: notifica admin, deja next_retry_at NULL.
        try {
          await sendGiveUpEmail(row, errMsg);
        } catch (mailErr) {
          console.error('[retry-failed-handoffs] give-up email failed:', mailErr);
        }
        await supabase
          .from('handoff_failed_responses')
          .update({
            retry_count:       nextCount,
            last_error:        errMsg.slice(0, 2000),
            last_attempted_at: now.toISOString(),
            next_retry_at:     null,
            notified_admin_at: now.toISOString(),
            updated_at:        now.toISOString(),
          })
          .eq('id', row.id);
        results.gave_up++;
      } else {
        const nextMs = BACKOFF_MINUTES[nextCount] * 60 * 1000;
        await supabase
          .from('handoff_failed_responses')
          .update({
            retry_count:       nextCount,
            last_error:        errMsg.slice(0, 2000),
            last_attempted_at: now.toISOString(),
            next_retry_at:     new Date(now.getTime() + nextMs).toISOString(),
            updated_at:        now.toISOString(),
          })
          .eq('id', row.id);
        results.retried++;
      }
      results.errors++;
    }
  }

  return NextResponse.json(results);
}

async function sendGiveUpEmail(row: FailedRow, lastError: string): Promise<void> {
  const body = `
    <p style="color:#F1EEFF;font-size:14px;line-height:1.6;margin:0 0 16px">
      Un correo de respuesta humana falló los ${MAX_RETRIES} intentos de retry y no se pudo procesar. Revisa manualmente el hilo con el cliente.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#1D1141;border:1px solid #3D2E6A;border-radius:8px;margin:16px 0">
      <tr><td style="padding:12px 16px">
        <p style="color:#C8BEE8;font-size:12px;margin:0 0 4px">De</p>
        <p style="color:#F1EEFF;font-size:13px;margin:0 0 12px">${escapeHtml(row.from_email)}</p>
        <p style="color:#C8BEE8;font-size:12px;margin:0 0 4px">Asunto</p>
        <p style="color:#F1EEFF;font-size:13px;margin:0 0 12px">${escapeHtml(row.subject ?? '(sin asunto)')}</p>
        <p style="color:#C8BEE8;font-size:12px;margin:0 0 4px">Human request ID</p>
        <p style="color:#F1EEFF;font-size:13px;margin:0 0 12px;font-family:monospace">${row.human_request_id}</p>
        <p style="color:#C8BEE8;font-size:12px;margin:0 0 4px">Primer fallo</p>
        <p style="color:#F1EEFF;font-size:13px;margin:0 0 12px">${new Date(row.first_failed_at).toLocaleString('es-MX')}</p>
        <p style="color:#C8BEE8;font-size:12px;margin:0 0 4px">Último error</p>
        <p style="color:#F1EEFF;font-size:13px;margin:0;font-family:monospace">${escapeHtml(lastError.slice(0, 500))}</p>
      </td></tr>
    </table>
    <p style="color:#8C7FB8;font-size:12px;line-height:1.5;margin:16px 0 0">
      Row queda persistida en <code>handoff_failed_responses</code> con <code>notified_admin_at</code> seteado para audit.
    </p>
  `;

  await sendEmail({
    to:      ADMIN_EMAIL,
    subject: `[Centinelia] Handoff reply falló tras ${MAX_RETRIES} intentos`,
    html:    shell(body),
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
