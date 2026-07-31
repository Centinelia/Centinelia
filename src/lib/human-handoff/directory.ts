import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Genera string del directorio interno para inyectar en el system prompt del agent.
 * Lista sub-usuarios activos (no owners) con name/email/módulo.
 * Formato compacto — se pega en el prompt junto con otras secciones.
 *
 * Ejemplo output:
 *   DIRECTORIO INTERNO (para pedir_a_humano):
 *   - Roberto Jurado (roberto@x.mx) — Ventas
 *   - María López (maria@x.mx) — Diseño
 */
export async function buildInternalDirectoryString(portalEmail: string): Promise<string> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('portal_users')
    .select('name, email, modules')
    .eq('account_id', portalEmail)
    .eq('is_owner', false)
    .order('name', { ascending: true });

  if (!data || data.length === 0) return '';

  const lines = data.map(u => {
    const name = (u.name as string | null) ?? '(sin nombre)';
    const modules = (u.modules as string[] | null) ?? [];
    const areaTag = modules.length > 0 ? ` — ${modules[0]}` : '';
    return `- ${name} (${u.email})${areaTag}`;
  });

  return `DIRECTORIO INTERNO (para pedir_a_humano si necesitas ayuda de un compañero):
${lines.join('\n')}

Usa target='specific' + target_email=<correo> cuando sepas quién es el mejor.
Usa target='approver' si no sabes o dudas.`;
}
