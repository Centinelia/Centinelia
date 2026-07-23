export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { createAdminClient } from '@/lib/supabase/admin';

function getNextRun(frequency: string, schedule: Record<string, number>): Date {
  const now = new Date();
  if (frequency === 'daily') {
    const d = new Date(now);
    d.setHours(schedule.hour ?? 8, 0, 0, 0);
    if (d <= now) d.setDate(d.getDate() + 1);
    return d;
  }
  if (frequency === 'weekly') {
    const d      = new Date(now);
    const target = schedule.day_of_week ?? 1;
    const diff   = (target - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + diff);
    d.setHours(schedule.hour ?? 8, 0, 0, 0);
    return d;
  }
  const d = new Date(now);
  d.setMonth(d.getMonth() + 1);
  d.setDate(schedule.day_of_month ?? 1);
  d.setHours(schedule.hour ?? 8, 0, 0, 0);
  return d;
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
  const nextRun  = getNextRun(frequency, schedule ?? {});

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
  const { id, ...updates } = body;
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
