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
    .filter(p => (p.is_owner || p.is_team) && (p.phone ?? '').trim().length > 0)
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

/**
 * Bloque de roster inyectable al system prompt en voz, chat y correo.
 * Fuente única de verdad: organizations.directory. Reemplaza el reconocimiento
 * "por memoria de llamadas previas" con reconocimiento pasivo por nombre.
 *
 * Personas sin nombre se omiten (solo son un teléfono, no aportan nada).
 * Orden: dueños → equipo → resto (especialistas helpdesk o guardia).
 */
export function renderOrgTeamRoster(directory: DirectoryPerson[]): string {
  const named = directory.filter(p => (p.name ?? '').trim().length > 0);
  if (!named.length) return '';

  const rank = (p: DirectoryPerson) => (p.is_owner ? 0 : p.is_team ? 1 : 2);
  const sorted = [...named].sort((a, b) => rank(a) - rank(b));

  const lines = sorted.map(p => {
    const tags: string[] = [];
    if (p.is_owner) tags.push('dueño');
    if (p.is_team)  tags.push('equipo');
    if (p.on_call)  tags.push('guardia');

    const roleParts: string[] = [];
    if (p.role?.trim())       roleParts.push(p.role.trim());
    if (p.department?.trim()) roleParts.push(p.department.trim());
    const roleStr = roleParts.length ? ` — ${roleParts.join(', ')}` : '';

    const phoneStr = p.phone
      ? ` — Tel: ${p.phone}${p.extension?.trim() ? ` (ext. ${p.extension.trim()})` : ''}`
      : '';

    const tagStr = tags.length ? ` [${tags.join(', ')}]` : '';

    const expertiseStr = p.helpdesk_expertise?.trim()
      ? ` · experto en: ${p.helpdesk_expertise.trim()}`
      : '';

    return `- ${p.name}${roleStr}${phoneStr}${tagStr}${expertiseStr}`;
  });

  return `EQUIPO HUMANO DE LA ORGANIZACIÓN:
Estas son las personas reales que trabajan aquí. Reconócelas por nombre en cualquier canal (voz, chat, correo). Cuando alguien las mencione o llame, ya sabes quiénes son y qué rol cumplen — no preguntes lo que ya está aquí.
${lines.join('\n')}`;
}

/** Carga + render en un solo paso. Devuelve '' si no hay directorio o no hay nombres. */
export async function buildOrgTeamRosterString(
  portalEmail: string | null | undefined,
  supabase: SupabaseClient,
): Promise<string> {
  const directory = await loadOrgDirectory(portalEmail, supabase);
  return renderOrgTeamRoster(directory);
}

/**
 * Sincroniza un sub-usuario (portal_users) al directorio de la organización.
 * Usa el uuid del portal_user como DirectoryPerson.id para poder actualizar/borrar.
 * Preserva campos que el dueño haya llenado manualmente (role, department, phone, etc.);
 * solo pisa `name` y marca `is_team: true`.
 */
export async function upsertPortalUserInDirectory(
  accountId: string,
  userId: string,
  name: string | null,
  supabase: SupabaseClient,
): Promise<void> {
  const nameStr = (name ?? '').trim();
  const { data } = await supabase
    .from('organizations')
    .select('directory')
    .eq('portal_email', accountId)
    .maybeSingle();
  if (!data) return;

  const current = ((data as any).directory as DirectoryPerson[] | null) ?? [];
  const idx = current.findIndex(p => p.id === userId);

  if (idx >= 0) {
    if (!nameStr) return; // sub-usuario sin nombre → no pisamos el que ya haya
    current[idx] = { ...current[idx], name: nameStr, is_team: true };
  } else {
    if (!nameStr) return; // no crear entrada anónima; se agrega cuando tenga nombre
    current.push({ id: userId, name: nameStr, phone: '', is_team: true });
  }

  await supabase
    .from('organizations')
    .update({ directory: current })
    .eq('portal_email', accountId);
}

/** Remueve del directorio la entrada auto-creada para un sub-usuario. */
export async function removePortalUserFromDirectory(
  accountId: string,
  userId: string,
  supabase: SupabaseClient,
): Promise<void> {
  const { data } = await supabase
    .from('organizations')
    .select('directory')
    .eq('portal_email', accountId)
    .maybeSingle();
  if (!data) return;

  const current = ((data as any).directory as DirectoryPerson[] | null) ?? [];
  const next = current.filter(p => p.id !== userId);
  if (next.length === current.length) return;

  await supabase
    .from('organizations')
    .update({ directory: next })
    .eq('portal_email', accountId);
}
