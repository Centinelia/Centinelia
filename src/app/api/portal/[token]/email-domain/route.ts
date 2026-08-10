import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';

interface Params { params: Promise<{ token: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const { email } = await req.json();
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Correo inválido' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const agent = await getPrimaryAgentFromToken<{
    id: string;
    portal_email: string | null;
    resend_domain_id: string | null;
  }>(token, 'id, portal_email, resend_domain_id', supabase);
  if (!agent) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  if (auth.portalEmail && agent.portal_email && auth.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const domain = email.split('@')[1].toLowerCase();

  // Register domain in Resend (under Centinelia's account)
  const res = await fetch('https://api.resend.com/domains', {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: domain, region: 'us-east-1' }),
  });

  const data = await res.json();

  if (!res.ok) {
    // Domain already exists in this Resend account — fetch it
    if (data.name === 'domain_already_exists' && agent.resend_domain_id) {
      const existing = await fetch(`https://api.resend.com/domains/${agent.resend_domain_id}`, {
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      });
      const existingData = await existing.json();
      return NextResponse.json({ dns_records: existingData.records ?? [], domain_id: agent.resend_domain_id });
    }
    return NextResponse.json({ error: data.message ?? 'Error al registrar dominio' }, { status: 400 });
  }

  // Save domain info to all agents of this account
  await supabase
    .from('voice_agents')
    .update({
      email_from:            email,
      resend_domain_id:      data.id,
      resend_dns_records:    data.records ?? [],
      email_domain_verified: false,
    })
    .eq('portal_email', agent.portal_email);

  return NextResponse.json({ dns_records: data.records ?? [], domain_id: data.id });
}
