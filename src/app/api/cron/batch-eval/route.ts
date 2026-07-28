import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * Cron durmiente — F5.2 del plan de context engineering Q3.
 *
 * Rellena CES eval + self-eval que el webhook no alcanzó a procesar,
 * usando el Batch API de Anthropic (50% off vs sync).
 *
 * Para activar en producción:
 *   1. Agregar a vercel.json:
 *        { "path": "/api/cron/batch-eval", "schedule": "*\/30 * * * *" }
 *   2. Verificar que CRON_SECRET esté en env
 *   3. Monitorear la primera corrida y validar que ces_data / self_eval_score
 *      se llenen sin regresiones vs el path sync
 *
 * Escenario típico: llamada termina, webhook Vapi puede fallar o timeout,
 * ces_data queda null. Este cron cierra el gap sin costar el 100% de tokens.
 */

const anthropic = new Anthropic();
const CES_DIMS = ['fluidez', 'comprension', 'naturalidad', 'conduccion', 'confianza', 'resolucion'] as const;

const CES_PROMPT_STABLE = `Analiza esta transcripción de llamada y evalúa SOLO la calidad conversacional del empleado IA. NO evalúes si logró el objetivo de ventas.

Evalúa del 1 al 5 cada dimensión con UNA observación específica con evidencia del transcript:
- fluidez, comprension, naturalidad, conduccion, confianza, resolucion

1=Muy deficiente  2=Deficiente  3=Aceptable  4=Bueno  5=Excelente

Responde ÚNICAMENTE con JSON válido:
{
  "fluidez":     { "score": <1-5>, "obs": "..." },
  "comprension": { "score": <1-5>, "obs": "..." },
  "naturalidad": { "score": <1-5>, "obs": "..." },
  "conduccion":  { "score": <1-5>, "obs": "..." },
  "confianza":   { "score": <1-5>, "obs": "..." },
  "resolucion":  { "score": <1-5>, "obs": "..." }
}`;

const SELF_EVAL_PROMPT_STABLE = `Evalúa esta llamada del 1 al 5 y da 1-2 notas breves.
5 = excelente resolución del objetivo.
1 = no cumplió.
Responde SOLO JSON: { "score": <1-5>, "notes": "..." }`;

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
  const oneDayAgo  = new Date(Date.now() - 24 * 60 * 60_000).toISOString();

  // Recoge calls que no tienen CES + calls que no tienen self_eval, dentro del último día
  const { data: pending } = await supabase
    .from('voice_calls')
    .select('id, transcript, ces_data, self_eval_score, outcome, duration_seconds, created_at')
    .lt('created_at', fiveMinAgo)
    .gte('created_at', oneDayAgo)
    .neq('outcome', 'unanswered')
    .gte('duration_seconds', 30)
    .or('ces_data.is.null,self_eval_score.is.null')
    .limit(200);

  if (!pending?.length) return NextResponse.json({ ok: true, processed: 0 });

  interface BatchReq {
    custom_id: string;
    params: {
      model:      string;
      max_tokens: number;
      system?:    Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>;
      messages:   Array<{ role: 'user'; content: string }>;
    };
  }

  const requests: BatchReq[] = [];
  for (const c of pending) {
    if (!c.transcript || typeof c.transcript !== 'string') continue;
    if (!c.ces_data) {
      requests.push({
        custom_id: `ces_${c.id}`,
        params: {
          model:      'claude-haiku-4-5-20251001',
          max_tokens: 600,
          system:  [{ type: 'text', text: CES_PROMPT_STABLE, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: `TRANSCRIPT:\n${(c.transcript as string).slice(0, 5000)}` }],
        },
      });
    }
    if (c.self_eval_score === null) {
      requests.push({
        custom_id: `se_${c.id}`,
        params: {
          model:      'claude-haiku-4-5-20251001',
          max_tokens: 250,
          system:  [{ type: 'text', text: SELF_EVAL_PROMPT_STABLE, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: `Outcome: ${c.outcome}\nTRANSCRIPT:\n${(c.transcript as string).slice(0, 4000)}` }],
        },
      });
    }
  }

  if (requests.length === 0) return NextResponse.json({ ok: true, processed: 0 });

  // Batch API acepta hasta 100k requests por batch. Nosotros mandamos como mucho 400.
  // Retorno inmediato con batch id; los resultados se recogen en la siguiente corrida
  // del cron (o con una segunda ruta dedicada al retrieve — pendiente si hace falta).
  const batch = await anthropic.messages.batches.create({
    requests: requests as unknown as Parameters<typeof anthropic.messages.batches.create>[0]['requests'],
  });

  // Guarda el batch_id en una tabla auxiliar para retrieve posterior
  await supabase.from('anthropic_batches').insert({
    batch_id:    batch.id,
    kind:        'call_eval',
    request_ids: requests.map(r => r.custom_id),
    status:      batch.processing_status ?? 'in_progress',
  });

  return NextResponse.json({
    ok:              true,
    batch_id:        batch.id,
    request_count:   requests.length,
    status:          batch.processing_status ?? 'in_progress',
  });
}
