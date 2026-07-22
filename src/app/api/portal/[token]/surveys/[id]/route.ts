import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAgentAccess } from '@/lib/portal/agent-access';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  const { token, id } = await params;
  const access        = await getAgentAccess(token, req);
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('surveys')
    .select('*, survey_questions(*)')
    .eq('id', id)
    .in('agent_id', access.ids)
    .single();

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ survey: data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  const { token, id } = await params;
  const access        = await getAgentAccess(token, req);
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body    = await req.json() as Record<string, unknown>;
  const allowed = ['nombre', 'descripcion', 'objetivo', 'activa', 'auto_apply', 'triggers', 'agent_ids', 'canal', 'actions'];
  const patch   = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('surveys')
    .update(patch)
    .eq('id', id)
    .in('agent_id', access.ids)
    .select()
    .single();

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ survey: data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  const { token, id } = await params;
  const access        = await getAgentAccess(token, req);
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('surveys')
    .delete()
    .eq('id', id)
    .in('agent_id', access.ids);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
