/**
 * Graph engineering — state machine formal para contract_drafts.
 * Estados:
 *   borrador   — creado, editable
 *   enviado    — enviado al cliente (por correo o link)
 *   firmado    — cliente firmó (terminal ok)
 *   cancelado  — dueño canceló (terminal)
 *   rechazado  — cliente rechazó (terminal)
 */
import type { createAdminClient } from '@/lib/supabase/admin';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export type ContractStatus = 'borrador' | 'enviado' | 'firmado' | 'cancelado' | 'rechazado';

export const CONTRACT_VALID_TRANSITIONS: Record<ContractStatus | 'null', ContractStatus[]> = {
  null:      ['borrador'],
  borrador:  ['enviado', 'cancelado'],
  enviado:   ['firmado', 'rechazado', 'cancelado'],
  firmado:   [],
  cancelado: [],
  rechazado: [],
};

const TERMINAL: readonly ContractStatus[] = ['firmado', 'cancelado', 'rechazado'];

export function isContractTerminal(s: ContractStatus): boolean {
  return TERMINAL.includes(s);
}

export function canTransitionContract(from: ContractStatus | null, to: ContractStatus): boolean {
  const key = (from ?? 'null') as ContractStatus | 'null';
  return CONTRACT_VALID_TRANSITIONS[key]?.includes(to) ?? false;
}

export interface ContractTransitionOptions {
  supabase:    SupabaseClient;
  contractId:  string;
  toStatus:    ContractStatus;
  actor:       string;
  reason:      string;
  metadata?:   Record<string, unknown>;
  extraFields?: Record<string, unknown>;
  soft?:       boolean;
}

export async function transitionContract(opts: ContractTransitionOptions): Promise<{ ok: boolean; from: ContractStatus | null; to: ContractStatus; error?: string }> {
  const { supabase, contractId, toStatus, actor, reason, metadata, extraFields, soft } = opts;

  const { data: current, error: readErr } = await supabase
    .from('contract_drafts')
    .select('status')
    .eq('id', contractId)
    .single();

  if (readErr || !current) {
    return { ok: false, from: null, to: toStatus, error: readErr?.message ?? 'contract not found' };
  }

  const fromStatus = current.status as ContractStatus | null;

  if (!canTransitionContract(fromStatus, toStatus)) {
    const msg = `Transición inválida: ${fromStatus ?? 'null'} → ${toStatus}`;
    if (!soft) {
      console.warn('[state-machine/contract]', msg, { contractId, actor, reason });
      return { ok: false, from: fromStatus, to: toStatus, error: msg };
    }
    console.warn('[state-machine/contract] SOFT:', msg, { contractId, actor, reason });
  }

  const updates: Record<string, unknown> = { status: toStatus, ...(extraFields ?? {}) };
  const { error: updErr } = await supabase.from('contract_drafts').update(updates).eq('id', contractId);
  if (updErr) return { ok: false, from: fromStatus, to: toStatus, error: updErr.message };

  const { error: transErr } = await supabase.from('contract_state_transitions').insert({
    contract_id: contractId,
    from_status: fromStatus,
    to_status:   toStatus,
    actor,
    reason,
    metadata:    metadata ?? null,
  });
  if (transErr) console.warn('[state-machine/contract] transition log failed:', transErr.message);

  return { ok: true, from: fromStatus, to: toStatus };
}

export async function recordContractCreation(opts: {
  supabase:      SupabaseClient;
  contractId:    string;
  actor:         string;
  reason:        string;
  metadata?:     Record<string, unknown>;
}): Promise<void> {
  const { supabase, contractId, actor, reason, metadata } = opts;
  const { error } = await supabase.from('contract_state_transitions').insert({
    contract_id: contractId,
    from_status: null,
    to_status:   'borrador',
    actor,
    reason,
    metadata:    metadata ?? null,
  });
  if (error) console.warn('[state-machine/contract] initial log failed:', error.message);
}
