// src/app/api/portal/[token]/cancellations/[id]/confirm/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';
import { getCsd, decryptString } from '@/lib/invoicing/csd-vault';
import { solucionFactibleProvider } from '@/lib/invoicing/solucion-factible';
import type { CancelMotivo } from '@/lib/invoicing/provider';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string; id: string }> }) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { token, id } = await ctx.params;
  const supabase = createAdminClient();

  const agent = await getPrimaryAgentFromToken<{ id: string; portal_email: string | null }>(
    token, 'id, portal_email', supabase,
  );
  if (!agent) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (agent.portal_email && auth.portalEmail && agent.portal_email !== auth.portalEmail) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const portalEmail = agent.portal_email ?? auth.portalEmail ?? null;
  if (!portalEmail) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Fetch and validate cancellation record — IDOR via organization_email
  const { data: cx } = await supabase
    .from('cfdi_cancellations')
    .select('*')
    .eq('id', id)
    .single();
  if (!cx || cx.organization_email !== portalEmail) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  if (cx.status !== 'requested') {
    return NextResponse.json({ error: `estado no válido: ${cx.status}` }, { status: 409 });
  }

  // Load CSD
  const csd = await getCsd(portalEmail, supabase);
  if (!csd) return NextResponse.json({ error: 'CSD no configurado' }, { status: 400 });

  // Load SF credentials
  const { data: org } = await supabase
    .from('organizations')
    .select('invoicing_credentials_encrypted, invoicing_test_mode')
    .eq('portal_email', portalEmail)
    .single();
  if (!org?.invoicing_credentials_encrypted) {
    return NextResponse.json({ error: 'credenciales SF no configuradas' }, { status: 400 });
  }
  const creds = JSON.parse(decryptString(org.invoicing_credentials_encrypted)) as {
    usuario: string;
    password: string;
  };

  // Call SF cancelar — may throw (network / SOAP fault)
  let result: Awaited<ReturnType<typeof solucionFactibleProvider.cancelar>>;
  try {
    result = await solucionFactibleProvider.cancelar(
      cx.uuid_cancelado as string,
      cx.motivo as CancelMotivo,
      (cx.uuid_sustituto as string | null) ?? null,
      creds,
      csd,
      { testMode: org.invoicing_test_mode !== false },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Error comunicando con PAC: ${msg}` }, { status: 502 });
  }

  const newStatus = result.status === 'sent_to_sat' ? 'sent_to_sat' : 'rejected';

  // Persist result
  await supabase
    .from('cfdi_cancellations')
    .update({
      status:               newStatus,
      sat_status_last_check: new Date().toISOString(),
      notes:                result.message ?? null,
    })
    .eq('id', id);

  // Audit log — best-effort
  void supabase.from('policy_audit_log').insert({
    agent_id:   cx.requested_by_agent_id ?? agent.id,
    capability: 'cfdi_cancelacion',
    action:     'submit',
    status:     newStatus === 'sent_to_sat' ? 'completed' : 'failed',
    details:    {
      uuid:    cx.uuid_cancelado,
      motivo:  cx.motivo,
      message: result.message ?? null,
    },
  });

  void supabase.from('admin_access_log').insert({
    admin_email:           auth.portalEmail,
    endpoint:              '/api/portal/[token]/cancellations/[id]/confirm',
    method:                'POST',
    affected_portal_email: portalEmail,
    query_type:            'modify',
    filters:               { cancellation_id: id, sf_status: result.status },
  });

  return NextResponse.json({ ok: true, ...result });
}
