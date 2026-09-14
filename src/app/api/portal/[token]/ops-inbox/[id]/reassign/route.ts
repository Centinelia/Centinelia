export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { withPortalAuth } from '@/lib/portal/with-portal-auth';

interface OrgAnchor { id: string; portal_email: string | null }

// POST — reasignar un ops_inbox item a otro empleado activo de la misma org.
// Cambia agent_id + assigned_by='human' + registra el reasignador en
// assignment_metadata.reassigned_by / reassigned_at / previous_agent_id.
export const POST = withPortalAuth<OrgAnchor>(
  async (req, { session, org, supabase, agentId: itemIdFromParams }) => {
    // El [id] param se mapea vía agentIdParam='id' → agentId contiene el id
    // del ops_inbox item (nombre semántico distinto, pero es el mismo string).
    const id = itemIdFromParams!;

    const { agent_id: newAgentId } = (await req.json()) as { agent_id?: string };
    if (!newAgentId) return NextResponse.json({ error: 'agent_id requerido' }, { status: 400 });

    // Cargar el ops_inbox item y confirmar que pertenece a la org
    const { data: item } = await supabase
      .from('ops_inbox')
      .select('id, agent_id, assignment_metadata')
      .eq('id', id)
      .maybeSingle();
    if (!item) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

    const { data: currentAgent } = await supabase
      .from('voice_agents')
      .select('portal_email')
      .eq('id', item.agent_id)
      .single();
    if (currentAgent?.portal_email !== org.portalEmail)
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });

    // Validar target: activo + misma org
    const { data: target } = await supabase
      .from('voice_agents')
      .select('id, active, portal_email, agent_name')
      .eq('id', newAgentId)
      .maybeSingle();
    if (!target)                                          return NextResponse.json({ error: 'Empleado destino no existe' }, { status: 404 });
    if (target.portal_email !== org.portalEmail)          return NextResponse.json({ error: 'Empleado destino no pertenece a esta cuenta' }, { status: 403 });
    if (!target.active)                                   return NextResponse.json({ error: 'Empleado destino no está activo' }, { status: 400 });
    if (target.id === item.agent_id)                      return NextResponse.json({ error: 'El item ya está asignado a ese empleado' }, { status: 400 });

    const prevMeta = (item.assignment_metadata as Record<string, unknown> | null) ?? {};
    const nowIso   = new Date().toISOString();
    const actor    = session.isSubUser
      ? `sub_user:${session.userId ?? 'unknown'}`
      : `owner:${session.portalEmail}`;

    const newMeta = {
      ...prevMeta,
      reassigned_by:      actor,
      reassigned_at:      nowIso,
      previous_agent_id:  item.agent_id,
      reassignment_count: ((prevMeta.reassignment_count as number | undefined) ?? 0) + 1,
    };

    const { error } = await supabase
      .from('ops_inbox')
      .update({
        agent_id:            newAgentId,
        assigned_by:         'human',
        assignment_metadata: newMeta,
      })
      .eq('id', id);

    if (error) {
      console.error('[ops-inbox reassign] update failed:', error);
      return NextResponse.json({ error: 'No pudimos reasignar' }, { status: 500 });
    }

    return NextResponse.json({
      ok:               true,
      id,
      agent_id:         newAgentId,
      agent_name:       target.agent_name,
      assigned_by:      'human',
      assignment_metadata: newMeta,
    });
  },
  {
    requireModule: ['of_bandeja', 'oficina'],
    agentIdParam:  'id',
  },
);
