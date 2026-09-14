export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { parseToolOverrides } from '@/lib/tools/tool-overrides';
import { resolveOrgPackContext, resolveActivePacks, meerkatActivePacks } from '@/lib/tools/packs';
import { buildToolGroups } from '@/lib/tools/available-tools';
import { withPortalAuth } from '@/lib/portal/with-portal-auth';

interface AgentRow {
  id:             string;
  portal_email:   string;
  features:       Record<string, unknown> | null;
  tool_overrides: unknown;
}

/**
 * GET /api/portal/[token]/agentes/[agentId]/available-tools
 *
 * Devuelve al owner la lista completa de herramientas disponibles para este
 * empleado (agrupadas por default + packs activos) con su estado actual
 * (on/off) considerando preset del rol, universales y overrides finos.
 */
export const GET = withPortalAuth<AgentRow>(
  async (_req, { agent, supabase, org }) => {
    const features  = (agent!.features as Record<string, unknown> | null) ?? {};
    const meerkatId = (features.meerkat_role_id as string | null) ?? null;
    const overrides = parseToolOverrides(agent!.tool_overrides);

    const packCtx      = await resolveOrgPackContext(org.portalEmail, supabase);
    const orgActive    = resolveActivePacks(packCtx);
    const activePacks  = meerkatActivePacks(orgActive, features);

    const groups = buildToolGroups(meerkatId, overrides, activePacks);

    return NextResponse.json({ overrides, groups });
  },
  {
    loadAgent:   true,
    agentSelect: 'id, portal_email, features, tool_overrides',
  },
);
