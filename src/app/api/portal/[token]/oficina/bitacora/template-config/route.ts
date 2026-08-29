import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveOrgFromToken } from '@/lib/portal/org-token';

export const dynamic = 'force-dynamic';

/**
 * Actualiza el mapping de una plantilla ya subida sin re-analizar el archivo.
 * Permite al cliente overridear las decisiones de Claude (ej. desmarcar
 * "Nelia escribe" en una col que auto-detectó como writable pero él prefiere
 * que sea human-only).
 *
 * Solo permite editar campos seguros: human_only_columns. El sheet_name,
 * insertion_row, columns mapping (bindings a fields canónicos) requieren
 * re-analizar la plantilla (re-upload).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'invalid token' }, { status: 404 });

  const agentId = req.nextUrl.searchParams.get('agent_id');
  if (!agentId) return NextResponse.json({ error: 'agent_id query param required' }, { status: 400 });

  const supabase = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, portal_email, bitacora_template')
    .eq('id', agentId)
    .eq('portal_email', resolved.portalEmail)
    .maybeSingle();
  if (!agent) return NextResponse.json({ error: 'agent not found or not in org' }, { status: 404 });

  const template = agent.bitacora_template as {
    url?:      string;
    mapping?:  { columns?: Record<string, string>; human_only_columns?: string[] };
    [k: string]: unknown;
  } | null;
  if (!template?.mapping) {
    return NextResponse.json({ error: 'no template uploaded — sube una plantilla primero' }, { status: 404 });
  }

  let body: { human_only_columns?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (!Array.isArray(body.human_only_columns)) {
    return NextResponse.json({ error: 'human_only_columns must be an array of column letters' }, { status: 400 });
  }

  // Solo permitir cols que existen en el mapping actual (no letters random)
  const validCols = new Set(Object.keys(template.mapping.columns ?? {}).map(c => c.toUpperCase()));
  const humanOnly = [...new Set(body.human_only_columns.map(c => String(c).toUpperCase()))]
    .filter(c => validCols.has(c));

  const updatedTemplate = {
    ...template,
    mapping: {
      ...template.mapping,
      human_only_columns: humanOnly,
    },
  };

  const { error } = await supabase
    .from('voice_agents')
    .update({ bitacora_template: updatedTemplate })
    .eq('id', agentId);

  if (error) {
    console.error('[template-config] update failed:', error);
    return NextResponse.json({ error: 'update failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, human_only_columns: humanOnly });
}
