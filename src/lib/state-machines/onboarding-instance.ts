/**
 * Graph engineering — state machine para onboarding_instances.
 * (Naia envía onboarding a clientes nuevos de un negocio.)
 *
 * Estados:
 *   pendiente  — Naia envió link, esperando cliente
 *   en_proceso — cliente subió/respondió, esperando revisión del dueño
 *   completado — dueño cerró (terminal)
 *   cancelado  — dueño canceló antes de completar (terminal)
 */
import type { createAdminClient } from '@/lib/supabase/admin';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export type OnboardingStatus = 'pendiente' | 'en_proceso' | 'completado' | 'cancelado';

export const ONBOARDING_VALID_TRANSITIONS: Record<OnboardingStatus | 'null', OnboardingStatus[]> = {
  null:       ['pendiente'],
  pendiente:  ['en_proceso', 'cancelado'],
  en_proceso: ['completado', 'cancelado', 'pendiente'],  // pendiente = pedir más info
  completado: [],
  cancelado:  [],
};

const TERMINAL: readonly OnboardingStatus[] = ['completado', 'cancelado'];

export function isOnboardingTerminal(s: OnboardingStatus): boolean {
  return TERMINAL.includes(s);
}

export function canTransitionOnboarding(from: OnboardingStatus | null, to: OnboardingStatus): boolean {
  const key = (from ?? 'null') as OnboardingStatus | 'null';
  return ONBOARDING_VALID_TRANSITIONS[key]?.includes(to) ?? false;
}

export interface OnboardingTransitionOptions {
  supabase:    SupabaseClient;
  instanceId:  string;
  toStatus:    OnboardingStatus;
  actor:       string;
  reason:      string;
  metadata?:   Record<string, unknown>;
  extraFields?: Record<string, unknown>;
  soft?:       boolean;
}

export async function transitionOnboarding(opts: OnboardingTransitionOptions): Promise<{ ok: boolean; from: OnboardingStatus | null; to: OnboardingStatus; error?: string }> {
  const { supabase, instanceId, toStatus, actor, reason, metadata, extraFields, soft } = opts;

  const { data: current, error: readErr } = await supabase
    .from('onboarding_instances')
    .select('status')
    .eq('id', instanceId)
    .single();

  if (readErr || !current) {
    return { ok: false, from: null, to: toStatus, error: readErr?.message ?? 'instance not found' };
  }

  const fromStatus = current.status as OnboardingStatus | null;

  if (!canTransitionOnboarding(fromStatus, toStatus)) {
    const msg = `Transición inválida: ${fromStatus ?? 'null'} → ${toStatus}`;
    if (!soft) {
      console.warn('[state-machine/onboarding]', msg, { instanceId, actor, reason });
      return { ok: false, from: fromStatus, to: toStatus, error: msg };
    }
    console.warn('[state-machine/onboarding] SOFT:', msg, { instanceId, actor, reason });
  }

  const updates: Record<string, unknown> = { status: toStatus, ...(extraFields ?? {}) };
  const { error: updErr } = await supabase.from('onboarding_instances').update(updates).eq('id', instanceId);
  if (updErr) return { ok: false, from: fromStatus, to: toStatus, error: updErr.message };

  const { error: transErr } = await supabase.from('onboarding_state_transitions').insert({
    instance_id: instanceId,
    from_status: fromStatus,
    to_status:   toStatus,
    actor,
    reason,
    metadata:    metadata ?? null,
  });
  if (transErr) console.warn('[state-machine/onboarding] transition log failed:', transErr.message);

  return { ok: true, from: fromStatus, to: toStatus };
}

export async function recordOnboardingCreation(opts: {
  supabase:  SupabaseClient;
  instanceId: string;
  actor:     string;
  reason:    string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { supabase, instanceId, actor, reason, metadata } = opts;
  const { error } = await supabase.from('onboarding_state_transitions').insert({
    instance_id: instanceId,
    from_status: null,
    to_status:   'pendiente',
    actor,
    reason,
    metadata:    metadata ?? null,
  });
  if (error) console.warn('[state-machine/onboarding] initial log failed:', error.message);
}
