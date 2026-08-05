import { createAdminClient } from '@/lib/supabase/admin';

// orgId = portal_email (primary key of organizations table)
export async function isPortalV2Enabled(orgId: string): Promise<boolean> {
  if (!orgId) return false;
  const supa = createAdminClient();
  const { data, error } = await supa
    .from('organizations')
    .select('portal_v2_enabled')
    .eq('portal_email', orgId)
    .maybeSingle();
  if (error || !data) return false;
  return data.portal_v2_enabled === true;
}
