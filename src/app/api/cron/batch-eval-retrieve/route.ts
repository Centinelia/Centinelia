import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { claimCronRun, releaseCronRun } from '@/lib/cron/lock';

export const dynamic = 'force-dynamic';

/**
 * Cron durmiente — F5.2 retrieve. Complementa /api/cron/batch-eval.
 *
 * Polleaa los batches `call_eval` in_progress, cuando terminan descarga los
 * resultados y actualiza voice_calls.ces_data / self_eval_score.
 *
 * Ejecutar cada 15-30 min. Los batches típicamente terminan en <1h.
 */

const anthropic = new Anthropic();
const CES_DIMS = ['fluidez', 'comprension', 'naturalidad', 'conduccion', 'confianza', 'resolucion'] as const;
type Dim = typeof CES_DIMS[number];

interface DimScore { score: number; obs: string }

function extractJson(text: string): Record<string, unknown> | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]) as Record<string, unknown>; } catch { return null; }
}

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const claim = await claimCronRun(supabase, 'batch-eval-retrieve', 25 * 60 * 1000);
  if (!claim.ok) return NextResponse.json({ ok: true, skipped: claim.reason });

  // Solo procesar batches que aún NO se descargaron. El status terminal
  // 'retrieved' se escribe al terminar la descarga; excluimos también 'ended'
  // (legacy pre-fix 2026-08-24) para evitar re-procesar batches viejos.
  const { data: batches } = await supabase
    .from('anthropic_batches')
    .select('id, batch_id, status')
    .eq('kind', 'call_eval')
    .in('status', ['in_progress', 'validating'])
    .limit(10);

  if (!batches?.length) return NextResponse.json({ ok: true, processed: 0 });

  let updated = 0;
  const errors: string[] = [];

  for (const b of batches) {
    try {
      const remote = await anthropic.messages.batches.retrieve(b.batch_id as string);
      if (remote.processing_status !== 'ended') {
        await supabase.from('anthropic_batches').update({ status: remote.processing_status }).eq('id', b.id);
        continue;
      }

      const results = await anthropic.messages.batches.results(b.batch_id as string);
      for await (const item of results) {
        const cid = item.custom_id;
        const isCes = cid.startsWith('ces_');
        const isSe  = cid.startsWith('se_');
        const callId = cid.replace(/^(ces_|se_)/, '');
        if (!isCes && !isSe) continue;
        if (item.result.type !== 'succeeded') continue;

        const first = item.result.message.content[0];
        const text  = first.type === 'text' ? first.text.trim() : '';
        const parsed = extractJson(text);
        if (!parsed) continue;

        // NOTA: Antes se cobraba 1 op al pool aquí. Evaluación CES + auto-eval
        // es monitoreo INTERNO de calidad de Centinelia (no lo pidió el
        // cliente); el costo Anthropic Batches lo absorbe Centinelia como
        // margen. Ver [[feedback-pool-cost-based]].

        if (isCes) {
          // Sanitize CES data
          const cesData: Record<string, DimScore | number | string | null> = {};
          let sum = 0; let count = 0;
          for (const d of CES_DIMS) {
            const dv = parsed[d] as Record<string, unknown> | undefined;
            if (dv && typeof dv.score === 'number') {
              const s = Math.min(5, Math.max(1, Math.round(dv.score)));
              cesData[d] = { score: s, obs: typeof dv.obs === 'string' ? dv.obs.slice(0, 200) : '' };
              sum += s; count++;
            }
          }
          if (count === CES_DIMS.length) {
            cesData.overall = +(sum / count).toFixed(1);
            await supabase.from('voice_calls').update({ ces_data: cesData }).eq('id', callId);
            updated++;
          }
        } else if (isSe) {
          const score = typeof parsed.score === 'number' ? Math.min(5, Math.max(1, Math.round(parsed.score))) : null;
          const notes = typeof parsed.notes === 'string' ? parsed.notes.slice(0, 500) : null;
          if (score !== null) {
            await supabase.from('voice_calls').update({
              self_eval_score: score,
              self_eval_notes: notes,
              self_eval_at:    new Date().toISOString(),
            }).eq('id', callId);
            updated++;
          }
        }
      }

      // Terminal: 'retrieved' evita que la próxima corrida re-descargue este
      // batch (los updates de voice_calls son idempotentes pero re-descargar
      // gasta tokens Anthropic sin nueva info).
      await supabase.from('anthropic_batches').update({ status: 'retrieved', ended_at: new Date().toISOString() }).eq('id', b.id);
    } catch (err) {
      errors.push(`${b.batch_id}: ${String(err)}`);
    }
  }

  await releaseCronRun(supabase, 'batch-eval-retrieve');
  return NextResponse.json({ ok: true, updated, errors });
}
