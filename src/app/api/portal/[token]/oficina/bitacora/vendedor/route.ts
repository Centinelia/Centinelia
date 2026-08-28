import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAgentAccess } from '@/lib/portal/agent-access';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // Resolve org-scoped agent_ids for this token — IDOR prevention:
  // the incident's agent_id must belong to the org that owns this portal token.
  const access = await getAgentAccess(token, req);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const body = await req.json() as { id?: string; vendedor?: string };
  const { id, vendedor } = body;
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'id requerido' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Scoping the update to agent_ids owned by this org prevents IDOR:
  // an attacker with a valid token for org A cannot update incidents from org B.
  const { error } = await supabase
    .from('client_incidents')
    .update({ vendedor: vendedor?.trim() || null, updated_at: new Date().toISOString() })
    .eq('id', id)
    .in('agent_id', access.ids);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
