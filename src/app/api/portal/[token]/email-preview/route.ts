export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { appointmentConfirmationToClientHtml, leadFollowUpToClientHtml, type EmailBranding } from '@/lib/email/send';

interface Params { params: Promise<{ token: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return new NextResponse('No autenticado', { status: 401 });

  const { token } = await params;
  const type      = req.nextUrl.searchParams.get('type') ?? 'appointment';
  const supabase  = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('portal_email, business_name, agent_name, phone_number')
    .eq('portal_token', token)
    .single();
  if (!agent) return new NextResponse('Not found', { status: 404 });

  const { data: org } = agent.portal_email
    ? await supabase
        .from('organizations')
        .select('logo_url, email_brand_color, email_footer_text')
        .eq('portal_email', agent.portal_email)
        .maybeSingle()
    : { data: null };

  const branding: EmailBranding = {
    logoUrl:    org?.logo_url          ?? null,
    brandColor: org?.email_brand_color ?? '#6C3BFF',
    footerText: org?.email_footer_text ?? null,
    senderName: agent.business_name,
  };

  const html = type === 'appointment'
    ? appointmentConfirmationToClientHtml({
        branding,
        businessName: agent.business_name,
        agentName:    agent.agent_name ?? agent.business_name,
        clientName:   'María García',
        citaFecha:    '2026-08-05',
        citaHora:     '10:30',
        servicio:     'Consulta general',
        phone:        agent.phone_number ?? null,
      })
    : leadFollowUpToClientHtml({
        branding,
        businessName: agent.business_name,
        agentName:    agent.agent_name ?? agent.business_name,
        clientName:   'Carlos López',
        servicio:     'Cotización de servicio',
        phone:        agent.phone_number ?? null,
      });

  return new NextResponse(html, {
    headers: {
      'Content-Type':  'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
