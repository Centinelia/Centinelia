import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import { buildBitacoraExcelForAgent, sanitizeBusinessName } from '@/lib/bitacora/build-excel';
import { monthStart } from '@/lib/bitacora/schedule';
import type { IncidentRow } from '@/app/portal/[token]/oficina/bitacora/loadBitacoraData';
import type { TemplateMapping } from '@/lib/bitacora/template-analyzer';
import { HIDDEN_ID_HEADER } from '@/lib/bitacora/template-render';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024; // 10MB

interface TemplateConfig {
  url:      string;
  mapping:  TemplateMapping;
  [k: string]: unknown;
}

/** Verifica que el agent sea de la org del token (evita IDOR). */
async function verifyAgent(
  supabase: ReturnType<typeof createAdminClient>,
  agentId: string,
  portalEmail: string,
) {
  const { data } = await supabase
    .from('voice_agents')
    .select('id, agent_name, business_name, bitacora_template, portal_email')
    .eq('id', agentId)
    .eq('portal_email', portalEmail)
    .maybeSingle();
  return data as { id: string; agent_name: string; business_name: string; bitacora_template: TemplateConfig | null; portal_email: string } | null;
}

function monthKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function livePathFor(portalEmail: string, agentId: string, monthKey: string): string {
  return `${portalEmail}/${agentId}/${monthKey}.xlsx`;
}

/**
 * GET → baja el archivo live del mes en curso (o el mes indicado via ?month=YYYY-MM).
 * Si el empleado tiene template custom y hay live file en storage, retorna ese.
 * Si no, genera on-demand desde el template (o formato default si no hay template).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'invalid token' }, { status: 404 });

  const agentId = req.nextUrl.searchParams.get('agent_id');
  if (!agentId) return NextResponse.json({ error: 'agent_id query param required' }, { status: 400 });

  const supabase = createAdminClient();
  const agent = await verifyAgent(supabase, agentId, resolved.portalEmail);
  if (!agent) return NextResponse.json({ error: 'agent not found or not in org' }, { status: 404 });

  const monthParam = req.nextUrl.searchParams.get('month');
  const targetMonthStart = monthParam
    ? new Date(`${monthParam}-01T00:00:00`)
    : monthStart(new Date());
  const monthKey = monthKeyOf(targetMonthStart);
  const livePath = livePathFor(resolved.portalEmail, agentId, monthKey);

  // Path 1: live file existe (empleado con template custom + al menos un cron pasado)
  const { data: liveData } = await supabase.storage.from('bitacora-live').download(livePath);
  if (liveData) {
    const buf = Buffer.from(await liveData.arrayBuffer());
    return excelResponse(buf, filenameFor(agent.business_name, agent.agent_name, monthKey));
  }

  // Path 2: no live file. Generar ephemeral desde template (o default).
  const monthEnd = new Date(targetMonthStart);
  monthEnd.setMonth(targetMonthStart.getMonth() + 1);
  const { data: monthIncidents } = await supabase
    .from('client_incidents')
    .select('*')
    .eq('agent_id', agentId)
    .gte('created_at', targetMonthStart.toISOString())
    .lt('created_at', monthEnd.toISOString())
    .order('created_at', { ascending: true });

  const buf = await buildBitacoraExcelForAgent(supabase, agentId, {
    incidents:     (monthIncidents ?? []) as IncidentRow[],
    businessName:  agent.business_name,
    rangeStartISO: targetMonthStart.toISOString(),
    mode:          'monthly',
  });
  return excelResponse(buf, filenameFor(agent.business_name, agent.agent_name, monthKey));
}

/**
 * POST multipart → sube la versión editada del cliente. Reemplaza el live file
 * en storage. Validaciones:
 *   - Ext .xlsx
 *   - Tamaño < 10MB
 *   - Archivo parseable con ExcelJS
 *   - Al menos una sheet contiene la col oculta con HIDDEN_ID_HEADER (evita
 *     que el cliente suba un archivo completamente distinto que rompa la
 *     preservación de identidad)
 *
 * Sin este endpoint, cualquier edición manual del cliente en el archivo del
 * correo se perdía en el próximo envío del cron. Con esto, el cliente puede
 * bajar, editar (cualquier col, no solo human_only), re-subir, y la próxima
 * generación del cron parte de SU versión editada.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'invalid token' }, { status: 404 });

  const agentId = req.nextUrl.searchParams.get('agent_id');
  if (!agentId) return NextResponse.json({ error: 'agent_id query param required' }, { status: 400 });

  const supabase = createAdminClient();
  const agent = await verifyAgent(supabase, agentId, resolved.portalEmail);
  if (!agent) return NextResponse.json({ error: 'agent not found or not in org' }, { status: 404 });

  if (!agent.bitacora_template?.url) {
    return NextResponse.json({
      error: 'Este empleado no tiene plantilla personalizada. Subir un archivo editado solo aplica cuando usaste tu propia plantilla.',
    }, { status: 400 });
  }

  const monthParam = req.nextUrl.searchParams.get('month');
  const targetMonthStart = monthParam
    ? new Date(`${monthParam}-01T00:00:00`)
    : monthStart(new Date());
  const monthKey = monthKeyOf(targetMonthStart);
  const livePath = livePathFor(resolved.portalEmail, agentId, monthKey);

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'file required' }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: 'archivo vacío' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'archivo muy grande (max 10MB)' }, { status: 413 });

  const nameLower = file.name.toLowerCase();
  if (!nameLower.endsWith('.xlsx') && !nameLower.endsWith('.xls')) {
    return NextResponse.json({ error: 'formato no soportado (usa .xlsx)' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Validar que sea parseable + tenga la col oculta en al menos una sheet
  const { Workbook } = await import('exceljs');
  try {
    const wb = new Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    if (wb.worksheets.length === 0) {
      return NextResponse.json({ error: 'archivo sin hojas' }, { status: 422 });
    }
    let foundHidden = false;
    for (const ws of wb.worksheets) {
      ws.getRow(1).eachCell({ includeEmpty: true }, cell => {
        if (cell.value === HIDDEN_ID_HEADER) foundHidden = true;
      });
      if (foundHidden) break;
    }
    if (!foundHidden) {
      return NextResponse.json({
        error: `No detecté la columna oculta que rastrea los IDs de cada incidencia. Asegúrate de subir el archivo que bajaste antes desde el portal (no un archivo desde cero). Si borraste la columna oculta al editar, baja de nuevo el archivo y edita a partir de ese.`,
      }, { status: 422 });
    }
  } catch (err) {
    return NextResponse.json({ error: `archivo no parseable: ${(err as Error).message}` }, { status: 422 });
  }

  const { error: uploadErr } = await supabase.storage
    .from('bitacora-live')
    .upload(livePath, buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert:      true,
    });
  if (uploadErr) {
    console.error('[live-upload] storage upload failed:', uploadErr);
    return NextResponse.json({ error: 'no se pudo guardar' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, month: monthKey });
}

function excelResponse(buffer: Buffer, filename: string): NextResponse {
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control':       'no-store',
    },
  });
}

function filenameFor(businessName: string, agentName: string, monthKey: string): string {
  return `bitacora-${sanitizeBusinessName(businessName)}-${agentName.toLowerCase()}-${monthKey}.xlsx`;
}
