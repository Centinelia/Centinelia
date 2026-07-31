import { createAdminClient } from '@/lib/supabase/admin';
import { hashBucket } from './evaluator';
import type { FlagRow, FlagCounts, EvaluatorReason } from './types';

// Dry-run: aplica `patch` sobre la fila actual (o inicial si no existe)
// y calcula qué orgs quedarían on/off. Sin persistir nada.
export async function previewFlagAssignment(
  flagKey: string,
  patch: Partial<FlagRow>,
): Promise<{ counts: FlagCounts; sample_on: string[]; sample_off: string[] }> {
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from('feature_flags')
    .select('*')
    .eq('flag_key', flagKey)
    .maybeSingle();

  const flag: FlagRow = {
    flag_key: flagKey,
    description: '',
    rollout_pct: 0,
    allowlist: [],
    denylist: [],
    killed: false,
    default_on: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    updated_by: null,
    ...(existing as Partial<FlagRow> | null),
    ...patch,
  };

  const { data: orgs } = await supabase
    .from('voice_agents')
    .select('portal_email')
    .not('portal_email', 'is', null);

  const uniqueEmails = Array.from(new Set((orgs ?? []).map(o => o.portal_email as string)));

  const counts: FlagCounts = {
    orgs_on: 0,
    orgs_off: 0,
    orgs_via_hash: 0,
    orgs_via_allowlist: 0,
    orgs_via_denylist: 0,
  };
  const sample_on: string[] = [];
  const sample_off: string[] = [];

  for (const email of uniqueEmails) {
    const { on, reason } = evaluateAgainst(flag, email);
    if (on) {
      counts.orgs_on++;
      if (sample_on.length < 10) sample_on.push(email);
    } else {
      counts.orgs_off++;
      if (sample_off.length < 10) sample_off.push(email);
    }
    if (reason === 'allowlist') counts.orgs_via_allowlist++;
    if (reason === 'denylist') counts.orgs_via_denylist++;
    if (reason === 'hash_on' || reason === 'hash_off') counts.orgs_via_hash++;
  }

  return { counts, sample_on, sample_off };
}

// Evaluator puro que opera sobre una fila dada (no cache, no DB).
function evaluateAgainst(flag: FlagRow, orgEmail: string): {
  on: boolean;
  reason: EvaluatorReason;
} {
  if (flag.killed) return { on: false, reason: 'killed' };
  if (flag.denylist.includes(orgEmail)) return { on: false, reason: 'denylist' };
  if (flag.allowlist.includes(orgEmail)) return { on: true, reason: 'allowlist' };
  const bucket = hashBucket(orgEmail, flag.flag_key);
  const on = bucket < flag.rollout_pct;
  return { on, reason: on ? 'hash_on' : 'hash_off' };
}
