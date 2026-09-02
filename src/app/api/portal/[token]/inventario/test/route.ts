/**
 * Portal API — probar conexión al archivo Excel de inventario.
 *
 * Resuelve el contexto (config + token Microsoft), intenta leer la primera fila
 * de la tabla histórica y devuelve un resumen. Sirve para validar en el portal
 * que Nami ya puede operar sin ejecutar tools reales.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import { requirePortalAccess } from '@/lib/portal/access';
import { rateLimit, limiters } from '@/lib/ratelimit';
import { resolveInventoryContext, GraphExcel } from '@/lib/inventory/adapter';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const limited = await rateLimit(req, limiters.chat);
  if (limited) return limited;

  const gate = await requirePortalAccess(req, { ownerOnly: true });
  if (!gate.ok) return gate.response;

  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await ctx.params;
  const resolved  = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'Token inválido.' }, { status: 401 });

  if (session.portalEmail !== resolved.portalEmail)
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });

  const supabase = createAdminClient();
  const ctxRes = await resolveInventoryContext(resolved.portalEmail, supabase);
  if ('error' in ctxRes) {
    return NextResponse.json({ ok: false, error: ctxRes.error, message: ctxRes.message }, { status: 400 });
  }

  try {
    const headers = await GraphExcel.getTableHeader(ctxRes.token, ctxRes.config.location, ctxRes.config.sheets.historico.table);
    return NextResponse.json({
      ok:            true,
      encabezados:   headers,
      total_headers: headers.length,
      hoja:          ctxRes.config.sheets.historico.name,
      tabla:         ctxRes.config.sheets.historico.table,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      ok:      false,
      error:   'graph_read_failed',
      message: `No se pudo leer el archivo. Verifica el ID y que Microsoft esté conectado. Detalle: ${message.slice(0, 300)}`,
    }, { status: 400 });
  }
}
