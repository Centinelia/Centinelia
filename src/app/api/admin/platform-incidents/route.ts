import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type Status = 'open' | 'in_progress' | 'sent_to_claude_code' | 'awaiting_verification' | 'resolved' | 'closed';
type Priority = 'low' | 'med' | 'high' | 'critical';
type Source = 'bug_report' | 'error_log' | 'escalated_inbox' | 'failed_handoff' | 'agent_task' | 'nash_self_discovery' | 'manual';

const STATUS_VALUES: readonly Status[] = ['open', 'in_progress', 'sent_to_claude_code', 'awaiting_verification', 'resolved', 'closed'];
const PRIORITY_VALUES: readonly Priority[] = ['low', 'med', 'high', 'critical'];
const SOURCE_VALUES: readonly Source[] = ['bug_report', 'error_log', 'escalated_inbox', 'failed_handoff', 'agent_task', 'nash_self_discovery', 'manual'];

// Grupos de status para los tabs de la UI de soporte.
const STATUS_GROUPS: Record<string, Status[]> = {
  open:         ['open', 'in_progress', 'awaiting_verification'],
  claude_code:  ['sent_to_claude_code'],
  resolved:     ['resolved', 'closed'],
};

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const group    = req.nextUrl.searchParams.get('group') ?? 'open';
  const statuses = STATUS_GROUPS[group] ?? STATUS_GROUPS.open;

  // Ordenamiento: siempre "más recientes en esta lista arriba". Para Abiertos,
  // "más recientes" = created_at (cuándo entró el problema). Para Claude Code
  // y Resueltos, "más recientes" = updated_at (cuándo cambió al estado actual).
  // Sin esto, marcar como resuelto un incidente viejo lo dejaba enterrado en
  // la pestaña Resueltos por su created_at original. Ver 2026-09-05.
  const orderCol = group === 'open' ? 'created_at' : 'updated_at';

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('platform_incidents')
    .select('*')
    .in('status', statuses)
    .order(orderCol, { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Metadata por portal_email para que el UI pueda buscar por nombre de empresa,
  // portal_token o nombres de meerkats sin round-trips extra. Solo traemos los
  // portals que aparecen en los incidentes de esta página.
  const items = data ?? [];
  const portalEmails = Array.from(new Set(items.map(i => i.affected_portal_email).filter(Boolean))) as string[];
  const portalMeta: Record<string, { business_name: string | null; portal_token: string | null; agent_names: string[] }> = {};
  if (portalEmails.length > 0) {
    const { data: orgs } = await supabase
      .from('organizations')
      .select('portal_email, name, portal_token')
      .in('portal_email', portalEmails);
    const { data: agents } = await supabase
      .from('voice_agents')
      .select('portal_email, agent_name, business_name, portal_token')
      .in('portal_email', portalEmails);
    for (const email of portalEmails) {
      const org = (orgs ?? []).find(o => o.portal_email === email);
      const portalAgents = (agents ?? []).filter(a => a.portal_email === email);
      portalMeta[email] = {
        business_name: org?.name ?? portalAgents[0]?.business_name ?? null,
        portal_token:  org?.portal_token ?? portalAgents[0]?.portal_token ?? null,
        agent_names:   portalAgents.map(a => a.agent_name).filter(Boolean) as string[],
      };
    }
  }

  return NextResponse.json({ items, portal_meta: portalMeta });
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null) as {
    title?:                 unknown;
    description?:           unknown;
    priority?:              unknown;
    source?:                unknown;
    affected_portal_email?: unknown;
  } | null;

  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const title       = typeof body.title === 'string' ? body.title.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const priority    = typeof body.priority === 'string' && (PRIORITY_VALUES as readonly string[]).includes(body.priority) ? body.priority as Priority : null;
  const source      = typeof body.source === 'string' && (SOURCE_VALUES as readonly string[]).includes(body.source) ? body.source as Source : 'manual';
  const email       = typeof body.affected_portal_email === 'string' && body.affected_portal_email.trim() ? body.affected_portal_email.trim() : null;

  if (!title || !description || !priority) {
    return NextResponse.json({ error: 'title, description y priority son requeridos' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('platform_incidents')
    .insert({
      title,
      description,
      priority,
      source,
      status:                'open',
      assigned_to:           'nash',
      affected_portal_email: email,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function PATCH(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null) as {
    id?:               unknown;
    status?:           unknown;
    resolution?:       unknown;
    github_issue_url?: unknown;
  } | null;

  if (!body || typeof body.id !== 'string') {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.status === 'string' && (STATUS_VALUES as readonly string[]).includes(body.status)) patch.status = body.status;
  if (typeof body.resolution === 'string')       patch.resolution = body.resolution;
  if (typeof body.github_issue_url === 'string') patch.github_issue_url = body.github_issue_url;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('platform_incidents')
    .update(patch)
    .eq('id', body.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}
