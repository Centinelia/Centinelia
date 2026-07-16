import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient }        from '@/lib/supabase/admin';
import { cookies }                  from 'next/headers';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { MEERKAT_MAP, type MeerkatRoleId } from '@/lib/portal/meerkat-roles';
import { randomUUID }               from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session || session.isSubUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const body = await req.json() as { meerkat_role_id: MeerkatRoleId; agent_name?: string };
  const { meerkat_role_id, agent_name } = body;

  const role = MEERKAT_MAP[meerkat_role_id];
  if (!role) return NextResponse.json({ error: 'Invalid role' }, { status: 400 });

  const supabase = createAdminClient();

  const { data: base } = await supabase
    .from('voice_agents')
    .select(`
      portal_email, portal_password, client_name, client_email,
      business_name, business_description, plan,
      stripe_customer_id, billing_status, active, timezone,
      organization_mission, service_definition, speech_style,
      auto_refill_enabled, auto_refill_threshold, auto_refill_minutes,
      minutes_reset_date, minutes_plan, minutes_included
    `)
    .eq('portal_token', token)
    .single();

  if (!base) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (session.portalEmail && base.portal_email && session.portalEmail !== base.portal_email) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const newToken   = randomUUID();
  const agentName  = agent_name?.trim() || (role.id === 'custom' ? 'Empleado' : role.nombre);
  const features   = {
    ...role.features,
    role_color:      role.color,
    meerkat_role_id: role.id,
    ...(role.imagen ? { avatar: role.imagen } : {}),
  };

  const { data: newAgent, error } = await supabase
    .from('voice_agents')
    .insert({
      portal_email:          base.portal_email,
      portal_password:       base.portal_password,
      client_name:           base.client_name,
      client_email:          base.client_email,
      portal_token:          newToken,
      business_name:         base.business_name,
      business_description:  base.business_description,
      plan:                  base.plan,
      minutes_included:      base.minutes_included,
      minutes_plan:          base.minutes_plan,
      minutes_used:          0,
      minutes_reset_date:    base.minutes_reset_date,
      stripe_customer_id:    base.stripe_customer_id,
      billing_status:        base.billing_status,
      active:                base.active,
      timezone:              base.timezone ?? 'America/Monterrey',
      organization_mission:  base.organization_mission,
      service_definition:    base.service_definition,
      speech_style:          base.speech_style,
      auto_refill_enabled:   base.auto_refill_enabled,
      auto_refill_threshold: base.auto_refill_threshold,
      auto_refill_minutes:   base.auto_refill_minutes,
      onboarding_completed:  true,
      agent_name:            agentName,
      role:                  role.id === 'custom' ? null : role.rol,
      features,
      giro_template:         'general',
      phone_number:          '',
      capture_leads:         false,
      capture_appointments:  false,
      capture_orders:        false,
      wa_messages_included:  0,
      wa_messages_used:      0,
    })
    .select('portal_token')
    .single();

  if (error) {
    console.error('Error creating agent:', error);
    return NextResponse.json({ error: 'Failed to create agent' }, { status: 500 });
  }

  return NextResponse.json({ token: newAgent.portal_token });
}
