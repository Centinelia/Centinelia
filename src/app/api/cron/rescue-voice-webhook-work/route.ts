/**
 * D-L1 rescue: detecta rows en voice_call_pending_work stuck en pending >30min.
 * Vercel cortó el after() antes de completar → learnings/CES/self-eval/memory
 * perdidos, notificaciones WA/email al owner nunca salieron, Notion sin row.
 *
 * Estrategia CONSERVADORA: NO re-ejecutar el after() automáticamente (evita
 * duplicados de notificaciones + LLM ops charge). Solo:
 *   1. Marcar la row como status='failed' con error='timeout'.
 *   2. Crear platform_incident (priority='med', assigned_to='owner') para que
 *      Nash escale — el owner decide si vale la pena reprocesar manualmente.
 *
 * Cron sugerido: `0 * * * *` (horario, revisa el batch de la última hora).
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { claimCronRun, releaseCronRun } from '@/lib/cron/lock';

const STUCK_THRESHOLD_MS = 30 * 60 * 1000; // 30 min

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();
  const claim = await claimCronRun(supabase, 'rescue-voice-webhook-work', 45 * 60 * 1000);
  if (!claim.ok) return NextResponse.json({ ok: true, skipped: claim.reason });

  const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MS).toISOString();
  const { data: stuck } = await supabase
    .from('voice_call_pending_work')
    .select('call_id, agent_id, portal_email, started_at, metadata')
    .is('processed_at', null)
    .eq('status', 'pending')
    .lt('started_at', cutoff)
    .limit(20);

  if (!stuck?.length) {
    await releaseCronRun(supabase, 'rescue-voice-webhook-work');
    return NextResponse.json({ ok: true, stuck: 0 });
  }

  let flagged = 0;
  for (const row of stuck) {
    // Marcar failed para que no vuelva a caer en el próximo run.
    await supabase
      .from('voice_call_pending_work')
      .update({ status: 'failed', error: 'timeout_after_30min', processed_at: new Date().toISOString() })
      .eq('call_id', row.call_id);

    // Crear incident SOLO si tiene portal_email y contexto útil (skip legacy rows).
    if (row.portal_email) {
      await supabase.from('platform_incidents').insert({
        source:                'voice_webhook_after_timeout',
        source_id:             `voice_webhook_${row.call_id}`,
        title:                 `Voice webhook after() no completó para call ${row.call_id}`,
        description:           `El bloque after() del webhook (learnings + self-eval + CES + memory + notificaciones + Notion + missed-call recovery) no completó dentro del ceiling de Vercel (~30s). Minutos ya cobrados. Contexto: ${JSON.stringify(row.metadata ?? {})}. Iniciado: ${row.started_at}. Revisar manualmente si vale la pena reprocesar (evitar duplicar notifs).`,
        priority:              'med',
        status:                'open',
        assigned_to:           'owner',
        affected_portal_email: row.portal_email,
        metadata:              { call_id: row.call_id, agent_id: row.agent_id, ...(row.metadata as Record<string, unknown> ?? {}) },
      });
      flagged++;
    }
  }

  await releaseCronRun(supabase, 'rescue-voice-webhook-work');
  return NextResponse.json({ ok: true, stuck: stuck.length, flagged });
}
