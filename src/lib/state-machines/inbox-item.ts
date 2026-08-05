/**
 * Graph engineering — state machine formal para ops_inbox (bandeja).
 * Mismo patrón que agent-task.ts.
 *
 * Estados:
 *   pending          — clasificado, espera revisión humana o approval
 *   auto_replied     — respuesta enviada sin humano (classifier aprobó)
 *   info_requested   — se le pidió más info al cliente, esperando respuesta
 *   skipped          — spam confirmado o irrelevante (terminal)
 *   approved         — humano aprobó y se envió
 *   rejected         — humano rechazó la respuesta propuesta (terminal)
 *   archived         — cerrado sin acción (terminal)
 *
 * Grafo:
 *   [start]
 *     ├─→ pending          (needs human review)
 *     ├─→ auto_replied     (classifier decidió send + envió)
 *     ├─→ info_requested   (needs info from customer, waiting reply)
 *     └─→ skipped          (spam)
 *   pending          ──→ approved | rejected | archived | info_requested
 *   info_requested   ──→ pending (customer replied, needs reprocess) | archived (expired)
 *   auto_replied     ──→ rejected (user flagged as bad) | (terminal ok)
 *   approved | rejected | skipped | archived: terminales
 */
import type { createAdminClient } from '@/lib/supabase/admin';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export type InboxStatus =
  | 'pending'
  | 'auto_replied'
  | 'info_requested'
  | 'skipped'
  | 'approved'
  | 'rejected'
  | 'archived'
  | 'escalated';    // legacy: correo que fue escalado a humano en el flujo viejo

export const INBOX_VALID_TRANSITIONS: Record<InboxStatus | 'null', InboxStatus[]> = {
  null:            ['pending', 'auto_replied', 'info_requested', 'skipped', 'escalated'],
  pending:         ['approved', 'rejected', 'archived', 'info_requested', 'auto_replied', 'escalated'],
  info_requested:  ['pending', 'archived', 'escalated'],
  auto_replied:    ['rejected', 'archived'],
  escalated:       ['approved', 'rejected', 'archived'],
  skipped:         [],
  approved:        [],
  rejected:        [],
  archived:        [],
};

const TERMINAL_STATES: readonly InboxStatus[] = ['skipped', 'approved', 'rejected', 'archived'];

export function isInboxTerminal(s: InboxStatus): boolean {
  return TERMINAL_STATES.includes(s);
}

export function canTransitionInbox(from: InboxStatus | null, to: InboxStatus): boolean {
  const key = (from ?? 'null') as InboxStatus | 'null';
  return INBOX_VALID_TRANSITIONS[key]?.includes(to) ?? false;
}

export interface InboxTransitionOptions {
  supabase:  SupabaseClient;
  inboxId:   string;
  toStatus:  InboxStatus;
  actor:     string;
  reason:    string;
  metadata?: Record<string, unknown>;
  extraFields?: Record<string, unknown>;
  soft?:     boolean;
}

export interface InboxTransitionResult {
  ok:   boolean;
  from: InboxStatus | null;
  to:   InboxStatus;
  transitionId?: string;
  error?: string;
}

export async function transitionInboxItem(opts: InboxTransitionOptions): Promise<InboxTransitionResult> {
  const { supabase, inboxId, toStatus, actor, reason, metadata, extraFields, soft } = opts;

  const { data: current, error: readErr } = await supabase
    .from('ops_inbox')
    .select('status')
    .eq('id', inboxId)
    .single();

  if (readErr || !current) {
    return { ok: false, from: null, to: toStatus, error: readErr?.message ?? 'inbox item not found' };
  }

  const fromStatus = current.status as InboxStatus | null;

  if (!canTransitionInbox(fromStatus, toStatus)) {
    const msg = `Transición inválida: ${fromStatus ?? 'null'} → ${toStatus}`;
    if (!soft) {
      console.warn('[state-machine/inbox-item]', msg, { inboxId, actor, reason });
      return { ok: false, from: fromStatus, to: toStatus, error: msg };
    }
    console.warn('[state-machine/inbox-item] SOFT (proceeding):', msg, { inboxId, actor, reason });
  }

  const updates: Record<string, unknown> = { status: toStatus, ...(extraFields ?? {}) };
  const { error: updErr } = await supabase.from('ops_inbox').update(updates).eq('id', inboxId);
  if (updErr) return { ok: false, from: fromStatus, to: toStatus, error: updErr.message };

  const { data: transitionRow, error: transErr } = await supabase
    .from('inbox_state_transitions')
    .insert({
      inbox_id:     inboxId,
      from_status:  fromStatus,
      to_status:    toStatus,
      actor,
      reason,
      metadata:     metadata ?? null,
    })
    .select('id')
    .single();

  if (transErr) {
    console.warn('[state-machine/inbox-item] transition log insert failed:', transErr.message);
  }

  return { ok: true, from: fromStatus, to: toStatus, transitionId: transitionRow?.id as string | undefined };
}

/** Registra el estado inicial de un ops_inbox recién creado. Usa este helper después del INSERT. */
export async function recordInboxCreation(opts: {
  supabase:      SupabaseClient;
  inboxId:       string;
  initialStatus: InboxStatus;
  actor:         string;
  reason:        string;
  metadata?:     Record<string, unknown>;
}): Promise<void> {
  const { supabase, inboxId, initialStatus, actor, reason, metadata } = opts;
  const { error } = await supabase.from('inbox_state_transitions').insert({
    inbox_id:     inboxId,
    from_status:  null,
    to_status:    initialStatus,
    actor,
    reason,
    metadata:     metadata ?? null,
  });
  if (error) {
    console.warn('[state-machine/inbox-item] initial creation record failed:', error.message);
  }
}
