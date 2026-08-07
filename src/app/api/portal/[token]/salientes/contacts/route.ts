import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getAgentAccess } from '@/lib/portal/agent-access';
import { timingSafeCompareStrings } from '@/lib/auth/cron-auth';

interface Params { params: Promise<{ token: string }> }

async function getAgent(token: string, portalEmail: string) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('voice_agents')
    .select('id, vapi_agent_id, phone_number, business_name, features')
    .eq('portal_token', token)
    .eq('portal_email', portalEmail)
    .single();
  return data;
}

export async function GET(req: NextRequest, { params }: Params) {
  const session = await verifySession(req.cookies.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const access = await getAgentAccess(token, req);
  if (!access) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (session.portalEmail && access.portalEmail !== session.portalEmail)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { data, error } = await createAdminClient()
    .from('outbound_contacts')
    .select('id,nombre,telefono,email,motivo,source,status,fail_count,created_at,tags')
    .in('agent_id', access.ids)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest, { params }: Params) {
  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const agent = await getAgent(token, session.portalEmail);
  if (!agent) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const body = await req.json();
  const supabase = createAdminClient();

  // Supports single { nombre, telefono, email, motivo } or batch { contacts: [...] }
  const isBatch = Array.isArray(body.contacts);
  const rows = isBatch
    ? (body.contacts as Array<{ nombre?: string; telefono: string; email?: string; motivo?: string }>)
    : [{ nombre: body.nombre, telefono: body.telefono, email: body.email, motivo: body.motivo }];

  const valid = rows.filter(r => r.telefono?.trim());
  if (!valid.length) return NextResponse.json({ error: 'Se requiere al menos un teléfono válido' }, { status: 400 });

  const source = isBatch ? 'csv' : 'manual';

  const toInsert = valid.map(r => ({
    agent_id: agent.id,
    nombre:   r.nombre?.trim() || null,
    telefono: r.telefono.trim(),
    email:    r.email?.trim()  || null,
    motivo:   r.motivo?.trim() || null,
    source,
  }));

  const { data, error } = await supabase
    .from('outbound_contacts')
    .insert(toInsert)
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const agent = await getAgent(token, session.portalEmail);
  if (!agent) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const { ids, password } = await req.json() as { ids: string[]; password?: string };
  if (!ids?.length) return NextResponse.json({ error: 'Se requieren IDs' }, { status: 400 });

  // Password gate — misma env var que /api/admin/agentes/[id] DELETE.
  // Solo Nazre/owners de confianza deberían tenerla. Bloquea borrado accidental
  // de contactos por el portal.
  const expected = process.env.ADMIN_DELETE_PASSWORD;
  if (!expected) {
    return NextResponse.json({
      error: 'ADMIN_DELETE_PASSWORD no está configurado. Contacta a soporte.',
    }, { status: 500 });
  }
  const provided = (password ?? '').trim();
  const expect   = expected.trim();
  if (!provided || provided.length !== expect.length || !timingSafeCompareStrings(provided, expect)) {
    return NextResponse.json({ error: 'Contraseña incorrecta.' }, { status: 403 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('outbound_contacts')
    .delete()
    .eq('agent_id', agent.id)
    .in('id', ids);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, deleted: ids.length });
}
