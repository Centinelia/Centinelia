import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  const { token, id } = await params;
  const supabase = createAdminClient();
  const { data: ag } = await supabase.from('voice_agents').select('id').eq('portal_token', token).single();
  if (!ag) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json() as Record<string, unknown>;
  const allowed = ['titulo', 'descripcion', 'mensaje_voz', 'keywords', 'activo'];
  const update  = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));
  if (update.activo === false) update.resolved_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('it_incidents')
    .update(update)
    .eq('id', id)
    .eq('agent_id', ag.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ incident: data });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  const { token, id } = await params;
  const supabase = createAdminClient();
  const { data: ag } = await supabase.from('voice_agents').select('id').eq('portal_token', token).single();
  if (!ag) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { error } = await supabase
    .from('it_incidents').delete().eq('id', id).eq('agent_id', ag.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
