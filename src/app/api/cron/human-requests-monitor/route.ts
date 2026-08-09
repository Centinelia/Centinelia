import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendReminderNotification, sendEscalationNotification } from '@/lib/human-handoff/notify';
import { resumeAgentAfterHumanResponse } from '@/lib/human-handoff/resume';
import { verifyCronAuth } from '@/lib/auth/cron-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date();
  // F10: umbrales más agresivos. Aplica [[feedback-empleados-inteligentes]]:
  // si el empleado escaló al humano, que el humano se entere rápido y
  // los pendings no se hagan zombies. Antes: 24h/48h/7d. Ahora: 12h/24h/5d.
  const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);
  const dayAgo         = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const fiveDaysAgo    = new Date(now.getTime() - 5  * 24 * 60 * 60 * 1000);

  const results = { reminded: 0, escalated: 0, timed_out: 0, errors: 0 };

  // 1. Reminders: pending > 12h sin reminded_at
  const { data: needReminder } = await supabase
    .from('human_requests')
    .select('id')
    .eq('status', 'pending')
    .lt('created_at', twelveHoursAgo.toISOString())
    .is('reminded_at', null);

  for (const request of needReminder ?? []) {
    try {
      await sendReminderNotification(request.id as string);
      await supabase.from('human_requests').update({ reminded_at: now.toISOString() }).eq('id', request.id as string);
      results.reminded++;
    } catch (err) {
      console.error(`[hrm] reminder failed ${request.id}:`, err);
      results.errors++;
    }
  }

  // 2. Escalations: pending > 24h
  const { data: needEscalation } = await supabase
    .from('human_requests')
    .select('id, agent_id, status')
    .eq('status', 'pending')
    .lt('created_at', dayAgo.toISOString());

  for (const request of needEscalation ?? []) {
    try {
      const { data: agent } = await supabase
        .from('voice_agents')
        .select('client_email')
        .eq('id', request.agent_id as string)
        .single();

      if (!agent?.client_email) {
        console.warn(`[hrm] escalation: no client_email for agent ${request.agent_id}`);
        continue;
      }

      await sendEscalationNotification(request.id as string, agent.client_email as string);
      await supabase.from('human_requests').update({
        status: 'escalated',
        escalated_to_email: agent.client_email as string,
        escalated_at: now.toISOString(),
      }).eq('id', request.id as string);
      results.escalated++;
    } catch (err) {
      console.error(`[hrm] escalation failed ${request.id}:`, err);
      results.errors++;
    }
  }

  // 3. Timeouts: pending o escalated > 5d
  const { data: needTimeout } = await supabase
    .from('human_requests')
    .select('id')
    .in('status', ['pending', 'escalated'])
    .lt('created_at', fiveDaysAgo.toISOString());

  for (const request of needTimeout ?? []) {
    try {
      await supabase.from('human_requests').update({
        status: 'timeout',
        cancelled_at: now.toISOString(),
        cancellation_reason: 'auto_timeout_5d',
      }).eq('id', request.id as string);

      await resumeAgentAfterHumanResponse(request.id as string);
      results.timed_out++;
    } catch (err) {
      console.error(`[hrm] timeout failed ${request.id}:`, err);
      results.errors++;
    }
  }

  return NextResponse.json(results);
}
