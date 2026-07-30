import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

interface Params { params: Promise<{ token: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { token } = await params;
  const supabase  = createAdminClient();

  const { data: instance } = await supabase
    .from('onboarding_instances')
    .select('id, contact_name, status, template_id, onboarding_templates(name, steps, document_requests, notes)')
    .eq('submit_token', token)
    .single();

  if (!instance) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ instance });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const supabase  = createAdminClient();

  const { data: instance } = await supabase
    .from('onboarding_instances')
    .select('id, status, agent_id')
    .eq('submit_token', token)
    .single();

  if (!instance) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (instance.status === 'completado') {
    return NextResponse.json({ error: 'Ya completado' }, { status: 400 });
  }

  const body = await req.json();
  const { submitted_docs, responses } = body;

  await supabase
    .from('onboarding_instances')
    .update({
      submitted_docs: submitted_docs ?? [],
      responses:      responses ?? {},
      status:         'en_proceso',
      submitted_at:   new Date().toISOString(),
    })
    .eq('id', instance.id);

  // Notify agent owner
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('client_email, business_name, portal_token')
    .eq('id', instance.agent_id)
    .single();

  if (agent?.client_email) {
    const { sendEmail, shell, heading, infoCard, btn } = await import('@/lib/email/send');
    const baseUrl   = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
    const portalUrl = agent.portal_token
      ? `${baseUrl}/portal/${agent.portal_token}?tab=oficina`
      : baseUrl;

    await sendEmail({
      to:      agent.client_email as string,
      subject: `Onboarding completado: ${body.contact_name ?? 'Contacto'}`,
      html:    shell(
        heading('Onboarding completado', agent.business_name as string) +
        infoCard(`<p style="color:#F1EEFF;font-size:14px;line-height:1.7;margin:0">Un contacto (<strong>${body.contact_name ?? 'sin nombre'}</strong>) completó su formulario de onboarding.</p>`) +
        btn('Ver en el portal →', portalUrl)
      ),
    });
  }

  return NextResponse.json({ ok: true });
}
