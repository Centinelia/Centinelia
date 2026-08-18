export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse }      from 'next/server';
import { cookies }                        from 'next/headers';
import { createAdminClient }             from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE }  from '@/lib/portal/auth';
import { getAgentAccess }                from '@/lib/portal/agent-access';

interface Params { params: Promise<{ token: string }> }

// Inbox = org-scoped (consistente con la decisión tomada en email-oauth):
// todos los meerkats de un org comparten las conexiones de correo del negocio.
// Ver [[handoff-peer-discrimination-fix]] B2 email integrations.

// GET — list email connections del roster completo del org
export async function GET(req: NextRequest, { params }: Params) {
  const { token }   = await params;
  const cookieStore = await cookies();
  const session     = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const access = await getAgentAccess(token, req);
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail && access.portalEmail !== session.portalEmail)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const supabase = createAdminClient();
  const { data } = await supabase
    .from('email_integrations')
    .select('id, provider, email, last_sync_at, needs_reauth, send_as_email')
    .in('agent_id', access.ids);

  // Filtrar leftovers de conexiones org-level (mismo email/provider en
  // integration_accounts). El callback nuevo ya no las escribe, pero registros
  // históricos siguen ahí hasta que el owner los desconecte desde Integraciones.
  let filtered = data ?? [];
  if (filtered.length > 0) {
    const { data: orgAccounts } = await supabase
      .from('integration_accounts')
      .select('provider, account_label')
      .eq('portal_email', access.portalEmail)
      .eq('capability', 'email')
      .neq('status', 'disconnected');

    const orgKeys = new Set(
      (orgAccounts ?? []).map(a => `${a.provider}:${(a.account_label ?? '').toLowerCase()}`),
    );
    filtered = filtered.filter(
      row => !orgKeys.has(`${row.provider}:${(row.email ?? '').toLowerCase()}`),
    );
  }

  return NextResponse.json({ connections: filtered });
}

// PATCH — update send_as_email para el provider en TODOS los peers del org.
export async function PATCH(req: NextRequest, { params }: Params) {
  const { token }   = await params;
  const cookieStore = await cookies();
  const session     = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { provider, send_as_email } = (await req.json()) as { provider: string; send_as_email: string | null };
  const access = await getAgentAccess(token, req);
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail && access.portalEmail !== session.portalEmail)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const value = send_as_email?.trim() || null;

  const supabase = createAdminClient();
  await supabase
    .from('email_integrations')
    .update({ send_as_email: value })
    .in('agent_id', access.ids)
    .eq('provider', provider);

  return NextResponse.json({ ok: true });
}

// DELETE — disconnect el provider en TODOS los peers del org.
export async function DELETE(req: NextRequest, { params }: Params) {
  const { token }   = await params;
  const cookieStore = await cookies();
  const session     = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { provider } = (await req.json()) as { provider: string };
  const access = await getAgentAccess(token, req);
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail && access.portalEmail !== session.portalEmail)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const supabase = createAdminClient();
  await supabase
    .from('email_integrations')
    .delete()
    .in('agent_id', access.ids)
    .eq('provider', provider);

  return NextResponse.json({ ok: true });
}
