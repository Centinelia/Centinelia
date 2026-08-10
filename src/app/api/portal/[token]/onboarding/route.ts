import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';
import { sendOnboardingWelcome, sendOnboardingStatusUpdate } from '@/lib/ops/onboarding-mailer';
import { randomUUID } from 'crypto';

interface Params { params: Promise<{ token: string }> }

async function getAgentIds(supabase: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>, portalEmail: string | null) {
  if (!portalEmail) return [];
  const { data } = await supabase.from('voice_agents').select('id').eq('portal_email', portalEmail);
  return (data ?? []).map(a => a.id as string);
}

export async function GET(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();
  const { searchParams } = new URL(req.url);
  const view = searchParams.get('view') ?? 'templates';

  const acct = await getPrimaryAgentFromToken<{ id: string; portal_email: string | null }>(token, 'id, portal_email', supabase);
  if (!acct) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  if (auth.portalEmail && acct.portal_email && auth.portalEmail !== acct.portal_email)
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const agentIds = await getAgentIds(supabase, acct.portal_email);

  if (view === 'instances') {
    const { data } = await supabase
      .from('onboarding_instances')
      .select('*, onboarding_templates(name, steps)')
      .in('agent_id', agentIds)
      .order('created_at', { ascending: false })
      .limit(100);
    return NextResponse.json({ instances: data ?? [] });
  }

  const { data: templates } = await supabase
    .from('onboarding_templates')
    .select('*')
    .in('agent_id', agentIds)
    .order('created_at', { ascending: true });

  return NextResponse.json({ templates: templates ?? [] });
}

export async function POST(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();
  const body      = await req.json();

  const acct = await getPrimaryAgentFromToken<{ id: string; portal_email: string | null; business_name: string; client_email: string | null }>(token, 'id, portal_email, business_name, client_email', supabase);
  if (!acct) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  if (auth.portalEmail && acct.portal_email && auth.portalEmail !== acct.portal_email)
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const agentIds = await getAgentIds(supabase, acct.portal_email);
  const targetId = body.agent_id ?? acct.id;
  if (!agentIds.includes(targetId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Create template
  if (body.action === 'create_template') {
    const { name, type, steps, document_requests, notes } = body;
    if (!name || !steps?.length) return NextResponse.json({ error: 'Faltan campos' }, { status: 400 });

    const { data: tpl, error } = await supabase
      .from('onboarding_templates')
      .insert({
        agent_id:           targetId,
        name,
        type:               type ?? 'empleado',
        steps:              steps ?? [],
        document_requests:  document_requests ?? [],
        notes:              notes ?? null,
      })
      .select('id')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: tpl.id });
  }

  // Create instance (send onboarding to someone)
  if (body.action === 'create_instance') {
    const { template_id, contact_name, contact_email } = body;
    if (!template_id || !contact_name || !contact_email) return NextResponse.json({ error: 'Faltan campos' }, { status: 400 });

    const { data: tpl } = await supabase
      .from('onboarding_templates')
      .select('name, steps, document_requests, notes')
      .eq('id', template_id)
      .in('agent_id', agentIds)
      .single();
    if (!tpl) return NextResponse.json({ error: 'Template not found' }, { status: 404 });

    const submitToken = randomUUID();
    const baseUrl     = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
    const submitUrl   = `${baseUrl}/onboarding/${submitToken}`;

    const { data: instance, error } = await supabase
      .from('onboarding_instances')
      .insert({
        agent_id:        targetId,
        template_id,
        contact_name,
        contact_email,
        submit_token:    submitToken,
        status:          'pendiente',
        submitted_docs:  [],
      })
      .select('id')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Send welcome email
    await sendOnboardingWelcome({
      to:           contact_email,
      clientName:   contact_name,
      businessName: acct.business_name as string,
      templateName: tpl.name as string,
      submitUrl,
      steps:        tpl.steps as string[],
      notes:        tpl.notes as string | null,
    });

    return NextResponse.json({ ok: true, id: instance.id, submitUrl });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();
  const body      = await req.json();

  const acct = await getPrimaryAgentFromToken<{ id: string; portal_email: string | null; business_name: string }>(token, 'id, portal_email, business_name', supabase);
  if (!acct) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  if (auth.portalEmail && acct.portal_email && auth.portalEmail !== acct.portal_email)
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const agentIds = await getAgentIds(supabase, acct.portal_email);

  // Update template
  if (body.type === 'template') {
    const allowed = ['name', 'type', 'steps', 'document_requests', 'notes', 'active'];
    const update  = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));

    await supabase
      .from('onboarding_templates')
      .update(update)
      .eq('id', body.id)
      .in('agent_id', agentIds);

    return NextResponse.json({ ok: true });
  }

  // Update instance status
  if (body.type === 'instance') {
    const { data: instance } = await supabase
      .from('onboarding_instances')
      .select('contact_name, contact_email, template_id')
      .eq('id', body.id)
      .in('agent_id', agentIds)
      .single();

    if (!instance) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await supabase
      .from('onboarding_instances')
      .update({ status: body.status, internal_notes: body.internal_notes ?? null })
      .eq('id', body.id);

    // Email the contact on status change
    if (body.notify_contact && instance.contact_email) {
      const { data: tpl } = await supabase
        .from('onboarding_templates')
        .select('name')
        .eq('id', instance.template_id)
        .single();

      await sendOnboardingStatusUpdate({
        to:           instance.contact_email as string,
        clientName:   instance.contact_name as string,
        businessName: acct.business_name as string,
        templateName: (tpl?.name as string) ?? 'Onboarding',
        status:       body.status,
        notes:        body.internal_notes ?? null,
      });
    }

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();
  const body      = await req.json();

  const acct = await getPrimaryAgentFromToken<{ id: string; portal_email: string | null }>(token, 'id, portal_email', supabase);
  if (!acct) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  if (auth.portalEmail && acct.portal_email && auth.portalEmail !== acct.portal_email)
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const agentIds = await getAgentIds(supabase, acct.portal_email);

  if (body.type === 'template') {
    await supabase.from('onboarding_templates').delete().eq('id', body.id).in('agent_id', agentIds);
  } else {
    await supabase.from('onboarding_instances').delete().eq('id', body.id).in('agent_id', agentIds);
  }

  return NextResponse.json({ ok: true });
}
