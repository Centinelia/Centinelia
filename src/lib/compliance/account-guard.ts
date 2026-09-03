import type { SupabaseClient } from '@supabase/supabase-js';

export type AccountStatus = 'active' | 'warned' | 'suspended' | 'terminated';

export interface AccountGuard {
  status:        AccountStatus;
  canOperate:    boolean;  // false when suspended, terminated, or demo_paused
  canUseOffice:  boolean;  // false when terminated or demo_paused
  reason:        string | null;
  demoPaused:    boolean;  // true si el bloqueo viene de kill switch operativo, no de incumplimiento
}

const UNBLOCKED: AccountGuard = { status: 'active', canOperate: true, canUseOffice: true, reason: null, demoPaused: false };

export async function checkAccount(
  portalEmail: string | null | undefined,
  supabase: SupabaseClient,
): Promise<AccountGuard> {
  if (!portalEmail) return UNBLOCKED;

  const { data: org } = await supabase
    .from('organizations')
    .select('account_status, suspended_until, suspension_reason, termination_reason, demo_paused')
    .eq('portal_email', portalEmail)
    .single();

  if (!org) return UNBLOCKED;

  const status      = org.account_status as AccountStatus;
  const demoPaused  = Boolean(org.demo_paused);

  // account_status pesa más que demo_paused: si una org está terminada o
  // suspendida por incumplimiento, ese semantic (con correo previamente enviado
  // al cliente) manda sobre el kill switch operativo.
  if (status === 'terminated') {
    return {
      status,
      canOperate:   false,
      canUseOffice: false,
      reason: org.termination_reason ?? 'Contrato rescindido.',
      demoPaused,
    };
  }

  if (status === 'suspended') {
    // Auto-lift if temporal suspension has expired
    if (org.suspended_until && new Date(org.suspended_until) < new Date()) {
      await supabase
        .from('organizations')
        .update({ account_status: 'active', suspended_until: null })
        .eq('portal_email', portalEmail);
      // Si el kill switch operativo sigue activo, respeta ese bloqueo.
      if (demoPaused) {
        return {
          status: 'active',
          canOperate:   false,
          canUseOffice: false,
          reason: 'Piloto en pausa temporal por el equipo de Centinelia.',
          demoPaused: true,
        };
      }
      return UNBLOCKED;
    }
    return {
      status,
      canOperate:   false,
      canUseOffice: true,   // office works unless terminated
      reason: org.suspension_reason ?? 'Cuenta suspendida.',
      demoPaused,
    };
  }

  // Kill switch operativo (piloto/demo). Bloquea voz + outbound + oficina,
  // sin correo automático. Recuperación: SET demo_paused = FALSE.
  if (demoPaused) {
    return {
      status,
      canOperate:   false,
      canUseOffice: false,
      reason: 'Piloto en pausa temporal por el equipo de Centinelia.',
      demoPaused: true,
    };
  }

  return { status, canOperate: true, canUseOffice: true, reason: null, demoPaused: false };
}

// Convenience: returns a 403 JSON body when blocked, null when allowed.
export function blockedResponse(guard: AccountGuard, context: 'operate' | 'office' = 'operate') {
  const blocked = context === 'office' ? !guard.canUseOffice : !guard.canOperate;
  if (!blocked) return null;
  if (guard.demoPaused) {
    return { error: guard.reason ?? 'Piloto en pausa temporal por el equipo de Centinelia.' };
  }
  return { error: `Cuenta ${guard.status === 'terminated' ? 'rescindida' : 'suspendida'}. ${guard.reason ?? ''}`.trim() };
}
