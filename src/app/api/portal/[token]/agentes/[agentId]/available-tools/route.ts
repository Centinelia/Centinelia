export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import { parseToolOverrides } from '@/lib/tools/tool-overrides';
import { resolveOrgPackContext, resolveActivePacks, meerkatActivePacks } from '@/lib/tools/packs';
import { buildToolGroups } from '@/lib/tools/available-tools';

interface Params { params: Promise<{ token: string; agentId: string }> }

/**
 * GET /api/portal/[token]/agentes/[agentId]/available-tools
 *
 * Devuelve al owner la lista completa de herramientas disponibles para este
 * empleado (agrupadas por default + packs activos) con su estado actual
 * (on/off) considerando preset del rol, universales y overrides finos.
 *
 * Consumido por ToolOverridesSection en /portal/[token]/configurar.
 * Owner-only implícito (los sub-users no pueden llegar al tab Herramientas
 * con esta card).
 */
export async function GET(req: NextRequest, { params }: Params) {
  const { token, agentId } = await params;

  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const resolved = await resolveOrgFromToken(token);
  if (!resolved?.portalEmail) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail && resolved.portalEmail !== session.portalEmail) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, portal_email, features, tool_overrides')
    .eq('id', agentId)
    .maybeSingle();
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (agent.portal_email !== resolved.portalEmail) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const features  = (agent.features as Record<string, unknown> | null) ?? {};
  const meerkatId = (features.meerkat_role_id as string | null) ?? null;
  const overrides = parseToolOverrides(agent.tool_overrides);

  const packCtx      = await resolveOrgPackContext(resolved.portalEmail, supabase);
  const orgActive    = resolveActivePacks(packCtx);
  const activePacks  = meerkatActivePacks(orgActive, features);

  const groups = buildToolGroups(meerkatId, overrides, activePacks);

  return NextResponse.json({ overrides, groups });
}
