export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { parseToolOverrides, type ToolOverrides } from '@/lib/tools/tool-overrides';
import { TOOL_REGISTRY } from '@/lib/tools/registry';
import { withPortalAuth } from '@/lib/portal/with-portal-auth';

interface AgentRow {
  id:             string;
  portal_email:   string;
  tool_overrides: unknown;
}

// Set inmutable de todos los names conocidos por el sistema. Cualquier name
// que caiga fuera es basura (typo, cliente ancient, o intento de bloat).
const KNOWN_TOOL_NAMES = new Set(TOOL_REGISTRY.map(t => t.name));

interface FilterResult {
  overrides: ToolOverrides;
  dropped:   string[];
}

// Filtra names desconocidos silenciosamente. El caller decide qué hacer con
// `dropped` — típicamente incluirlos en `warnings` de la respuesta.
export function stripUnknownTools(parsed: ToolOverrides): FilterResult {
  const dropped: string[] = [];
  const filterList = (names: string[]) =>
    names.filter(n => {
      if (KNOWN_TOOL_NAMES.has(n)) return true;
      dropped.push(n);
      return false;
    });
  return {
    overrides: {
      disabled: filterList(parsed.disabled),
      enabled:  filterList(parsed.enabled),
    },
    dropped,
  };
}

// GET /api/portal/[token]/agentes/[agentId]/tool-overrides
// Retorna { overrides: { disabled: string[], enabled: string[] } }
export const GET = withPortalAuth<AgentRow>(
  async (_req, { agent }) => {
    const overrides = parseToolOverrides(agent!.tool_overrides);
    return NextResponse.json({ overrides });
  },
  {
    loadAgent:   true,
    agentSelect: 'id, portal_email, tool_overrides',
  },
);

// PATCH /api/portal/[token]/agentes/[agentId]/tool-overrides
// Body: { disabled?: string[], enabled?: string[] } (reemplaza el jsonb completo)
// Retorna { ok: true, overrides }
export const PATCH = withPortalAuth<AgentRow>(
  async (req, { agent, supabase, agentId }) => {
    // Distinguir body vacío/malformado de body válido con listas vacías.
    const raw = await req.json().catch(() => null);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
    }
    const hasDisabled = Array.isArray((raw as { disabled?: unknown }).disabled);
    const hasEnabled  = Array.isArray((raw as { enabled?: unknown }).enabled);
    if (!hasDisabled && !hasEnabled) {
      return NextResponse.json({ error: 'Falta disabled o enabled' }, { status: 400 });
    }
    const parsed = parseToolOverrides(raw);
    const { overrides: cleaned, dropped } = stripUnknownTools(parsed);

    const { error } = await supabase
      .from('voice_agents')
      .update({ tool_overrides: cleaned })
      .eq('id', agentId!)
      .eq('portal_email', agent!.portal_email);

    if (error) {
      console.error('[tool-overrides] PATCH update failed:', error);
      return NextResponse.json({ error: 'No pudimos guardar el cambio' }, { status: 500 });
    }
    return NextResponse.json({
      ok:        true,
      overrides: cleaned,
      ...(dropped.length > 0 ? { warnings: { unknown_tools: dropped } } : {}),
    });
  },
  {
    loadAgent:       true,
    agentSelect:     'id, portal_email, tool_overrides',
    rateLimit:       'configWrite',
    rateLimitPrefix: 'tool-overrides',
  },
);
