import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import { Workbook } from 'exceljs';
import { analyzeTemplate } from '@/lib/bitacora/template-analyzer';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Aplica una sugerencia del analyzer directamente al xlsx del cliente y
 * re-analiza. Sin costo adicional al pool — el cliente ya pagó por el
 * analyze inicial que produjo la sugerencia.
 *
 * Tipos soportados:
 * - rename_header: cambia el header row 2 de la col indicada
 * - add_header: escribe el header propuesto en row 2 de la col
 * - remove_col: splice de la col completa
 *
 * Otros tipos (widen_col, simplify_grid, other) requieren cambios más
 * complejos — devuelven 400 con nota "no aplicable automáticamente".
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
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
  if (!agent?.bitacora_template) return NextResponse.json({ error: 'no template uploaded' }, { status: 404 });

  const template = agent.bitacora_template as {
    url: string;
    filename?: string;
    suggestions?: Array<{ type: string; col?: string; proposed?: string | null }>;
  };

  const body = await req.json().catch(() => ({} as { suggestion_index?: number }));
  const idx = Number(body.suggestion_index);
  if (!Number.isInteger(idx) || idx < 0 || idx >= (template.suggestions?.length ?? 0)) {
    return NextResponse.json({ error: 'suggestion_index inválido' }, { status: 400 });
  }
  const suggestion = template.suggestions![idx];

  const AUTO_APPLICABLE = ['rename_header', 'add_header', 'remove_col'];
  if (!AUTO_APPLICABLE.includes(suggestion.type)) {
    return NextResponse.json({
      error: `Sugerencia tipo "${suggestion.type}" no puede aplicarse automáticamente. Edita tu Excel local y re-súbelo.`,
    }, { status: 400 });
  }

  if (!suggestion.col) {
    return NextResponse.json({ error: 'sugerencia sin col target' }, { status: 400 });
  }
  const colLetter = suggestion.col.toUpperCase();
  const colNum = colLetter.split('').reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0);

  // Descargar xlsx actual del bucket
  const { data: fileData, error: dlErr } = await supabase.storage
    .from('bitacora-templates').download(template.url);
  if (dlErr || !fileData) return NextResponse.json({ error: 'no se pudo descargar el template actual' }, { status: 500 });

  const wb = new Workbook();
  await wb.xlsx.load(await fileData.arrayBuffer());

  for (const ws of wb.worksheets) {
    if (suggestion.type === 'rename_header' || suggestion.type === 'add_header') {
      if (!suggestion.proposed) {
        return NextResponse.json({ error: 'sugerencia sin proposed value' }, { status: 400 });
      }
      ws.getRow(2).getCell(colNum).value = suggestion.proposed;
    } else if (suggestion.type === 'remove_col') {
      ws.spliceColumns(colNum, 1);
    }
  }

  const updatedBuf = Buffer.from(await wb.xlsx.writeBuffer());

  // Subir la nueva versión (path nuevo con timestamp para audit trail)
  const timestamp = Date.now();
  const newPath = `${resolved.portalEmail}/${agentId}/template-${timestamp}.xlsx`;
  const { error: upErr } = await supabase.storage
    .from('bitacora-templates').upload(newPath, updatedBuf, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert:      true,
    });
  if (upErr) return NextResponse.json({ error: 'no se pudo guardar el nuevo template' }, { status: 500 });

  // Re-analizar
  let analysis;
  try {
    analysis = await analyzeTemplate(updatedBuf);
  } catch (err) {
    console.error('[apply-suggestion] re-analyze failed:', err);
    return NextResponse.json({ error: `Se guardó el cambio pero no pudimos re-analizar: ${(err as Error).message}` }, { status: 500 });
  }

  const updatedTemplate = {
    ...template,
    url:            newPath,
    mapping:        analysis.mapping,
    suggestions:    analysis.suggestions,
    updated_at:     new Date().toISOString(),
    updated_via:    `apply_suggestion_${suggestion.type}`,
    ai_usage:       analysis.usage,
  };
  const { error: dbErr } = await supabase
    .from('voice_agents')
    .update({ bitacora_template: updatedTemplate })
    .eq('id', agentId);
  if (dbErr) return NextResponse.json({ error: 'no se pudo actualizar mapping' }, { status: 500 });

  return NextResponse.json({
    ok:            true,
    applied:       { type: suggestion.type, col: colLetter, proposed: suggestion.proposed ?? null },
    mapping:       analysis.mapping,
    suggestions:   analysis.suggestions,
  });
}
