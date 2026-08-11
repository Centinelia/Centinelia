/**
 * Atomic claim helper para crons scheduleados. Evita que 2 lambdas paralelas
 * (deploy race Vercel HH:00) procesen el mismo cron con side-effects
 * duplicados (2× emails, 2× LLM ops, 2× WhatsApps).
 *
 * Uso:
 *   const claim = await claimCronRun(supabase, 'weekly-summary');
 *   if (!claim.ok) return NextResponse.json({ ok: true, skipped: claim.reason });
 *   // ... trabajo ...
 *   await releaseCronRun(supabase, 'weekly-summary');
 *
 * Design: UPSERT ON CONFLICT DO UPDATE con guard temporal — solo actualiza si
 * la última claim fue hace >windowMs (evita false-lock si el cron previo
 * crashó y quedó "held" indefinidamente).
 *
 * Ver Scope C2 F15.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ClaimResult {
  ok:     boolean;
  reason?: 'already_running' | 'db_error';
}

const DEFAULT_LOCK_WINDOW_MS = 5 * 60 * 1000;  // 5 min de safety net

export async function claimCronRun(
  supabase: SupabaseClient,
  cronName: string,
  windowMs: number = DEFAULT_LOCK_WINDOW_MS,
): Promise<ClaimResult> {
  const now = new Date().toISOString();

  // Intento 1: INSERT nuevo lock (primera vez que corre este cron).
  const { error: insertErr } = await supabase
    .from('cron_locks')
    .insert({ cron_name: cronName, claimed_at: now });

  if (!insertErr) return { ok: true };
  if (insertErr.code !== '23505') {
    console.error(`[cron-lock] insert failed for ${cronName}:`, insertErr);
    return { ok: false, reason: 'db_error' };
  }

  // Existe row — intentar re-claim SOLO si el claim previo es viejo (>windowMs).
  const cutoff = new Date(Date.now() - windowMs).toISOString();
  const { data: updated } = await supabase
    .from('cron_locks')
    .update({ claimed_at: now })
    .eq('cron_name', cronName)
    .lt('claimed_at', cutoff)
    .select('cron_name')
    .maybeSingle();

  if (updated) return { ok: true };
  return { ok: false, reason: 'already_running' };
}

export async function releaseCronRun(
  supabase: SupabaseClient,
  cronName: string,
): Promise<void> {
  await supabase
    .from('cron_locks')
    .update({ last_run_at: new Date().toISOString() })
    .eq('cron_name', cronName);
}
