import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAgentByToken } from '@/lib/portal/org-token';

export const dynamic = 'force-dynamic';

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const agent = await getAgentByToken<{ portal_email: string }>(token, 'portal_email');
  if (!agent) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const supabase = createAdminClient();
  const { error } = await supabase.from('organizations').update({
    invoicing_provider: null,
    invoicing_credentials_encrypted: null,
    // NO borramos CSD paths ni columnas fiscales — trazabilidad.
    // El CSD queda en Storage pero sin ser referenciado (marca de superseded implícita).
  }).eq('portal_email', agent.portal_email);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Audit log — best-effort
  void supabase.from('admin_access_log').insert({
    admin_email:           agent.portal_email,
    endpoint:              '/api/portal/[token]/invoicing/disconnect',
    method:                'DELETE',
    affected_portal_email: agent.portal_email,
    query_type:            'delete',
    filters:               { action: 'invoicing.disconnect' },
  });

  return NextResponse.json({ ok: true });
}
