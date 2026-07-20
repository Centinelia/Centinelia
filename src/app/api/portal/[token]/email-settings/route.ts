import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';

interface Params { params: Promise<{ token: string }> }

// email_logo_url stays per-agent; brand fields live in organizations
const AGENT_ALLOWED  = ['email_logo_url'] as const;
const ORG_ALLOWED    = ['email_brand_color', 'email_footer_text'] as const;
const ALL_ALLOWED    = [...AGENT_ALLOWED, ...ORG_ALLOWED] as const;

export async function GET(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, portal_email, business_name, email_from, email_logo_url, email_domain_verified, resend_domain_id, resend_dns_records')
    .eq('portal_token', token)
    .single();

  if (!agent) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  // Brand fields come from organizations
  const { data: org } = agent.portal_email
    ? await supabase.from('organizations').select('email_brand_color, email_footer_text').eq('portal_email', agent.portal_email).single()
    : { data: null };

  // If domain is registered, refresh DNS records from Resend to show live status
  if (agent.resend_domain_id) {
    try {
      const res = await fetch(`https://api.resend.com/domains/${agent.resend_domain_id}`, {
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      });
      if (res.ok) {
        const domain = await res.json();
        const verified = domain.status === 'verified';

        if (verified && !agent.email_domain_verified) {
          await supabase
            .from('voice_agents')
            .update({ email_domain_verified: true, resend_dns_records: domain.records })
            .eq('portal_email', agent.portal_email);
        }

        return NextResponse.json({
          email_from:             agent.email_from,
          email_logo_url:         agent.email_logo_url,
          email_brand_color:      org?.email_brand_color   ?? null,
          email_footer_text:      org?.email_footer_text   ?? null,
          email_domain_verified:  verified,
          resend_domain_id:       agent.resend_domain_id,
          dns_records:            domain.records ?? agent.resend_dns_records ?? [],
          domain_status:          domain.status,
        });
      }
    } catch { /* fall through to cached data */ }
  }

  return NextResponse.json({
    email_from:            agent.email_from,
    email_logo_url:        agent.email_logo_url,
    email_brand_color:     org?.email_brand_color  ?? null,
    email_footer_text:     org?.email_footer_text  ?? null,
    email_domain_verified: agent.email_domain_verified,
    resend_domain_id:      agent.resend_domain_id,
    dns_records:           agent.resend_dns_records ?? [],
    domain_status:         agent.email_domain_verified ? 'verified' : agent.resend_domain_id ? 'pending' : null,
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const body      = await req.json();
  const supabase  = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, portal_email')
    .eq('portal_token', token)
    .single();
  if (!agent) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  const agentUpdate = Object.fromEntries(
    Object.entries(body).filter(([k]) => (AGENT_ALLOWED as readonly string[]).includes(k)),
  );
  const orgUpdate = Object.fromEntries(
    Object.entries(body).filter(([k]) => (ORG_ALLOWED as readonly string[]).includes(k)),
  );

  if (Object.keys(agentUpdate).length === 0 && Object.keys(orgUpdate).length === 0)
    return NextResponse.json({ ok: true });

  await Promise.all([
    Object.keys(agentUpdate).length > 0
      ? supabase.from('voice_agents').update(agentUpdate).eq('portal_email', agent.portal_email)
      : Promise.resolve(),
    Object.keys(orgUpdate).length > 0 && agent.portal_email
      ? supabase.from('organizations').upsert({ portal_email: agent.portal_email, ...orgUpdate }, { onConflict: 'portal_email' })
      : Promise.resolve(),
  ]);

  return NextResponse.json({ ok: true });
}
