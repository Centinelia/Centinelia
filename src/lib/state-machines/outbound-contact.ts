/**
 * Graph engineering — state machine para outbound_contacts.
 *
 * Estados:
 *   pending    — esperando cron pickup
 *   calling    — cron intentó marcar (Vapi call en curso)
 *   completed  — llamada contestada + procesada (terminal)
 *   no_answer  — no contestó, retry programado
 *   failed     — error irrecoverable o max fails (terminal)
 *   dnc        — do-not-call (terminal LFPDPPP)
 *
 * Grafo:
 *   [start] → pending
 *   pending    → calling | dnc
 *   calling    → completed | no_answer | failed | dnc
 *   no_answer  → pending (retry) | failed (max fails) | dnc
 *   completed | failed | dnc: terminales
 */
import type { createAdminClient } from '@/lib/supabase/admin';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export type OutboundStatus = 'pending' | 'calling' | 'completed' | 'no_answer' | 'failed' | 'dnc';

export const OUTBOUND_VALID_TRANSITIONS: Record<OutboundStatus | 'null', OutboundStatus[]> = {
  null:      ['pending'],
  pending:   ['calling', 'dnc'],
  calling:   ['completed', 'no_answer', 'failed', 'dnc'],
  no_answer: ['pending', 'failed', 'dnc'],
  completed: [],
  failed:    [],
  dnc:       [],
};

const TERMINAL: readonly OutboundStatus[] = ['completed', 'failed', 'dnc'];

export function isOutboundTerminal(s: OutboundStatus): boolean {
  return TERMINAL.includes(s);
}

export function canTransitionOutbound(from: OutboundStatus | null, to: OutboundStatus): boolean {
  const key = (from ?? 'null') as OutboundStatus | 'null';
  return OUTBOUND_VALID_TRANSITIONS[key]?.includes(to) ?? false;
}

export interface OutboundTransitionOptions {
  supabase:    SupabaseClient;
  contactId:   string;
  toStatus:    OutboundStatus;
  actor:       string;
  reason:      string;
  metadata?:   Record<string, unknown>;
  extraFields?: Record<string, unknown>;
  soft?:       boolean;
}

export async function transitionOutboundContact(opts: OutboundTransitionOptions): Promise<{ ok: boolean; from: OutboundStatus | null; to: OutboundStatus; error?: string }> {
  const { supabase, contactId, toStatus, actor, reason, metadata, extraFields, soft } = opts;

  const { data: current, error: readErr } = await supabase
    .from('outbound_contacts')
    .select('status')
    .eq('id', contactId)
    .single();

  if (readErr || !current) {
    return { ok: false, from: null, to: toStatus, error: readErr?.message ?? 'contact not found' };
  }

  const fromStatus = current.status as OutboundStatus | null;

  if (!canTransitionOutbound(fromStatus, toStatus)) {
    const msg = `Transición inválida: ${fromStatus ?? 'null'} → ${toStatus}`;
    if (!soft) {
      console.warn('[state-machine/outbound]', msg, { contactId, actor, reason });
      return { ok: false, from: fromStatus, to: toStatus, error: msg };
    }
    console.warn('[state-machine/outbound] SOFT:', msg, { contactId, actor, reason });
  }

  const updates: Record<string, unknown> = { status: toStatus, ...(extraFields ?? {}) };
  const { error: updErr } = await supabase.from('outbound_contacts').update(updates).eq('id', contactId);
  if (updErr) return { ok: false, from: fromStatus, to: toStatus, error: updErr.message };

  const { error: transErr } = await supabase.from('outbound_state_transitions').insert({
    contact_id:  contactId,
    from_status: fromStatus,
    to_status:   toStatus,
    actor,
    reason,
    metadata:    metadata ?? null,
  });
  if (transErr) console.warn('[state-machine/outbound] transition log failed:', transErr.message);

  return { ok: true, from: fromStatus, to: toStatus };
}

/** Registra el estado inicial (post-INSERT en outbound_contacts). */
export async function recordOutboundCreation(opts: {
  supabase:  SupabaseClient;
  contactId: string;
  actor:     string;
  reason:    string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { supabase, contactId, actor, reason, metadata } = opts;
  const { error } = await supabase.from('outbound_state_transitions').insert({
    contact_id:  contactId,
    from_status: null,
    to_status:   'pending',
    actor,
    reason,
    metadata:    metadata ?? null,
  });
  if (error) console.warn('[state-machine/outbound] initial log failed:', error.message);
}

/** Bulk: registra creación para muchos contactos de un solo campaign upload. */
export async function recordOutboundBulkCreation(opts: {
  supabase:   SupabaseClient;
  contactIds: string[];
  actor:      string;
  reason:     string;
  metadata?:  Record<string, unknown>;
}): Promise<void> {
  const { supabase, contactIds, actor, reason, metadata } = opts;
  if (!contactIds.length) return;
  const rows = contactIds.map(id => ({
    contact_id:  id,
    from_status: null,
    to_status:   'pending' as const,
    actor,
    reason,
    metadata:    metadata ?? null,
  }));
  const { error } = await supabase.from('outbound_state_transitions').insert(rows);
  if (error) console.warn('[state-machine/outbound] bulk log failed:', error.message);
}
