// Portal Contactos Vivos — GET (list paginado con filtros).
//
// GET /api/portal/[token]/contactos?page=0&pageSize=20&estado=activo&q=juan
//   Devuelve lista paginada de contactos_vivos con filtro por estado_actual
//   y búsqueda parcial en nombre, teléfono, correo, external_id.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';

interface Params { params: Promise<{ token: string }> }

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE     = 100;

export async function GET(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const resolved = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail !== resolved.portalEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const url        = new URL(req.url);
  const page       = Math.max(0, parseInt(url.searchParams.get('page') ?? '0', 10) || 0);
  const pageSize   = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(url.searchParams.get('pageSize') ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE));
  const estado     = url.searchParams.get('estado')?.trim() ?? null;
  const q          = url.searchParams.get('q')?.trim() ?? null;

  const supabase = createAdminClient();

  // Feature flag para saber si el pack está activo (para el UI)
  const { data: orgRow } = await supabase
    .from('organizations')
    .select('features')
    .eq('portal_email', resolved.portalEmail)
    .maybeSingle();
  const enabled = (orgRow?.features as Record<string, unknown> | undefined)?.perfiles_vivos === true;

  let query = supabase
    .from('contactos_vivos')
    .select('id, external_id, nombre, telefono, correo, estado_actual, datos_operacionales, ultima_interaccion_at, ultima_interaccion_tipo, proxima_accion_at, proxima_accion_tipo, total_interacciones, promesas_hechas, promesas_cumplidas, sentimiento_ultimo, capacidad_pago_detectada, notas, updated_at', { count: 'exact' })
    .eq('portal_email', resolved.portalEmail);

  if (estado) query = query.eq('estado_actual', estado);
  if (q) {
    // Busqueda parcial en varios campos usando OR
    const like = `%${q}%`;
    query = query.or(`nombre.ilike.${like},telefono.ilike.${like},correo.ilike.${like},external_id.ilike.${like}`);
  }

  const { data: contactos, error, count } = await query
    .order('updated_at', { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);

  if (error) return NextResponse.json({ error: `List error: ${error.message}` }, { status: 500 });

  return NextResponse.json({
    enabled,
    page,
    pageSize,
    total:      count ?? 0,
    contactos:  contactos ?? [],
  });
}
