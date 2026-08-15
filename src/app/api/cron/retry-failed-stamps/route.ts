import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { emitirFacturaAuto } from '@/lib/invoicing/emitir-factura';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Retries factura_requests stuck in status='stamping' with a retryable error.
// Runs every 10 minutes. Uses claim_retry_stamps_batch RPC (FOR UPDATE SKIP LOCKED)
// to avoid double-processing under overlapping cron executions.
//
// Backoff tiers (enforced in the RPC):
//   attempt 1 → wait  1 min before retry
//   attempt 2 → wait  5 min before retry
//   attempt 3 → wait 30 min before retry (max)
//
// See: migrations/20260812_claim_retry_stamps_rpc.sql

export async function GET(req: Request) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Atomic claim — RPC bumps stamp_last_error_at as a soft reserve so a
  // concurrent run will skip the same rows.
  const { data: ids, error: rpcError } = await supabase.rpc(
    'claim_retry_stamps_batch',
    { p_limit: 20 },
  );

  if (rpcError) {
    console.error('[retry-failed-stamps] RPC error:', rpcError.message);
    return NextResponse.json({ error: rpcError.message }, { status: 500 });
  }

  const list = (ids as Array<{ id: string }>) ?? [];

  const results = { attempted: 0, stamped: 0, failed: 0, retrying: 0 };

  for (const { id } of list) {
    results.attempted++;
    try {
      const r = await emitirFacturaAuto(id, supabase);
      if (r.outcome === 'stamped') {
        results.stamped++;
      } else if (r.outcome === 'retrying') {
        results.retrying++;
      } else {
        results.failed++;
        console.warn('[retry-failed-stamps] permanently failed:', id, r.error);
      }
    } catch (err) {
      results.failed++;
      console.error('[retry-failed-stamps] unexpected error for', id, err);
    }
  }

  return NextResponse.json({ ok: true, ...results });
}
