import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import type { DirectoryPerson } from '@/lib/helpdesk/folio';

interface Params { params: Promise<{ token: string }> }

async function getOrgEmail(token: string, _supabase: ReturnType<typeof createAdminClient>) {
  const resolved = await resolveOrgFromToken(token);
  return resolved?.portalEmail ?? undefined;
}

export async function GET(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();
  const portalEmail = await getOrgEmail(token, supabase);
  if (!portalEmail) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  if (auth.portalEmail && auth.portalEmail !== portalEmail)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { data: org } = await supabase
    .from('organizations').select('directory').eq('portal_email', portalEmail).single();

  return NextResponse.json({ directory: (org as any)?.directory ?? [] });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();
  const portalEmail = await getOrgEmail(token, supabase);
  if (!portalEmail) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  if (auth.portalEmail && auth.portalEmail !== portalEmail)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const body = await req.json() as { directory?: DirectoryPerson[] };
  const clean: DirectoryPerson[] = (body.directory ?? [])
    // Aceptar personas con phone O email (los autorizadores de OC pueden no tener teléfono)
    .filter(p => p && ((typeof p.phone === 'string' && p.phone.trim()) || (typeof p.email === 'string' && p.email.trim())))
    .slice(0, 200)
    .map(p => ({
      id:                 typeof p.id === 'string' && p.id ? p.id : crypto.randomUUID(),
      name:               (p.name ?? '').trim(),
      phone:              (p.phone ?? '').trim(),
      ...(p.email              ? { email:              p.email.trim() }              : {}),
      ...(p.extension          ? { extension:          p.extension.trim() }          : {}),
      ...(p.department         ? { department:         p.department.trim() }         : {}),
      ...(p.role               ? { role:               p.role.trim() }               : {}),
      ...(p.is_owner           ? { is_owner:           true }                        : {}),
      ...(p.is_team            ? { is_team:            true }                        : {}),
      ...(p.helpdesk_expertise ? { helpdesk_expertise: p.helpdesk_expertise.trim() } : {}),
      ...(p.on_call            ? { on_call:            true }                        : {}),
      // Flags pack ciclo_oc_cfdi
      ...(p.is_oc_autorizador  ? { is_oc_autorizador:  true }                        : {}),
      ...(p.is_oc_pagos        ? { is_oc_pagos:        true }                        : {}),
      // Contacto de operaciones (encargado de envíos / dispatcher / coordinador
      // de servicio). Noah lo usa en el flow de seguimientos cuando el cliente
      // reporta problemas con la entrega.
      ...(p.is_operations_contact    ? { is_operations_contact:    true }            : {}),
      ...(p.receives_incident_reports ? { receives_incident_reports: true }          : {}),
    }));

  // Sub-users no pueden modificar/eliminar al dueño (defense in depth — el gate
  // en el UI también lo previene).
  if (auth.isSubUser) {
    const { data: current } = await supabase
      .from('organizations').select('directory').eq('portal_email', portalEmail).single();
    const prevOwner = ((current as any)?.directory ?? [] as DirectoryPerson[])
      .find((p: DirectoryPerson) => p.is_owner);
    const newOwner  = clean.find(p => p.is_owner);
    const ownerChanged =
      (prevOwner && !newOwner) ||
      (!prevOwner && newOwner) ||
      (prevOwner && newOwner && (prevOwner.phone !== newOwner.phone || prevOwner.name !== newOwner.name));
    if (ownerChanged) {
      return NextResponse.json({ error: 'No autorizado para modificar dueño' }, { status: 403 });
    }
  }

  const { error } = await supabase
    .from('organizations')
    .update({ directory: clean } as any)
    .eq('portal_email', portalEmail);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, directory: clean });
}
