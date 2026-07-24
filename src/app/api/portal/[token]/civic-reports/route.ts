import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { generateFolio } from '@/lib/civic/folio';

interface Params { params: Promise<{ token: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();
  const sp        = req.nextUrl.searchParams;

  const { data: agent } = await supabase
    .from('voice_agents').select('id, portal_email').eq('portal_token', token).single();
  if (!agent) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  if (auth.portalEmail && agent.portal_email && auth.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  // All agents in the account
  const { data: siblings } = agent.portal_email
    ? await supabase.from('voice_agents').select('id').eq('portal_email', agent.portal_email)
    : { data: [{ id: agent.id }] };
  const agentIds = (siblings ?? []).map((a: any) => a.id as string);

  let query = supabase
    .from('civic_reports')
    .select('*')
    .in('agent_id', agentIds)
    .order('created_at', { ascending: false })
    .limit(200);

  const status   = sp.get('status');
  const category = sp.get('category');
  const q        = sp.get('q');

  if (status)   query = query.eq('status', status);
  if (category) query = query.eq('category', category);
  if (q)        query = query.or(`folio.ilike.%${q}%,description.ilike.%${q}%,caller_number.ilike.%${q}%,caller_name.ilike.%${q}%,location_text.ilike.%${q}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reports: data ?? [] });
}

export async function POST(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();
  const body      = await req.json();

  const { data: agent } = await supabase
    .from('voice_agents').select('id, portal_email').eq('portal_token', token).single();
  if (!agent) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  if (auth.portalEmail && agent.portal_email && auth.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const folio = await generateFolio(agent.id, supabase);

  const { data, error } = await supabase.from('civic_reports').insert({
    agent_id:      agent.id,
    folio,
    category:      body.category      ?? 'otro',
    description:   body.description   ?? null,
    location_text: body.location_text ?? null,
    caller_number: body.caller_number ?? null,
    caller_name:   body.caller_name   ?? null,
    call_id:       body.call_id       ?? null,
    status:        'abierto',
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ report: data, folio });
}
