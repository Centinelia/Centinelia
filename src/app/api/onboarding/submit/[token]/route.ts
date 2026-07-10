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
    const { sendEmail } = await import('@/lib/email/send');
    const baseUrl   = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
    const portalUrl = agent.portal_token
      ? `${baseUrl}/portal/${agent.portal_token}?tab=oficina`
      : baseUrl;

    await sendEmail({
      to:      agent.client_email as string,
      subject: `Onboarding completado: ${body.contact_name ?? 'Contacto'}`,
      html:    `<!DOCTYPE html><html><body style="background:#120726;margin:0;padding:32px;font-family:Arial,sans-serif">
        <div style="max-width:480px;margin:0 auto;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:28px;color:#e2e8f0">
          <h2 style="margin:0 0 12px;font-size:18px">Onboarding enviado</h2>
          <p style="color:rgba(255,255,255,0.6);font-size:13px;margin:0 0 20px">Un contacto completó su formulario de onboarding en <strong>${agent.business_name}</strong>.</p>
          <a href="${portalUrl}" style="display:inline-block;background:linear-gradient(135deg,#6C3BFF,#9B6DFF);color:#fff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px">Ver en el portal</a>
        </div>
      </body></html>`,
    });
  }

  return NextResponse.json({ ok: true });
}
