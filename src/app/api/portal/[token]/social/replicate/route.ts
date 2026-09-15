/**
 * POST /api/portal/[token]/social/replicate
 *
 * Wrapper del portal UI para replicar contenido entre cuentas de un Navi Agencia.
 * Llama a runNaviTool('replicar_contenido_entre_cuentas', body, ctx).
 *
 * Body:
 *   agent_id           — id del agente Navi Agencia
 *   source_media_id    — id o URL del post fuente
 *   target_account_ids — array de social_account.id destino
 *
 * Seguridad: guardPortalSocialRequest + IDOR verificando que el agente
 * pertenece a la org del portal.
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { guardPortalSocialRequest, isNextResponse } from '@/lib/social/portal-guards';
import { runNaviTool }                              from '@/lib/tools/executors/navi';

interface Params { params: Promise<{ token: string }> }

interface ReplicateBody {
  agent_id:           string;
  source_media_id:    string;
  target_account_ids: string[];
}

export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;

  const guard = await guardPortalSocialRequest(req, token);
  if (isNextResponse(guard)) return guard;
  const { resolved, supabase } = guard;

  let body: ReplicateBody;
  try {
    body = await req.json() as ReplicateBody;
  } catch {
    return NextResponse.json({ error: 'Cuerpo JSON inválido' }, { status: 400 });
  }

  const { agent_id, source_media_id, target_account_ids } = body;

  if (!agent_id || !source_media_id || !Array.isArray(target_account_ids) || target_account_ids.length === 0) {
    return NextResponse.json(
      { error: 'agent_id, source_media_id y target_account_ids son requeridos' },
      { status: 400 },
    );
  }

  // IDOR: verificar que el agente pertenece a esta org
  const { data: agent, error: agentErr } = await supabase
    .from('voice_agents')
    .select('id, role, portal_email')
    .eq('id', agent_id)
    .eq('portal_email', resolved.portalEmail)
    .maybeSingle();

  if (agentErr || !agent) {
    return NextResponse.json({ error: 'Agente no encontrado o sin acceso' }, { status: 403 });
  }

  if (agent.role !== 'navi_agencia') {
    return NextResponse.json({ error: 'El agente no es de tipo Navi Agencia' }, { status: 403 });
  }

  try {
    const result = await runNaviTool(
      'replicar_contenido_entre_cuentas',
      {
        source_media_id,
        target_account_ids,
        portal_email: resolved.portalEmail,
      },
      {
        agentId:     agent_id,
        portalEmail: resolved.portalEmail,
        supabase,
      },
    );

    return NextResponse.json({ ok: true, ...(result as object) });
  } catch (err) {
    const msg   = err instanceof Error ? err.message : 'Error al replicar contenido';
    const code  = (err as { code?: string }).code;
    const status = code === 'SOURCE_NOT_FOUND' || code === 'ACCOUNT_NOT_MANAGED' ? 422 : 500;
    return NextResponse.json({ error: msg, code }, { status });
  }
}
