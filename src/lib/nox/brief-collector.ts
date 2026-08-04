// src/lib/nox/brief-collector.ts
import type { createAdminClient } from '@/lib/supabase/admin';
import { executeListCalendarEvents } from '@/lib/services/connector-tools';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export interface BriefDataSource<T> {
  items: T[];
  truncated: boolean;
}

export interface BriefData {
  urgentEmails: BriefDataSource<{ id: string; from: string; subject: string; category: string; received_at: string }>;
  upcomingEvents: BriefDataSource<{ id: string; title: string; start: string; end: string; source: 'cal_com' | 'google' }>;
  pendingTasks: BriefDataSource<{ id: string; title: string; assigned_to: string; created_at: string; status: string }>;
  unresolvedEscalations: BriefDataSource<{ id: string; title: string; urgency: string; created_at: string; agent_id: string }>;
  pendingContractDrafts: BriefDataSource<{ id: string; client_name: string | null; created_at: string }>;
}

const LIMIT_EMAILS = 15;
const LIMIT_TASKS = 15;
const LIMIT_ESCAL = 10;
const LIMIT_DRAFTS = 10;
const LIMIT_EVENTS = 20;

function wrap<T>(items: T[], limit: number): BriefDataSource<T> {
  return { items, truncated: items.length >= limit };
}

async function fetchCalendarEvents(
  orgAgentIds: string[],
  tz: string,
  supabase: SupabaseClient,
): Promise<BriefDataSource<{ id: string; title: string; start: string; end: string; source: 'cal_com' | 'google' }>> {
  // Encuentra el primer agente del org con calendario configurado
  let cal: { id: string; calendar_type: string | null } | null = null;
  try {
    const res = await (supabase
      .from('voice_agents')
      .select('id, calendar_type')
      .in('id', orgAgentIds) as any)
      .not('calendar_type', 'is', null)
      .limit(1)
      .maybeSingle();
    cal = res?.data ?? null;
  } catch {
    return { items: [], truncated: false };
  }

  if (!cal?.id) return { items: [], truncated: false };

  const now = new Date();
  const tomorrowEnd = new Date(now);
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 2);
  tomorrowEnd.setHours(0, 0, 0, 0);

  try {
    const result = await executeListCalendarEvents(cal.id, now, tomorrowEnd, supabase) as {
      ok: boolean;
      events?: Array<{ id: string; title: string; start: string; end: string }>;
    };
    if (!result.ok || !result.events) return { items: [], truncated: false };
    const source = (cal.calendar_type === 'cal_com' ? 'cal_com' : 'google') as 'cal_com' | 'google';
    const items = result.events.slice(0, LIMIT_EVENTS).map(e => ({ ...e, source }));
    return { items, truncated: result.events.length >= LIMIT_EVENTS };
  } catch (err) {
    console.error('[brief-collector] calendar error:', err);
    return { items: [], truncated: false };
  }
}

const EMPTY_BRIEF: BriefData = {
  urgentEmails:          { items: [], truncated: false },
  upcomingEvents:        { items: [], truncated: false },
  pendingTasks:          { items: [], truncated: false },
  unresolvedEscalations: { items: [], truncated: false },
  pendingContractDrafts: { items: [], truncated: false },
};

export async function collectBriefData(
  orgAgentIds: string[],
  _portalEmail: string,
  tz: string,
  supabase: SupabaseClient,
): Promise<BriefData> {
  // Guard: empty orgAgentIds would produce invalid SQL (.in('col', [])).
  // Return an empty brief immediately without any DB calls.
  if (orgAgentIds.length === 0) return EMPTY_BRIEF;

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [emailsRes, tasksRes, escalRes, draftsRes, events] = await Promise.all([
    supabase.from('ops_inbox')
      .select('id, email_from, email_subject, category, created_at')
      .in('agent_id', orgAgentIds)
      .eq('status', 'pending')
      .in('category', ['urgente', 'importante'])
      .gte('created_at', since24h)
      .order('created_at', { ascending: false })
      .limit(LIMIT_EMAILS),
    supabase.from('agent_tasks')
      .select('id, title, assigned_to, created_at, status')
      .in('assigned_to', orgAgentIds)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(LIMIT_TASKS),
    supabase.from('human_requests')
      .select('id, title, urgency, created_at, agent_id')
      .in('agent_id', orgAgentIds)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(LIMIT_ESCAL),
    supabase.from('contract_drafts')
      .select('id, client_name, created_at')
      .in('agent_id', orgAgentIds)
      .eq('status', 'borrador')
      .order('created_at', { ascending: false })
      .limit(LIMIT_DRAFTS),
    fetchCalendarEvents(orgAgentIds, tz, supabase),
  ]);

  // Surface PostgREST errors so silent-empty bugs don't hide
  for (const [name, res] of Object.entries({ ops_inbox: emailsRes, agent_tasks: tasksRes, human_requests: escalRes, contract_drafts: draftsRes })) {
    if ((res as any).error) console.error(`[brief-collector] ${name} query failed:`, (res as any).error?.message ?? res);
  }

  return {
    urgentEmails: wrap(
      ((emailsRes.data ?? []) as any[]).map(e => ({ id: e.id, from: e.email_from ?? '', subject: e.email_subject ?? '', category: e.category ?? '', received_at: e.created_at })),
      LIMIT_EMAILS,
    ),
    upcomingEvents: events,
    pendingTasks: wrap(((tasksRes.data ?? []) as any[]), LIMIT_TASKS),
    unresolvedEscalations: wrap(((escalRes.data ?? []) as any[]), LIMIT_ESCAL),
    pendingContractDrafts: wrap(((draftsRes.data ?? []) as any[]), LIMIT_DRAFTS),
  };
}
