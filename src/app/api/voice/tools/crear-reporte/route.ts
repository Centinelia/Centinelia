import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { generateFolio } from '@/lib/civic/folio';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { dedupLookup, dedupStore } from '@/lib/tools/dedup/with-dedup';
import { toolResponse } from '@/lib/voice/tool-response';

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');

  const body = await req.json();
  const call = (body.message?.toolCallList ?? body.toolCallList)?.[0];
  const args = call?.function?.arguments ?? body;
  const toolCallId: string = call?.id ?? '';
  if (!agent_id) return toolResponse(toolCallId, 'Error de configuración.');
  const { categoria, descripcion, ubicacion, nombre_ciudadano, numero_ciudadano, tipo_tramite, area_responsable } = args;

  const supabase = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('business_name, transfer_whatsapp, portal_email')
    .eq('id', agent_id)
    .single();

  const dedupCtx = {
    agentId:     agent_id,
    portalEmail: (agent as { portal_email?: string })?.portal_email ?? '',
    toolName:    'crear_reporte',
    args:        args as Record<string, unknown>,
    channel:     'voice' as const,
    toolCallId,
  };
  const cached = await dedupLookup<{ result: string; attach_url: string; status_url: string; folio: string }>(dedupCtx);
  if (cached) return toolResponse(toolCallId, cached.result);

  const folio = await generateFolio(agent_id, supabase);

  await supabase.from('civic_reports').insert({
    agent_id,
    folio,
    category:          tipo_tramite ? 'tramite' : (categoria ?? 'otro'),
    description:       descripcion       ?? null,
    location_text:     ubicacion         ?? null,
    caller_name:       nombre_ciudadano  ?? null,
    caller_number:     numero_ciudadano  ?? null,
    tramite_tipo:      tipo_tramite      ?? null,
    area_responsable:  area_responsable  ?? null,
    status:            'abierto',
  });

  if (agent?.transfer_whatsapp) {
    const msg = [
      `📋 *Nuevo reporte — ${agent.business_name}*`,
      `Folio: *${folio}*`,
      tipo_tramite       ? `Trámite: ${tipo_tramite}`         : categoria ? `Tipo: ${categoria}` : null,
      area_responsable   ? `Área: ${area_responsable}`        : null,
      descripcion        ? `Descripción: ${descripcion}`      : null,
      ubicacion          ? `Ubicación: ${ubicacion}`          : null,
      nombre_ciudadano   ? `Ciudadano: ${nombre_ciudadano}`   : null,
      numero_ciudadano   ? `Teléfono: ${numero_ciudadano}`    : null,
    ].filter(Boolean).join('\n');
    await sendWhatsApp(agent.transfer_whatsapp, msg);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
  const attachUrl = `${appUrl}/r/${folio}/adjuntar`;
  const statusUrl = `${appUrl}/reporte/${folio}`;
  const payload = {
    result: `Su reporte ha sido registrado exitosamente. Su folio es ${folio}. Puede consultar el estatus en ${statusUrl}. Si tiene fotos del problema, puede subirlas en ${attachUrl}${tipo_tramite ? `. El área de ${area_responsable ?? tipo_tramite} le contactará cuando su expediente avance` : ''}.`,
    attach_url: attachUrl,
    status_url: statusUrl,
    folio,
  };
  await dedupStore(dedupCtx, payload);
  return toolResponse(toolCallId, payload.result);
}
