import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import { Workbook } from 'exceljs';

export const dynamic = 'force-dynamic';

/**
 * Devuelve la lista completa de columnas del template subido: letra + header.
 * Se usa en el UI de mapping para mostrar cols sin mapear y cols del grid,
 * no solo las que Claude asignó a un campo canónico.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'invalid token' }, { status: 404 });

  const agentId = req.nextUrl.searchParams.get('agent_id');
  if (!agentId) return NextResponse.json({ error: 'agent_id required' }, { status: 400 });

  const supabase = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, bitacora_template')
    .eq('id', agentId)
    .eq('portal_email', resolved.portalEmail)
    .maybeSingle();
  if (!agent) return NextResponse.json({ error: 'agent not found' }, { status: 404 });

  const template = agent.bitacora_template as {
    url?:      string;
    mapping?:  { sheet_name?: string; insertion_row?: number };
  } | null;
  if (!template?.url || !template.mapping?.sheet_name || !template.mapping.insertion_row) {
    return NextResponse.json({ columns: [] });
  }

  const { data: fileData, error: dlErr } = await supabase.storage
    .from('bitacora-templates')
    .download(template.url);
  if (dlErr || !fileData) {
    return NextResponse.json({ error: `download failed: ${dlErr?.message ?? 'no data'}` }, { status: 500 });
  }

  const buffer = Buffer.from(await fileData.arrayBuffer());
  const wb = new Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets.find(s => s.name === template.mapping!.sheet_name) ?? wb.worksheets[0];
  if (!ws) return NextResponse.json({ columns: [] });

  const insertionRow = template.mapping.insertion_row;
  // Los headers suelen vivir en insertion_row - 1 (fila inmediata arriba de
  // los datos). Algunas plantillas tienen títulos mergeados en insertion_row-2
  // y headers en insertion_row-1; otras al revés. Preferimos el más cercano
  // a los datos y hacemos fallback al anterior.
  const primary  = ws.getRow(Math.max(1, insertionRow - 1));
  const fallback = ws.getRow(Math.max(1, insertionRow - 2));
  const maxCol = Math.min(30, Math.max(primary.cellCount, fallback.cellCount, 1));

  function cellText(cell: unknown): string | null {
    const v = (cell as { value?: unknown })?.value;
    if (v == null) return null;
    if (typeof v === 'string') return v.trim() || null;
    if (typeof v === 'number') return String(v);
    if (typeof v === 'object' && 'text' in (v as object)) {
      const t = String((v as { text: unknown }).text ?? '').trim();
      return t || null;
    }
    const s = String(v).trim();
    return s || null;
  }

  function letterFromIndex(i: number): string {
    let n = i;
    let s = '';
    while (n > 0) {
      const rem = (n - 1) % 26;
      s = String.fromCharCode(65 + rem) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  const columns: Array<{ col: string; header: string | null }> = [];
  for (let c = 1; c <= maxCol; c++) {
    const primaryHeader  = cellText(primary.getCell(c));
    const fallbackHeader = cellText(fallback.getCell(c));
    columns.push({ col: letterFromIndex(c), header: primaryHeader ?? fallbackHeader });
  }

  return NextResponse.json({ columns });
}
