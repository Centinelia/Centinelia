// scripts/cleanup-nelia-stuck-outbound.ts
//
// Backfill del bug audit 2026-09-29: 40 outbound_contacts de Nelia
// quedaron atascados en status='calling' porque el insert a outbound_calls
// fallaba silent (scheduled_at NOT NULL). Después del fix, hay que limpiar
// los stuck.
//
// Regla:
//   - Si el incident vinculado ya tiene verification_result → completed
//   - Si el incident sigue abierto Y scheduled_at es <= 14 días atrás → failed
//     (los dejamos morir. La conversación probablemente ya no aplica.)
//   - Si el incident sigue abierto Y scheduled_at es más reciente (<14d) → pending
//     (para que el pipeline nuevo los reintente en la próxima corrida del cron)
//
// Corre con --dry-run primero, luego sin flag para aplicar.

import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const NELIA_AGENT_ID = 'e22fbc64-c01c-4184-8365-62e423052d7a';
const DRY_RUN = process.argv.includes('--dry-run');
const STALE_DAYS = 14;

(async () => {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(` CLEANUP outbound_contacts stuck para Nelia — ${DRY_RUN ? 'DRY RUN' : 'APPLY'}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const { data: stuck } = await s.from('outbound_contacts')
    .select('id, telefono, status, scheduled_at, external_source, external_id, created_at')
    .eq('agent_id', NELIA_AGENT_ID)
    .eq('status', 'calling');
  console.log(`Stuck en 'calling': ${(stuck ?? []).length}\n`);
  if (!stuck || stuck.length === 0) {
    console.log('Nada que limpiar.');
    return;
  }

  // Lookup masivo de incidents vinculados
  const incidentIds = Array.from(new Set(
    stuck
      .filter(c => c.external_source === 'client_incident' && c.external_id)
      .map(c => c.external_id as string),
  ));
  const { data: incidents } = await s.from('client_incidents')
    .select('id, verification_result, business_name')
    .in('id', incidentIds.length > 0 ? incidentIds : ['00000000-0000-0000-0000-000000000000']);
  const incidentById = new Map((incidents ?? []).map(i => [i.id as string, i]));

  const nowMs = Date.now();
  const cutoffMs = nowMs - STALE_DAYS * 86400 * 1000;

  const buckets: Record<'completed' | 'failed' | 'pending', typeof stuck> = {
    completed: [],
    failed:    [],
    pending:   [],
  };

  for (const c of stuck) {
    const incident = c.external_id ? incidentById.get(c.external_id as string) : null;
    const alreadyVerified = incident?.verification_result != null;
    const scheduledMs = c.scheduled_at ? new Date(c.scheduled_at as string).getTime() : 0;
    const isStale = scheduledMs < cutoffMs;

    if (alreadyVerified) {
      buckets.completed.push(c);
    } else if (isStale) {
      buckets.failed.push(c);
    } else {
      buckets.pending.push(c);
    }
  }

  console.log(`Plan de transiciones:`);
  console.log(`  → completed (incident ya verificado):        ${buckets.completed.length}`);
  console.log(`  → failed    (stale >${STALE_DAYS}d, no worth retry):    ${buckets.failed.length}`);
  console.log(`  → pending   (reciente, retry via cron new):  ${buckets.pending.length}`);
  console.log(`  TOTAL:                                        ${stuck.length}\n`);

  // Muestra 5 de cada bucket
  for (const [status, list] of Object.entries(buckets)) {
    if (list.length === 0) continue;
    console.log(`  Muestra ${status}:`);
    for (const c of list.slice(0, 5)) {
      const inc = c.external_id ? incidentById.get(c.external_id as string) : null;
      console.log(`    ${(c.id as string).slice(0, 8)}  tel=${c.telefono}  sched=${(c.scheduled_at as string ?? '-').slice(0, 10)}  biz=${(inc?.business_name as string ?? '-').slice(0, 25)}`);
    }
    console.log('');
  }

  if (DRY_RUN) {
    console.log('DRY RUN — sin cambios en DB. Corre sin --dry-run para aplicar.');
    return;
  }

  // Aplicar. Uso update batch por status para minimizar roundtrips.
  const nowIso = new Date().toISOString();
  for (const [toStatus, list] of Object.entries(buckets)) {
    if (list.length === 0) continue;
    const ids = list.map(c => c.id as string);
    const { error, count } = await s.from('outbound_contacts')
      .update({
        status:     toStatus,
        // fail_count solo aplica a failed; el resto lo dejamos como está.
        // Nota: no tocamos scheduled_at para preservar historia.
      })
      .in('id', ids)
      .select('id', { count: 'exact', head: true });
    if (error) {
      console.error(`  ERROR transitioning to ${toStatus}: ${error.message}`);
    } else {
      console.log(`  ✓ ${count} contacts transitioned to '${toStatus}' at ${nowIso}`);
    }
  }

  // Log post-cleanup
  const { count: remaining } = await s.from('outbound_contacts')
    .select('id', { count: 'exact', head: true })
    .eq('agent_id', NELIA_AGENT_ID)
    .eq('status', 'calling');
  console.log(`\nRestantes en 'calling' post-cleanup: ${remaining}`);
})().catch(e => { console.error('ERROR:', e); process.exit(1); });
