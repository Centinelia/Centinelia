import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import { CANONICAL_FIELDS, type CanonicalField } from '@/lib/bitacora/template-analyzer';

export const dynamic = 'force-dynamic';

/**
 * Actualiza el mapping de una plantilla ya subida sin re-analizar el archivo.
 * Permite al cliente overridear las decisiones de Claude en 2 ejes:
 *
 * - `human_only_columns` — array de letras de col que Nelia NUNCA escribe.
 * - `columns` — mapping col letter → campo canónico (para corregir si Claude
 *   mapeó mal, ej: puso col D=sucursal cuando era business_name). Pasa `null`
 *   como valor para desmapear una col (Nelia deja de escribirla).
 *
 * sheet_name, insertion_row, verification_grid NO editables aquí — requieren
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
    mapping?:  {
      columns?:            Record<string, string>;
      human_only_columns?: string[];
      verification_grid?:  Record<string, string>;
    };
    [k: string]: unknown;
  } | null;
  if (!template?.mapping) {
    return NextResponse.json({ error: 'no template uploaded — sube una plantilla primero' }, { status: 404 });
  }

  let body: { human_only_columns?: unknown; columns?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  // Working copy del mapping actual
  let nextColumns: Record<string, CanonicalField> = { ...(template.mapping.columns ?? {}) } as Record<string, CanonicalField>;
  let nextHumanOnly: string[] = [...(template.mapping.human_only_columns ?? [])];

  // 1. Actualizar columns (opcional)
  if (body.columns !== undefined) {
    if (!body.columns || typeof body.columns !== 'object' || Array.isArray(body.columns)) {
      return NextResponse.json({ error: 'columns debe ser objeto { colLetter: canonicalField | null }' }, { status: 400 });
    }
    const gridCols = new Set(Object.values(template.mapping.verification_grid ?? {}).map(c => String(c).toUpperCase()));
    const updates = body.columns as Record<string, unknown>;
    for (const [rawCol, rawField] of Object.entries(updates)) {
      const col = String(rawCol).toUpperCase();
      if (!/^[A-Z]{1,3}$/.test(col)) continue;
      // No permitir mapear una col que ya está en verification_grid
      if (gridCols.has(col)) {
        return NextResponse.json({ error: `col ${col} está en el grid semanal — no puede mapearse a un campo` }, { status: 400 });
      }
      if (rawField === null) {
        delete nextColumns[col];
        continue;
      }
      if (typeof rawField !== 'string') continue;
      if (!(CANONICAL_FIELDS as readonly string[]).includes(rawField)) {
        return NextResponse.json({ error: `campo canónico inválido: "${rawField}"` }, { status: 400 });
      }
      nextColumns[col] = rawField as CanonicalField;
    }
    // Filtrar human_only para dejar solo cols que sigan en mapping
    const validAfter = new Set(Object.keys(nextColumns));
    nextHumanOnly = nextHumanOnly.filter(c => validAfter.has(c));
  }

  // 2. Actualizar human_only_columns (opcional)
  if (body.human_only_columns !== undefined) {
    if (!Array.isArray(body.human_only_columns)) {
      return NextResponse.json({ error: 'human_only_columns debe ser array de letras' }, { status: 400 });
    }
    const validCols = new Set(Object.keys(nextColumns).map(c => c.toUpperCase()));
    nextHumanOnly = [...new Set(body.human_only_columns.map(c => String(c).toUpperCase()))]
      .filter(c => validCols.has(c));
  }

  const updatedTemplate = {
    ...template,
    mapping: {
      ...template.mapping,
      columns:            nextColumns,
      human_only_columns: nextHumanOnly,
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

  return NextResponse.json({
    ok:                  true,
    columns:             nextColumns,
    human_only_columns:  nextHumanOnly,
  });
}
