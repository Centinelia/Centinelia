export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';

interface Params { params: Promise<{ token: string }> }

const CAPABILITIES = ['calendar_google', 'calendar_microsoft'] as const;

async function guard(token: string) {
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const resolved = await resolveOrgFromToken(token);
  if (!resolved) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  if (session.portalEmail !== resolved.portalEmail) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 403 }) };
  }
  return { session, resolved };
}

// GET — cuentas de Calendar conectadas para un empleado
// ?agentId=<uuid> requerido
export async function GET(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const agentId = req.nextUrl.searchParams.get('agentId');
  if (!agentId) return NextResponse.json({ error: 'agentId requerido' }, { status: 400 });

  const g = await guard(token);
  if ('error' in g) return g.error;

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id')
    .eq('id', agentId)
    .eq('portal_email', g.resolved.portalEmail)
    .maybeSingle();
  if (!agent) return NextResponse.json({ error: 'Empleado no válido' }, { status: 403 });

  const { data } = await supabase
    .from('integration_accounts')
    .select('provider, capability, account_label, status, expires_at')
    .eq('agent_id', agentId)
    .in('capability', CAPABILITIES as unknown as string[])
    .neq('status', 'disconnected');

  const accounts = (data ?? []).map((r) => ({
    provider:     r.provider,       // 'google' | 'microsoft'
    capability:   r.capability,     // 'calendar_google' | 'calendar_microsoft'
    email:        r.account_label,
    needs_reauth: r.status === 'needs_reauth',
    expires_at:   r.expires_at,
  }));

  return NextResponse.json({ accounts });
}

// DELETE — desconecta una cuenta Calendar de un empleado
// body: { agentId, provider: 'google' | 'microsoft' }
export async function DELETE(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const body = await req.json() as { agentId?: string; provider?: 'google' | 'microsoft' };
  const { agentId, provider } = body;
  if (!agentId || (provider !== 'google' && provider !== 'microsoft')) {
    return NextResponse.json({ error: 'agentId y provider requeridos' }, { status: 400 });
  }

  const g = await guard(token);
  if ('error' in g) return g.error;

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id')
    .eq('id', agentId)
    .eq('portal_email', g.resolved.portalEmail)
    .maybeSingle();
  if (!agent) return NextResponse.json({ error: 'Empleado no válido' }, { status: 403 });

  await supabase.from('integration_accounts')
    .delete()
    .eq('agent_id', agentId)
    .eq('provider', provider)
    .eq('capability', `calendar_${provider}`);

  return NextResponse.json({ ok: true });
}
