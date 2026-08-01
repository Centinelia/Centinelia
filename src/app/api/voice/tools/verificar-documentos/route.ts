import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { getTramiteDocs } from '@/lib/civic/folio';

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');
  if (!agent_id) return NextResponse.json({ result: 'Error de configuración.' });

  const body = await req.json();
  const args = (body.message?.toolCallList ?? body.toolCallList)?.[0]?.function?.arguments ?? body;
  const { folio, numero_ciudadano, tipo_tramite } = args as {
    folio?: string;
    numero_ciudadano?: string;
    tipo_tramite?: string;
  };

  const supabase = createAdminClient();
  const tramiteDocs = await getTramiteDocs(agent_id, supabase);

  // If only tipo_tramite provided (no existing report), just list required docs
  if (!folio && !numero_ciudadano && tipo_tramite) {
    const required = tramiteDocs[tipo_tramite];
    if (!required?.length) {
      return NextResponse.json({ result: `No tengo configurados los documentos requeridos para "${tipo_tramite}". Por favor consulte directamente con el departamento.` });
    }
    return NextResponse.json({
      result: `Para el trámite "${tipo_tramite}" se requieren los siguientes documentos:\n${required.map((d, i) => `${i + 1}. ${d}`).join('\n')}`,
    });
  }

  // Look up the report
  let query = supabase.from('civic_reports').select('folio, tramite_tipo, docs_received, status').eq('agent_id', agent_id);
  if (folio) {
    query = query.eq('folio', folio.toUpperCase());
  } else if (numero_ciudadano) {
    query = query.eq('caller_number', numero_ciudadano).order('created_at', { ascending: false }).limit(1);
  } else {
    return NextResponse.json({ result: 'Proporcione un folio o número de ciudadano para consultar.' });
  }

  const { data: reports } = await query;
  const report = Array.isArray(reports) ? reports[0] : reports;

  if (!report) {
    return NextResponse.json({ result: 'No encontré ningún expediente o reporte con esa información.' });
  }

  const tramiteTipo = (report as any).tramite_tipo ?? tipo_tramite;
  if (!tramiteTipo) {
    return NextResponse.json({ result: `El expediente con folio ${(report as any).folio} no tiene un tipo de trámite asociado. ¿Me puede indicar qué trámite está realizando?` });
  }

  const required: string[] = tramiteDocs[tramiteTipo] ?? [];
  if (!required.length) {
    return NextResponse.json({ result: `No tengo la lista de documentos requeridos para "${tramiteTipo}" en este sistema. Por favor pase directamente al módulo.` });
  }

  const received: string[] = ((report as any).docs_received as string[] | null) ?? [];
  const missing = required.filter(d => !received.includes(d));
  const done    = required.filter(d =>  received.includes(d));

  if (missing.length === 0) {
    return NextResponse.json({
      result: `¡Excelente! Su expediente con folio ${(report as any).folio} para "${tramiteTipo}" tiene todos los documentos completos:\n${done.map(d => `✓ ${d}`).join('\n')}\n\nSu trámite puede continuar con el siguiente paso del proceso.`,
    });
  }

  const lines = [
    `Expediente folio ${(report as any).folio} — ${tramiteTipo}:`,
    done.length > 0 ? `\nDocumentos recibidos:\n${done.map(d => `✓ ${d}`).join('\n')}` : null,
    `\nDocumentos pendientes:\n${missing.map(d => `✗ ${d}`).join('\n')}`,
    `\nLe faltan ${missing.length} documento${missing.length !== 1 ? 's' : ''} para completar su trámite.`,
  ].filter(Boolean).join('');

  return NextResponse.json({ result: lines });
}
