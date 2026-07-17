import type { SupabaseClient } from '@supabase/supabase-js';

export type AccountStatus = 'active' | 'warned' | 'suspended' | 'terminated';

export interface AccountGuard {
  status:        AccountStatus;
  canOperate:    boolean;  // false when suspended or terminated
  canUseOffice:  boolean;  // false only when terminated
  reason:        string | null;
}

const UNBLOCKED: AccountGuard = { status: 'active', canOperate: true, canUseOffice: true, reason: null };

export async function checkAccount(
  portalEmail: string | null | undefined,
  supabase: SupabaseClient,
): Promise<AccountGuard> {
  if (!portalEmail) return UNBLOCKED;

  const { data: org } = await supabase
    .from('organizations')
    .select('account_status, suspended_until, suspension_reason, termination_reason')
    .eq('portal_email', portalEmail)
    .single();

  if (!org) return UNBLOCKED;

  const status = org.account_status as AccountStatus;

  if (status === 'terminated') {
    return {
      status,
      canOperate:   false,
      canUseOffice: false,
      reason: org.termination_reason ?? 'Contrato rescindido.',
    };
  }

  if (status === 'suspended') {
    // Auto-lift if temporal suspension has expired
    if (org.suspended_until && new Date(org.suspended_until) < new Date()) {
      await supabase
        .from('organizations')
        .update({ account_status: 'active', suspended_until: null })
        .eq('portal_email', portalEmail);
      return UNBLOCKED;
    }
    return {
      status,
      canOperate:   false,
      canUseOffice: true,   // office works unless terminated
      reason: org.suspension_reason ?? 'Cuenta suspendida.',
    };
  }

  return { status, canOperate: true, canUseOffice: true, reason: null };
}

// Convenience: returns a 403 JSON body when blocked, null when allowed.
export function blockedResponse(guard: AccountGuard, context: 'operate' | 'office' = 'operate') {
  const blocked = context === 'office' ? !guard.canUseOffice : !guard.canOperate;
  if (!blocked) return null;
  return { error: `Cuenta ${guard.status === 'terminated' ? 'rescindida' : 'suspendida'}. ${guard.reason ?? ''}`.trim() };
}
