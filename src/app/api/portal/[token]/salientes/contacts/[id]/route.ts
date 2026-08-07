import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getAgentAccess } from '@/lib/portal/agent-access';

interface Params { params: Promise<{ token: string; id: string }> }

/**
 * PATCH — actualiza tags o motivo de un contacto individual.
 * Body: { tags?: string[]; motivo?: string; nombre?: string }
 *
 * Scope: solo contactos de agentes del portal_email de la sesión.
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

  const body = await req.json() as { tags?: unknown; motivo?: string; nombre?: string; email?: string };

  const update: Record<string, unknown> = {};

  if (Array.isArray(body.tags)) {
    // Sanitiza: strings no-vacíos, trim, lowercase, dedupe, cap 20 tags
    const cleaned = Array.from(new Set(
      body.tags
        .filter((t): t is string => typeof t === 'string')
        .map(t => t.trim().toLowerCase())
        .filter(t => t.length > 0 && t.length <= 40)
    )).slice(0, 20);
    update.tags = cleaned;
  }

  if (typeof body.motivo === 'string') update.motivo = body.motivo.trim() || null;
  if (typeof body.nombre === 'string') update.nombre = body.nombre.trim() || null;
  if (typeof body.email  === 'string') update.email  = body.email.trim().toLowerCase() || null;

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
