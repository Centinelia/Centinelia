import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getGoalsWithProgress } from '@/lib/goals/progress';

interface Params { params: Promise<{ token: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents').select('id, portal_email').eq('portal_token', token).single();
  if (!agent) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  if (session.portalEmail && agent.portal_email && session.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const goals = await getGoalsWithProgress(agent.id);
  return NextResponse.json({ goals });
}

export async function POST(req: NextRequest, { params }: Params) {
  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const body = await req.json();
  const { title, metric, target, period } = body;

  if (!title?.trim() || !metric || !target) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 });
  }

  const validMetrics = ['leads', 'appointments', 'orders', 'calls', 'custom'];
  if (!validMetrics.includes(metric)) {
    return NextResponse.json({ error: 'Métrica inválida' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents').select('id, portal_email').eq('portal_token', token).single();
  if (!agent) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  if (session.portalEmail && agent.portal_email && session.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const { data, error } = await supabase
    .from('agent_goals')
    .insert({
      agent_id: agent.id,
      title: title.trim(),
      metric,
      target: Number(target),
      period: period ?? 'month',
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ goal: data });
}
