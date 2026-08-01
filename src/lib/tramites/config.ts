import type { createAdminClient } from '@/lib/supabase/admin';
import type { Tramite } from './types';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export async function getActiveTramitesForOrg(
  portalEmail: string,
  supabase:    SupabaseClient,
): Promise<Tramite[]> {
  const { data, error } = await supabase
    .from('external_tramites')
    .select('*')
    .eq('portal_email', portalEmail)
    .eq('activo', true)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[tramites] getActiveTramitesForOrg', error);
    return [];
  }
  return (data ?? []) as Tramite[];
}

export async function getTramiteById(
  id:          string,
  portalEmail: string,
  supabase:    SupabaseClient,
): Promise<Tramite | null> {
  const { data } = await supabase
    .from('external_tramites')
    .select('*')
    .eq('id', id)
    .eq('portal_email', portalEmail)  // defensa IDOR: nunca confiar solo en el id
    .maybeSingle();
  return (data as Tramite | null) ?? null;
}
