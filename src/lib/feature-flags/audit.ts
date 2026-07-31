import { createAdminClient } from '@/lib/supabase/admin';
import type { FlagRow, FlagAction } from './types';

export async function writeFlagAudit(input: {
  flag_key: string;
  actor:    string;
  action:   FlagAction;
  before:   FlagRow | null;
  after:    FlagRow | null;
}): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from('feature_flag_audit').insert({
    flag_key: input.flag_key,
    actor:    input.actor,
    action:   input.action,
    before:   input.before,
    after:    input.after,
  });
  if (error) {
    // Audit fail no debe bloquear la operación admin, pero sí loggear alto.
    console.error('[feature-flags] audit write failed', {
      flag_key: input.flag_key,
      action:   input.action,
      error:    error.message,
    });
  }
}
