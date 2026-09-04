/**
 * agent-mailboxes/lock.ts — Lease-based lock por agent_id para evitar que
 * dos ticks solapados del cron /api/cron/agent-mailboxes procesen el mismo
 * inbox IMAP simultáneamente.
 *
 * Mecanismo idéntico a writer-consumer/lock.ts (portal_email → agent_id).
 *
 * TTL 360s (6min) > maxDuration 300s + cadence 10min → un tick lento no
 * expira mientras aún procesa, y otro tick lo verá activo → skip limpio.
 * Si el proceso muere, expira solo tras 6 min y otro tick lo agarra.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

export const AGENT_MAILBOX_LOCK_TTL_SECONDS = 360;

export interface AgentLockHandle {
  agentId:  string;
  holderId: string;
}

export async function acquireAgentMailboxLock(
  supabase: SupabaseClient,
  agentId:  string,
): Promise<AgentLockHandle | null> {
  const holderId    = randomUUID();
  const lockedUntil = new Date(Date.now() + AGENT_MAILBOX_LOCK_TTL_SECONDS * 1000).toISOString();
  const nowIso      = new Date().toISOString();

  // Paso 1: intentar UPDATE atómico de un lock expirado.
  const { data: updated } = await supabase
    .from('agent_mailboxes_lock')
    .update({ locked_until: lockedUntil, holder_id: holderId, acquired_at: nowIso })
    .eq('agent_id', agentId)
    .lt('locked_until', nowIso)
    .select()
    .maybeSingle();

  if (updated) return { agentId, holderId };

  // Paso 2: no existía o no había expirado. Intentar INSERT.
  const { data: inserted, error } = await supabase
    .from('agent_mailboxes_lock')
    .insert({ agent_id: agentId, locked_until: lockedUntil, holder_id: holderId })
    .select()
    .maybeSingle();

  if (inserted) return { agentId, holderId };

  // 23505 = unique_violation → alguien más lo tomó ahora mismo. Skip.
  if (error && error.code !== '23505') {
    console.warn(`[agent-mailboxes/lock] acquire failed for ${agentId} code ${error.code}: ${error.message}`);
  }
  return null;
}

export async function releaseAgentMailboxLock(
  supabase: SupabaseClient,
  handle:   AgentLockHandle,
): Promise<void> {
  await supabase
    .from('agent_mailboxes_lock')
    .delete()
    .eq('agent_id',  handle.agentId)
    .eq('holder_id', handle.holderId);
}
