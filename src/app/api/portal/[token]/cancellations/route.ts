// src/app/api/portal/[token]/cancellations/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';
import { solicitarCancelacion } from '@/lib/invoicing/solicitar-cancelacion';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ token: string }> };

/** GET ?factura_request_id=<id>  — returns the pending cancellation record for a factura */
export async function GET(req: NextRequest, ctx: Ctx) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { token } = await ctx.params;
  const supabase  = createAdminClient();
  const agent     = await getPrimaryAgentFromToken<{ id: string; portal_email: string | null }>(
    token, 'id, portal_email', supabase,
  );
  if (!agent) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (agent.portal_email && auth.portalEmail && agent.portal_email !== auth.portalEmail) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const portalEmail = agent.portal_email ?? auth.portalEmail ?? null;
  if (!portalEmail) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const facturaRequestId = req.nextUrl.searchParams.get('factura_request_id');
  if (!facturaRequestId) return NextResponse.json({ error: 'factura_request_id requerido' }, { status: 400 });

  const { data: cx } = await supabase
    .from('cfdi_cancellations')
    .select('id, motivo, uuid_cancelado, uuid_sustituto, razon_cliente, status, created_at')
    .eq('factura_request_id', facturaRequestId)
    .eq('organization_email', portalEmail)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  return NextResponse.json({ cancellation: cx ?? null });
}

/** POST — human creates a cancellation request from the portal */
export async function POST(req: NextRequest, ctx: Ctx) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { token } = await ctx.params;
  const supabase  = createAdminClient();
  const agent     = await getPrimaryAgentFromToken<{ id: string; portal_email: string | null }>(
    token, 'id, portal_email', supabase,
  );
  if (!agent) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (agent.portal_email && auth.portalEmail && agent.portal_email !== auth.portalEmail) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const portalEmail = agent.portal_email ?? auth.portalEmail ?? null;
  if (!portalEmail) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json() as {
    uuid_o_folio_corto: string;
    motivo: '01' | '02' | '03' | '04';
    uuid_sustituto?: string;
    razon_cliente?: string;
  };

  const r = await solicitarCancelacion(body, {
    agentId: agent.id,
    portalEmail,
    supabase,
    channel: 'portal',
  });
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
