import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { toolResponse } from '@/lib/voice/tool-response';

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');

  const body = await req.json();
  const call = (body.message?.toolCallList ?? body.toolCallList)?.[0];
  const toolCallId: string = call?.id ?? '';
  const args = call?.function?.arguments ?? body;
  if (!agent_id) return toolResponse(toolCallId, 'Error de configuración.');
  const { folio, documento, tramite_tipo } = args as {
    folio: string;
    documento: string;
    tramite_tipo?: string;
  };

  if (!folio || !documento) {
    return toolResponse(toolCallId, 'Se requiere el folio y el nombre del documento.');
  }

  const supabase = createAdminClient();

  const { data: report } = await supabase
    .from('civic_reports')
    .select('folio, docs_received, tramite_tipo')
    .eq('agent_id', agent_id)
    .eq('folio', folio.toUpperCase())
    .single();

  if (!report) {
    return toolResponse(toolCallId, `No encontré el expediente con folio ${folio}.`);
  }

  const existing: string[] = ((report as any).docs_received as string[] | null) ?? [];
  const docName = documento.trim();

  if (existing.includes(docName)) {
    return toolResponse(toolCallId, `El documento "${docName}" ya estaba registrado en el expediente ${folio}.`);
  }

  const updated = [...existing, docName];
  const patch: Record<string, unknown> = {
    docs_received: updated,
    updated_at: new Date().toISOString(),
  };
  if (tramite_tipo && !(report as any).tramite_tipo) {
    patch.tramite_tipo = tramite_tipo;
  }

  await supabase
    .from('civic_reports')
    .update(patch)
    .eq('agent_id', agent_id)
    .eq('folio', folio.toUpperCase());

  return toolResponse(toolCallId, `Documento "${docName}" registrado correctamente en el expediente ${folio}. Ahora tiene ${updated.length} documento${updated.length !== 1 ? 's' : ''} registrado${updated.length !== 1 ? 's' : ''}.`);
}
