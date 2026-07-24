import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { createVapiAssistant } from '@/lib/vapi/sync';
import { provisionPhoneNumber } from '@/lib/vapi/provision';
import { JORNADA_CONFIG } from '@/lib/billing/plans';
import { PLAN_CONCURRENT_CALLS } from '@/types/agent';
import type { VoiceAgent } from '@/types/agent';
import type { Plan } from '@/types/agent';
import type { MinutesTier } from '@/lib/billing/plans';

interface Params { params: Promise<{ token: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('*')
    .eq('portal_token', token)
    .single();

  if (!agent) return NextResponse.json({ error: 'Agente no encontrado' }, { status: 404 });
  if (auth.portalEmail && agent.portal_email && auth.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const jornadaType = ((agent as any).jornada_type ?? 'combinada') as string;
  if (jornadaType !== 'tareas') {
    return NextResponse.json({ error: 'Este agente ya tiene canal de voz activo' }, { status: 400 });
  }

  const fullAgent = agent as VoiceAgent;
  const tier      = (agent.minutes_plan ?? 'starter') as MinutesTier;

  // 1. Create Vapi assistant if not already present
  let vapiId = fullAgent.vapi_agent_id ?? null;
  if (!vapiId) {
    vapiId = await createVapiAssistant(fullAgent);
    if (vapiId) {
      await supabase.from('voice_agents').update({ vapi_agent_id: vapiId }).eq('id', agent.id);
    }
  }

  if (!vapiId) {
    return NextResponse.json({ error: 'No se pudo preparar el asistente de voz' }, { status: 500 });
  }

  // 2. Provision phone number
  const concurrencyLimit = PLAN_CONCURRENT_CALLS[(fullAgent.plan ?? 'pro') as Plan];
  const provisioned = await provisionPhoneNumber(vapiId, undefined, concurrencyLimit);

  if (!provisioned) {
    return NextResponse.json({ error: 'No se pudo asignar un número de teléfono. Intenta de nuevo.' }, { status: 500 });
  }

  // 3. Switch jornada to combinada and set minutes allocation
  const allocation = JORNADA_CONFIG['combinada'][tier];

  await supabase.from('voice_agents').update({
    jornada_type:         'combinada',
    phone_number:         provisioned.phoneNumber,
    vapi_phone_number_id: provisioned.vapiPhoneId ?? null,
    minutes_included:     allocation.minutes,
  }).eq('id', agent.id);

  // 4. Update account-level minutes pool
  if (agent.portal_email) {
    await supabase.from('account_minutes').upsert({
      portal_email:      agent.portal_email,
      minutes_included:  allocation.minutes,
      updated_at:        new Date().toISOString(),
    }, { onConflict: 'portal_email' });
  }

  return NextResponse.json({ success: true, phone_number: provisioned.phoneNumber });
}
