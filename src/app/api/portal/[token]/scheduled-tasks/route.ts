export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { createAdminClient } from '@/lib/supabase/admin';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';

function getNextRun(frequency: string, schedule: Record<string, number>, timezone = 'America/Monterrey'): Date {
  const now    = new Date();
  const tzNow  = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  const offset = now.getTime() - tzNow.getTime();
  const hour   = schedule.hour ?? 8;

  if (frequency === 'daily') {
    const c = new Date(tzNow);
    c.setHours(hour, 0, 0, 0);
    if (c <= tzNow) c.setDate(c.getDate() + 1);
    return new Date(c.getTime() + offset);
  }
  if (frequency === 'weekly') {
    const c      = new Date(tzNow);
    const target = schedule.day_of_week ?? 1;
    const diff   = (target - tzNow.getDay() + 7) % 7 || 7;
    c.setDate(c.getDate() + diff);
    c.setHours(hour, 0, 0, 0);
    return new Date(c.getTime() + offset);
  }
  const c = new Date(tzNow);
  c.setMonth(c.getMonth() + 1);
  c.setDate(schedule.day_of_month ?? 1);
  c.setHours(hour, 0, 0, 0);
  return new Date(c.getTime() + offset);
}

async function auth(req: NextRequest) {
  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  return verifySession(cookie);
}

export async function GET(req: NextRequest) {
  const session = await auth(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('scheduled_agent_tasks')
    .select('*')
    .eq('portal_email', session.portalEmail)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tasks: data ?? [] });
}

export async function POST(req: NextRequest) {
  const session = await auth(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    agent_id:          string;
    name:              string;
    description:       string;
    success_criteria?: string;
    max_iterations?:   number;
    frequency:         string;
    schedule:          Record<string, number>;
  };

  const { agent_id, name, description, success_criteria, max_iterations, frequency, schedule } = body;
  if (!agent_id || !name || !description || !frequency) {
    return NextResponse.json({ error: 'Campos requeridos faltantes.' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: agentRecord } = await supabase
    .from('voice_agents')
    .select('timezone, portal_email')
    .eq('id', agent_id)
    .single();

  if (!agentRecord || agentRecord.portal_email !== session.portalEmail) {
    return NextResponse.json({ error: 'Agente no autorizado.' }, { status: 403 });
  }

  const tz      = (agentRecord.timezone as string | null) ?? 'America/Monterrey';
  const nextRun = getNextRun(frequency, schedule ?? {}, tz);

  const { data, error } = await supabase
    .from('scheduled_agent_tasks')
    .insert({
      portal_email:     session.portalEmail,
      agent_id,
      name,
      description,
      success_criteria: success_criteria || null,
      max_iterations:   max_iterations ?? 3,
      frequency,
      schedule:         schedule ?? { hour: 9 },
      next_run_at:      nextRun.toISOString(),
      active:           true,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ task: data });
}

export async function PATCH(req: NextRequest) {
  const session = await auth(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { id: string } & Record<string, unknown>;
  const { id } = body;
  if (!id) return NextResponse.json({ error: 'ID requerido.' }, { status: 400 });

  const ALLOWED = ['active', 'name', 'description', 'success_criteria', 'max_iterations', 'frequency', 'schedule', 'next_run_at'] as const;
  const updates: Record<string, unknown> = {};
  for (const key of ALLOWED) {
    if (key in body) updates[key] = body[key];
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Sin campos válidos para actualizar.' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from('scheduled_agent_tasks')
    .select('portal_email, agent_id, frequency, schedule')
    .eq('id', id)
    .single();

  if (!existing || existing.portal_email !== session.portalEmail) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if ('frequency' in updates || 'schedule' in updates) {
    const { data: agentRecord } = await supabase
      .from('voice_agents')
      .select('timezone')
      .eq('id', existing.agent_id as string)
      .single();
    const tz    = (agentRecord?.timezone as string | null) ?? 'America/Monterrey';
    const freq  = (updates.frequency ?? existing.frequency) as string;
    const sched = (updates.schedule  ?? existing.schedule)  as Record<string, number>;
    updates.next_run_at = getNextRun(freq, sched, tz).toISOString();
  }

  const { data, error } = await supabase
    .from('scheduled_agent_tasks')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ task: data });
}

export async function DELETE(req: NextRequest) {
  const session = await auth(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json() as { id: string };
  if (!id) return NextResponse.json({ error: 'ID requerido.' }, { status: 400 });

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from('scheduled_agent_tasks')
    .select('portal_email')
    .eq('id', id)
    .single();

  if (!existing || existing.portal_email !== session.portalEmail) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { error } = await supabase.from('scheduled_agent_tasks').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest) {
  const session = await auth(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json() as { id: string };
  if (!id) return NextResponse.json({ error: 'ID requerido.' }, { status: 400 });

  const supabase = createAdminClient();

  const { data: task } = await supabase
    .from('scheduled_agent_tasks')
    .select('*')
    .eq('id', id)
    .eq('portal_email', session.portalEmail)
    .single();

  if (!task) return NextResponse.json({ error: 'Tarea no encontrada.' }, { status: 404 });

  const { data: agents } = await supabase
    .from('voice_agents')
    .select('id, agent_name, features')
    .eq('portal_email', session.portalEmail)
    .eq('active', true);

  if (!agents?.length) return NextResponse.json({ error: 'No hay agentes activos.' }, { status: 400 });

  const coordinator = agents.find(a => (a.features as Record<string, unknown>)?.is_coordinator === true);
  const target      = agents.find(a => a.id === (task.agent_id as string)) ?? coordinator ?? agents[0];

  try {
    const res = await fetch(`${APP_URL}/api/voice/tools/delegar-tarea?agent_id=${target.id}`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'x-vapi-secret': process.env.VAPI_SERVER_SECRET ?? '',
      },
      body: JSON.stringify({
        agente:           (target.agent_name as string | null) ?? 'agente',
        tarea:            task.description as string,
        contexto:         `Tarea programada (ejecución manual): ${task.name as string}`,
        success_criteria: (task.success_criteria as string | null) ?? undefined,
        max_iterations:   (task.max_iterations as number) ?? 3,
      }),
    });

    if (!res.ok) return NextResponse.json({ error: `Error al ejecutar: HTTP ${res.status}` }, { status: 500 });

    const data   = await res.json() as { results?: Array<{ result: string }> };
    const result = data.results?.[0]?.result ?? 'Tarea enviada al agente.';

    await supabase.from('scheduled_agent_tasks').update({ last_run_at: new Date().toISOString() }).eq('id', id);

    return NextResponse.json({ ok: true, message: result });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
