import { logRoutingTransition } from './routing-log';
import { notifyFallbackRestored } from './fallback-notify';
import type { createAdminClient } from '@/lib/supabase/admin';

type SB = ReturnType<typeof createAdminClient>;

export async function resetFallbackIfActive(
  supabase: SB,
  portalEmail: string,
  agentName: string,
): Promise<{ wasActive: boolean }> {
  const { data: org } = await supabase
    .from('organizations')
    .select('fallback_notified_at, fallback_phone_number, transfer_whatsapp, guardia_schedule, minutes_reset_date')
    .eq('portal_email', portalEmail)
    .single();

  if (!org?.fallback_notified_at) return { wasActive: false };

  await supabase.from('organizations')
    .update({ fallback_notified_at: null })
    .eq('portal_email', portalEmail);

  await logRoutingTransition(supabase, {
    portal_email: portalEmail,
    transition:   'fallback_restored',
  });

  await notifyFallbackRestored(supabase, {
    portal_email:          portalEmail,
    fallback_phone_number: (org.fallback_phone_number as string | null) ?? '',
    fallback_notified_at:  org.fallback_notified_at as string,
    minutes_reset_date:    (org.minutes_reset_date as string | null) ?? null,
    transfer_whatsapp:     (org.transfer_whatsapp as string | null) ?? null,
    guardia_principal:     ((org as any).guardia_schedule?.principal as string | null) ?? null,
  }, agentName);

  return { wasActive: true };
}
