import { createAdminClient } from '@/lib/supabase/admin';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ResolvedOrg {
  portalEmail: string;
  /** Token per-org actual — el que debe usarse en URLs a partir de ahora. */
  orgToken:    string;
  /** true si el token recibido vino de voice_agents.portal_token (URL legacy). */
  legacy:      boolean;
}

/**
 * Resuelve un token de portal → org.
 *
 * Prueba primero `organizations.portal_token` (nuevo, per-org).
 * Fallback: `voice_agents.portal_token` (legacy per-agent) → recupera
 * `portal_email` → busca la org.
 *
 * Retorna null si el token no matchea nada.
 *
 * El caller decide qué hacer con `legacy`:
 * - Server components de portal → `redirect(\`/portal/\${resolved.orgToken}\${rest}\`, 'replace')`
 * - API routes → aceptar (retrocompat) sin redirect.
 */
export async function resolveOrgFromToken(token: string): Promise<ResolvedOrg | null> {
  const supabase = createAdminClient();

  const { data: org } = await supabase
    .from('organizations')
    .select('portal_email, portal_token')
    .eq('portal_token', token)
    .maybeSingle() as { data: { portal_email: string; portal_token: string } | null };

  if (org) {
    return { portalEmail: org.portal_email, orgToken: org.portal_token, legacy: false };
  }

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('portal_email')
    .eq('portal_token', token)
    .maybeSingle() as { data: { portal_email: string | null } | null };

  if (!agent?.portal_email) return null;

  const { data: legacyOrg } = await supabase
    .from('organizations')
    .select('portal_token')
    .eq('portal_email', agent.portal_email)
    .maybeSingle() as { data: { portal_token: string } | null };

  if (!legacyOrg) return null;

  return { portalEmail: agent.portal_email, orgToken: legacyOrg.portal_token, legacy: true };
}

/**
 * ⚠️ USAR SOLO PARA SCOPING ORG-LEVEL (portal_email, business_name, plan, features del org).
 * NO usar cuando necesitas EL agente específico al que apunta el token.
 * Para lookup per-agent estricto usa {@link getAgentByToken}.
 *
 * Retorna el "primer agente activo" del org al que apunta {token} (MIN created_at).
 * Determinístico pero arbitrario — sin concepto de "primario" post-migración org-level.
 *
 * Reemplazo directo del patrón viejo:
 *   `.from('voice_agents').select(COLS).eq('portal_token', token).single()`
 *
 * Diferencias vs viejo:
 * - Acepta AMBOS formatos de token (nuevo org token corto o legacy UUID).
 * - Con legacy UUID, retorna el PRIMER agente del org (NO el agente que tenía ese token).
 *   Esto ES el bug "primary vs peer" para callers que hacen `.eq('agent_id', agent.id)`
 *   downstream — el efecto es que solo el primary responde por su token, no los peers.
 *   Pero al menos la ruta no rompe la nav global.
 * - Retorna null si el token no matchea O si el org no tiene agentes activos.
 *
 * Callers que hacen `.eq('agent_id', agent.id)` downstream deberían:
 *   (a) usar {@link getAgentByToken} si es lookup per-agent explícito, o
 *   (b) refactorizar el filtro a org-scoped (ej: JOIN voice_agents by portal_email
 *       y filtrar `.eq('portal_email', resolved.portalEmail)`).
 *
 * @param token Token de la URL (org token corto o legacy UUID).
 * @param columns String de columnas para el `select()`. Default: `'*'`.
 * @param supabaseClient Opcional — reutilizar cliente ya creado.
 */
export async function getPrimaryAgentFromToken<T = Record<string, unknown>>(
  token:           string,
  columns:         string          = '*',
  supabaseClient?: SupabaseClient,
): Promise<T | null> {
  const resolved = await resolveOrgFromToken(token);
  if (!resolved) return null;

  const supabase = supabaseClient ?? createAdminClient();
  const { data } = await supabase
    .from('voice_agents')
    .select(columns)
    .eq('portal_email', resolved.portalEmail)
    .eq('active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle() as { data: T | null };

  return data;
}

/**
 * Retorna el `organizations.portal_token` (nuevo canonical URL token) para
 * un {portalEmail}. Usar cuando construyas URLs de portal en emails, WhatsApp,
 * PDFs, notificaciones — todo lo que llega al usuario final.
 *
 * NO usar `agent.portal_token` (legacy UUID per-agent) directamente, porque:
 * (a) es una URL entre N distintas para el mismo org (fragmenta bookmarks),
 * (b) mantiene vivo el redirect en proxy.ts como safety net permanente en vez
 *     de solo transición.
 *
 * Retorna null si el email no matchea ningún org (típicamente demos sin
 * portal_email). Caller decide fallback.
 */
export async function getOrgToken(
  portalEmail:     string,
  supabaseClient?: SupabaseClient,
): Promise<string | null> {
  const supabase = supabaseClient ?? createAdminClient();
  const { data } = await supabase
    .from('organizations')
    .select('portal_token')
    .eq('portal_email', portalEmail)
    .maybeSingle() as { data: { portal_token: string } | null };
  return data?.portal_token ?? null;
}

/**
 * Lookup per-agent ESTRICTO: retorna el agente cuyo `voice_agents.portal_token`
 * es exactamente {token} (formato legacy UUID).
 *
 * Cuándo usarlo (vs {@link getPrimaryAgentFromToken}):
 * - Estás en una página que edita/lee UN agente específico (ej. configurar del
 *   agent bound to URL, contract-signing per empleado, etc.).
 * - El caller hace `.eq('agent_id', agent.id)` o `.update({...}).eq('id', agent.id)`.
 *
 * Comportamiento por tipo de token:
 * - **Legacy UUID de voice_agents.portal_token**: retorna EL agente correspondiente.
 * - **Nuevo org token corto**: retorna `null` — no hay forma de saber qué peer
 *   quiso decir el caller. El caller DEBE proveer el agent_id explícitamente
 *   (typicamente vía query param o body).
 *
 * Retorna null si el token no matchea O si es org token (ambiguo).
 *
 * @param token Token de la URL.
 * @param columns Columnas para el `select()`. Default `'*'`.
 * @param supabaseClient Opcional.
 */
export async function getAgentByToken<T = Record<string, unknown>>(
  token:           string,
  columns:         string          = '*',
  supabaseClient?: SupabaseClient,
): Promise<T | null> {
  const supabase = supabaseClient ?? createAdminClient();
  const { data } = await supabase
    .from('voice_agents')
    .select(columns)
    .eq('portal_token', token)
    .maybeSingle() as { data: T | null };

  return data;
}
