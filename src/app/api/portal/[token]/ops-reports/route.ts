import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { runReport } from '@/lib/ops/report-generator';

interface Params { params: Promise<{ token: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();

  const { data: acct } = await supabase
    .from('voice_agents').select('id, portal_email').eq('portal_token', token).single();
  if (!acct) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  const agentIds = await getAccountAgentIds(supabase, acct.portal_email);

  const { data: reports } = await supabase
    .from('ops_reports')
    .select('id, agent_id, name, frequency, schedule, data_sources, recipients, report_instructions, last_run_at, next_run_at, active, created_at')
    .in('agent_id', agentIds)
    .order('created_at', { ascending: false });

  const { data: runs } = await supabase
    .from('ops_report_runs')
    .select('id, report_id, status, created_at')
    .in('agent_id', agentIds)
    .order('created_at', { ascending: false })
    .limit(50);

  return NextResponse.json({ reports: reports ?? [], runs: runs ?? [] });
}

export async function POST(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();
  const body      = await req.json();

  const { data: acct } = await supabase
    .from('voice_agents').select('id, portal_email').eq('portal_token', token).single();
  if (!acct) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  const { name, frequency, schedule, data_sources, recipients, report_instructions, agent_id } = body;
  if (!name || !frequency || !schedule) return NextResponse.json({ error: 'Faltan campos' }, { status: 400 });

  // Verify agent belongs to this account
  const agentIds = await getAccountAgentIds(supabase, acct.portal_email);
  const targetId = agent_id ?? acct.id;
  if (!agentIds.includes(targetId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const next_run_at = computeNextRun(frequency, schedule);

  const { data: report, error } = await supabase
    .from('ops_reports')
    .insert({
      agent_id:            targetId,
      name,
      frequency,
      schedule,
      data_sources:        data_sources ?? [],
      recipients:          recipients ?? [],
      report_instructions: report_instructions ?? null,
      next_run_at:         next_run_at.toISOString(),
      active:              true,
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: report.id });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();
  const body      = await req.json();

  const { data: acct } = await supabase
    .from('voice_agents').select('id, portal_email').eq('portal_token', token).single();
  if (!acct) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  const agentIds = await getAccountAgentIds(supabase, acct.portal_email);
  const allowed  = ['name', 'frequency', 'schedule', 'data_sources', 'recipients', 'report_instructions', 'active'];
  const update   = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));

  if (update.frequency || update.schedule) {
    const freq  = (update.frequency as string)                      ?? (await getCurrentFrequency(supabase, body.id));
    const sched = (update.schedule  as Record<string, number>) ?? (await getCurrentSchedule(supabase, body.id));
    update.next_run_at = computeNextRun(freq, sched).toISOString();
  }

  const { error } = await supabase
    .from('ops_reports')
    .update(update)
    .eq('id', body.id)
    .in('agent_id', agentIds);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();
  const { id }    = await req.json();

  const { data: acct } = await supabase
    .from('voice_agents').select('id, portal_email').eq('portal_token', token).single();
  if (!acct) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  const agentIds = await getAccountAgentIds(supabase, acct.portal_email);
  await supabase.from('ops_reports').delete().eq('id', id).in('agent_id', agentIds);

  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();
  const { id }    = await req.json() as { id: string };

  const { data: acct } = await supabase
    .from('voice_agents').select('id, portal_email').eq('portal_token', token).single();
  if (!acct) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  const agentIds = await getAccountAgentIds(supabase, acct.portal_email);
  const { data: report } = await supabase
    .from('ops_reports').select('id').eq('id', id).in('agent_id', agentIds).single();
  if (!report) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const result = await runReport(id);
  if (!(result as { ok: boolean }).ok) {
    return NextResponse.json({ ok: false, message: 'Error al generar el reporte.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, message: 'Reporte enviado correctamente.' });
}

function computeNextRun(frequency: string, schedule: Record<string, number>, timezone = 'America/Monterrey'): Date {
  const now    = new Date();
  const tzNow  = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  const offset = now.getTime() - tzNow.getTime();
  const hour   = schedule.hour ?? 8;

  if (frequency === 'weekly') {
    const target = schedule.day_of_week ?? 1;
    const diff   = (target - tzNow.getDay() + 7) % 7 || 7;
    const d      = new Date(tzNow);
    d.setDate(d.getDate() + diff);
    d.setHours(hour, 0, 0, 0);
    return new Date(d.getTime() + offset);
  }
  const d = new Date(tzNow);
  d.setMonth(d.getMonth() + 1, schedule.day_of_month ?? 1);
  d.setHours(hour, 0, 0, 0);
  return new Date(d.getTime() + offset);
}

async function getCurrentFrequency(supabase: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>, id: string): Promise<string> {
  const { data } = await supabase.from('ops_reports').select('frequency').eq('id', id).single();
  return (data?.frequency as string) ?? 'weekly';
}

async function getCurrentSchedule(supabase: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>, id: string): Promise<Record<string, number>> {
  const { data } = await supabase.from('ops_reports').select('schedule').eq('id', id).single();
  return (data?.schedule as Record<string, number>) ?? {};
}

async function getAccountAgentIds(
  supabase: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>,
  portalEmail: string | null,
): Promise<string[]> {
  if (!portalEmail) return [];
  const { data } = await supabase.from('voice_agents').select('id').eq('portal_email', portalEmail);
  return (data ?? []).map(a => a.id as string);
}
