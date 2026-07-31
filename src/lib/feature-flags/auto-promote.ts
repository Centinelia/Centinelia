import { createAdminClient } from '@/lib/supabase/admin';
import { writeFlagAudit } from './audit';
import { invalidateFlagCache } from './evaluator';
import { clearMeerkatVersionCache } from '@/lib/vapi/resolve-meerkat';
import { resyncAgentsByMeerkat } from '@/lib/vapi/resync-meerkat';
import type { FlagRow } from './types';

export const SOAK_DAYS = 7;

export function computeAt100Transition(input: {
  before: { rollout_pct: number; killed: boolean; at_100_since: string | null } | null;
  after_pct: number;
  after_killed: boolean;
  now?: Date;
}): string | null {
  const now = input.now ?? new Date();
  if (input.after_killed) return null;
  if (input.after_pct !== 100) return null;
  const b = input.before;
  if (b && b.rollout_pct === 100 && !b.killed && b.at_100_since) return b.at_100_since;
  return now.toISOString();
}

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

export async function runAutoPromote(
  supabase: SupabaseAdmin,
  opts?: { now?: Date },
): Promise<{ candidates: number; promoted: number; skipped_non_meerkat: number; errors: string[] }> {
  const now = opts?.now ?? new Date();
  const cutoff = new Date(now.getTime() - SOAK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: candidates, error } = await supabase
    .from('feature_flags')
    .select('*')
    .eq('killed', false)
    .eq('rollout_pct', 100)
    .lte('at_100_since', cutoff)
    .not('at_100_since', 'is', null);

  if (error) {
    return { candidates: 0, promoted: 0, skipped_non_meerkat: 0, errors: [error.message] };
  }

  const result = { candidates: (candidates ?? []).length, promoted: 0, skipped_non_meerkat: 0, errors: [] as string[] };

  const meerkatRe = /^meerkat\.([^.]+)\.v(\d+)$/;

  for (const flag of (candidates ?? []) as FlagRow[]) {
    const m = meerkatRe.exec(flag.flag_key);
    if (!m) {
      result.skipped_non_meerkat++;
      continue;
    }
    const meerkatId = m[1];
    const version = Number(m[2]);
    try {
      const { data: currentActive } = await supabase
        .from('meerkat_active_versions')
        .select('active_version')
        .eq('meerkat_id', meerkatId)
        .maybeSingle();
      const fromVersion = currentActive?.active_version ?? null;

      const { error: histErr } = await supabase.from('meerkat_version_history').insert({
        meerkat_id: meerkatId,
        from_version: fromVersion,
        to_version: version,
        changed_by: 'system-auto-promote',
        reason: 'auto-promote at 100%+7d',
      });
      if (histErr) throw new Error(`history insert: ${histErr.message}`);

      const { error: updErr } = await supabase
        .from('meerkat_active_versions')
        .update({
          active_version: version,
          activated_at: now.toISOString(),
          activated_by: 'system-auto-promote',
          notes: 'auto-promote at 100%+7d',
        })
        .eq('meerkat_id', meerkatId);
      if (updErr) throw new Error(`active_versions update: ${updErr.message}`);

      const { error: delErr } = await supabase.from('feature_flags').delete().eq('flag_key', flag.flag_key);
      if (delErr) throw new Error(`flag delete: ${delErr.message}`);

      await writeFlagAudit({
        flag_key: flag.flag_key,
        actor: 'system-auto-promote',
        action: 'deleted',
        before: flag,
        after: null,
      });

      invalidateFlagCache();
      clearMeerkatVersionCache();

      resyncAgentsByMeerkat(meerkatId).catch((err: Error) => {
        console.error('[auto-promote] resync failed', { meerkatId, error: err.message });
      });

      result.promoted++;
    } catch (e) {
      result.errors.push(`${flag.flag_key}: ${(e as Error).message}`);
    }
  }

  return result;
}
