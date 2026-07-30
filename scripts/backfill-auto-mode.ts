/**
 * One-shot backfill: voice_agents.auto_reply → auto_mode.
 * Idempotente por WHERE auto_mode IS NULL.
 *
 * Mapping (spec):
 *   auto_reply IS TRUE  → auto_mode = 'auto'  (safety net upgrade, NO 'always')
 *   auto_reply IS FALSE → auto_mode = 'off'
 *   auto_reply IS NULL  → auto_mode = 'off'
 *
 * Ejecutar: npx tsx scripts/backfill-auto-mode.ts
 *   --dry-run  → solo cuenta, no muta
 */

import './_bootstrap';
import { createClient } from '@supabase/supabase-js';

const DRY_RUN = process.argv.includes('--dry-run');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function run(): Promise<void> {
  // Snapshot pre-backfill
  const { data: pre, error: preErr } = await supabase
    .from('voice_agents')
    .select('id, auto_reply, auto_mode')
    .is('auto_mode', null);

  if (preErr) {
    console.error('Snapshot failed:', preErr);
    process.exit(1);
  }

  if (!pre || pre.length === 0) {
    console.log('No agents with auto_mode IS NULL. Nothing to backfill.');
    process.exit(0);
  }

  const toAuto = pre.filter(a => a.auto_reply === true);
  const toOff = pre.filter(a => a.auto_reply !== true);

  console.log(`Backfill plan (${DRY_RUN ? 'DRY RUN' : 'APPLY'}):`);
  console.log(`  → 'auto': ${toAuto.length} agents (had auto_reply=true)`);
  console.log(`  → 'off':  ${toOff.length} agents`);

  if (DRY_RUN) {
    process.exit(0);
  }

  // UPDATE en dos batches
  if (toAuto.length > 0) {
    const { error } = await supabase
      .from('voice_agents')
      .update({ auto_mode: 'auto' })
      .in('id', toAuto.map(a => a.id));
    if (error) { console.error('Update auto failed:', error); process.exit(1); }
  }
  if (toOff.length > 0) {
    const { error } = await supabase
      .from('voice_agents')
      .update({ auto_mode: 'off' })
      .in('id', toOff.map(a => a.id));
    if (error) { console.error('Update off failed:', error); process.exit(1); }
  }

  console.log(`\nBackfill complete.`);
  process.exit(0);
}

void run();
