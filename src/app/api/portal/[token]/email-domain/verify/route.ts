import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';

interface Params { params: Promise<{ token: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, portal_email, resend_domain_id')
    .eq('portal_token', token)
    .single();
  if (!agent) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  if (!agent.resend_domain_id) {
    return NextResponse.json({ error: 'No hay dominio registrado' }, { status: 400 });
  }

  // Trigger Resend verification check
  const verifyRes = await fetch(`https://api.resend.com/domains/${agent.resend_domain_id}/verify`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
  });

  // Fetch updated domain status
  const statusRes = await fetch(`https://api.resend.com/domains/${agent.resend_domain_id}`, {
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
  });
  const domainData = await statusRes.json();
  const verified   = domainData.status === 'verified';

  if (verified) {
    await supabase
      .from('voice_agents')
      .update({ email_domain_verified: true, resend_dns_records: domainData.records })
      .eq('portal_email', agent.portal_email);
  }

  return NextResponse.json({
    verified,
    status:      domainData.status,
    dns_records: domainData.records ?? [],
  });
}
