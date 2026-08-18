import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';

export const dynamic = 'force-dynamic';

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value;
  const session = cookie ? await verifySession(cookie) : null;
  if (!session?.portalEmail) return NextResponse.json({ error: 'session missing' }, { status: 401 });

  const { token } = await ctx.params;
  const resolved = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // IDOR guard
  if (session.portalEmail !== resolved.portalEmail)
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const supabase = createAdminClient();
  const { error } = await supabase.from('organizations').update({
    invoicing_provider: null,
    invoicing_credentials_encrypted: null,
    // NO borramos CSD paths ni columnas fiscales — trazabilidad.
    // El CSD queda en Storage pero sin ser referenciado (marca de superseded implícita).
  }).eq('portal_email', resolved.portalEmail);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Audit log — best-effort
  void supabase.from('admin_access_log').insert({
    admin_email:           session.portalEmail,
    endpoint:              '/api/portal/[token]/invoicing/disconnect',
    method:                'DELETE',
    affected_portal_email: resolved.portalEmail,
    query_type:            'delete',
    filters:               { action: 'invoicing.disconnect' },
  });

  return NextResponse.json({ ok: true });
}
