import type { SupabaseClient } from '@supabase/supabase-js';
import type { DirectoryPerson } from '@/lib/helpdesk/folio';

/**
 * Directory helpers — fuente única de verdad para personas de la organización.
 *
 * organizations.directory reemplaza voice_agents.team_numbers (que ahora está
 * en migración a deprecated) y a las columnas dropped directorio_interno /
 * guardia_schedule que vivían en voice_agents.
 */

export async function loadOrgDirectory(
  portalEmail: string | null | undefined,
  supabase: SupabaseClient,
): Promise<DirectoryPerson[]> {
  if (!portalEmail) return [];
  const { data } = await supabase
    .from('organizations')
    .select('directory')
    .eq('portal_email', portalEmail)
    .single();
  return ((data as any)?.directory ?? []) as DirectoryPerson[];
}

/** Compat: shape { number, name, is_owner } que espera el código legacy. */
export function toTeamNumbers(directory: DirectoryPerson[]): Array<{ number: string; name?: string; is_owner?: boolean }> {
  return directory
    .filter(p => p.is_owner || p.is_team)
    .map(p => ({
      number: p.phone,
      ...(p.name       ? { name: p.name }     : {}),
      ...(p.is_owner   ? { is_owner: true }   : {}),
    }));
}

/** Personas consultables para asignación de tickets por Neo (tiene expertise definida). */
export function getHelpdeskExperts(directory: DirectoryPerson[]): DirectoryPerson[] {
  return directory.filter(p => (p.helpdesk_expertise ?? '').trim().length > 0);
}

/** Personas disponibles para horario de guardia. */
export function getOnCallCandidates(directory: DirectoryPerson[]): DirectoryPerson[] {
  return directory.filter(p => p.on_call);
}
