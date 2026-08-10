import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { traceVoiceCall } from '@/lib/observability/voice-trace';
import { upsertOutboundContactWithDedup } from '@/lib/leads/dedup';

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');

  const body = await req.json();
  const args = (body.message?.toolCallList ?? body.toolCallList)?.[0]?.function?.arguments ?? body;
  const { nombre, telefono, motivo, scheduled_at } = args as {
    nombre?: string; telefono?: string; motivo?: string; scheduled_at?: string;
  };
  const startedAt = Date.now();
  const sessionId = (body.message?.call?.id as string) ?? null;

  if (!agent_id) return NextResponse.json({ result: 'Error de configuración.' });
  const telefonoTrim = telefono?.trim();
  if (!telefonoTrim) {
    return NextResponse.json({ result: 'Necesito el teléfono del contacto para agregarlo a la lista.' });
  }

  const supabase = createAdminClient();

  try {
    const upsert = await upsertOutboundContactWithDedup(supabase, {
      agentId:     agent_id,
      nombre:      nombre ?? null,
      telefono:    telefonoTrim,
      motivo:      motivo ?? null,
      scheduledAt: scheduled_at ?? null,
      source:      'llamada_entrante',
    });

    traceVoiceCall({
      toolName: 'crear_contacto_saliente', agentId: agent_id, sessionId, input: args,
      result: { ok: true, action: upsert.action, contact: { id: upsert.id, nombre, telefono: telefonoTrim } },
      startedAt,
    });

    const resultMsg = upsert.action === 'updated'
      ? 'Ya tenía este contacto en la lista de salientes, actualicé sus datos.'
      : 'Contacto agregado a la lista de salientes. Se le llamará después.';
    return NextResponse.json({ result: resultMsg });
  } catch {
    traceVoiceCall({
      toolName: 'crear_contacto_saliente', agentId: agent_id, sessionId, input: args,
      result: { ok: false },
      startedAt,
    });
    return NextResponse.json({ result: 'No pude agregar el contacto a la lista, intento de nuevo en un momento.' });
  }
}
