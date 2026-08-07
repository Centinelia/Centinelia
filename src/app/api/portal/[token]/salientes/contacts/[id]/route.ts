import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getAgentAccess } from '@/lib/portal/agent-access';
import { timingSafeCompareStrings } from '@/lib/auth/cron-auth';

interface Params { params: Promise<{ token: string; id: string }> }

/**
 * PATCH — actualiza tags o campos sensibles de un contacto.
 *
 * Body: { tags?: string[]; motivo?: string; nombre?: string;
 *         telefono?: string; email?: string; password?: string }
 *
 * Password gate: si se tocan nombre/telefono/motivo/email (campos "sensibles"
 * — cambian identidad del contacto), se requiere `password` = ADMIN_DELETE_PASSWORD.
 * Los tags NO requieren password: son colaborativos (auto-tag por outcome,
 * empleados los agregan por tool).
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token, id } = await params;
  const access = await getAgentAccess(token, req);
  if (!access) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  if (session.portalEmail && access.portalEmail !== session.portalEmail)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const body = await req.json() as {
    tags?: unknown; motivo?: string; nombre?: string;
    telefono?: string; email?: string; password?: string;
  };

  const touchesSensitive =
    typeof body.motivo   === 'string' ||
    typeof body.nombre   === 'string' ||
    typeof body.telefono === 'string' ||
    typeof body.email    === 'string';

  if (touchesSensitive) {
    const expected = process.env.ADMIN_DELETE_PASSWORD;
    if (!expected) {
      return NextResponse.json({
        error: 'ADMIN_DELETE_PASSWORD no está configurado. Contacta a soporte.',
      }, { status: 500 });
    }
    const provided = (body.password ?? '').trim();
    const expect   = expected.trim();
    if (!provided || provided.length !== expect.length || !timingSafeCompareStrings(provided, expect)) {
      return NextResponse.json({ error: 'Contraseña incorrecta.' }, { status: 403 });
    }
  }

  const update: Record<string, unknown> = {};

  if (Array.isArray(body.tags)) {
    const cleaned = Array.from(new Set(
      body.tags
        .filter((t): t is string => typeof t === 'string')
        .map(t => t.trim().toLowerCase())
        .filter(t => t.length > 0 && t.length <= 40)
    )).slice(0, 20);
    update.tags = cleaned;
  }

  if (typeof body.motivo   === 'string') update.motivo   = body.motivo.trim()   || null;
  if (typeof body.nombre   === 'string') update.nombre   = body.nombre.trim()   || null;
  if (typeof body.telefono === 'string') {
    const clean = body.telefono.trim();
    if (!clean) return NextResponse.json({ error: 'El teléfono no puede estar vacío.' }, { status: 400 });
    update.telefono = clean;
  }
  if (typeof body.email    === 'string') update.email    = body.email.trim().toLowerCase() || null;

  if (!Object.keys(update).length) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('outbound_contacts')
    .update(update)
    .eq('id', id)
    .in('agent_id', access.ids)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: 'Contacto no encontrado' }, { status: 404 });
  return NextResponse.json(data);
}
