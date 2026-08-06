import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { traceVoiceCall } from '@/lib/observability/voice-trace';

/**
 * agregar_tag_contacto — tool para que el empleado etiquete a un contacto
 * de outbound_contacts durante o después de una conversación. Los tags
 * alimentan la segmentación de campañas.
 *
 * Match por sufijo de 10 dígitos (mismo pattern que marcar_no_llamar)
 * para tolerar variaciones de formato (+52..., 528..., 8112345678).
 */

function digitsOnly(s: string): string {
  return (s ?? '').replace(/\D+/g, '');
}

function sanitizeTag(raw: string): string {
  return raw.trim().toLowerCase().slice(0, 40);
}

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');

  const body = await req.json();
  const args = (body.message?.toolCallList ?? body.toolCallList)?.[0]?.function?.arguments ?? body;
  const { telefono, tag, motivo } = args as { telefono: string; tag: string; motivo?: string };

  const startedAt = Date.now();
  const sessionId = (body.message?.call?.id as string) ?? null;
  const trace = (result: unknown, ok = true) => traceVoiceCall({
    toolName: 'agregar_tag_contacto', agentId: agent_id ?? '', sessionId, input: args, result, ok, startedAt,
  });

  const cleanTag = sanitizeTag(tag ?? '');
  if (!agent_id || !telefono?.trim() || !cleanTag) {
    trace({ error: 'missing_params' }, false);
    return NextResponse.json({ result: 'No pude agregar el tag: falta teléfono o tag.' });
  }

  const supabase = createAdminClient();
  const suffix = digitsOnly(telefono).slice(-10);
  if (suffix.length < 10) {
    trace({ error: 'invalid_phone' }, false);
    return NextResponse.json({ result: 'Número de teléfono inválido.' });
  }

  // Match contactos del mismo agent por sufijo
  const { data: matches, error: matchErr } = await supabase
    .from('outbound_contacts')
    .select('id, telefono, tags')
    .eq('agent_id', agent_id);

  if (matchErr || !matches) {
    trace({ error: matchErr?.message ?? 'no_matches' }, false);
    return NextResponse.json({ result: 'No pude buscar el contacto.' });
  }

  const targets = matches.filter(r => digitsOnly(r.telefono as string).endsWith(suffix));
  if (targets.length === 0) {
    trace({ found: 0, telefono });
    return NextResponse.json({ result: `No encontré un contacto con el teléfono ${telefono}. El tag no se agregó.` });
  }

  // Agrega el tag a cada match (dedup, cap 20)
  let touched = 0;
  for (const c of targets) {
    const existing = (c.tags as string[] | null) ?? [];
    if (existing.includes(cleanTag)) continue;
    const next = [...existing, cleanTag].slice(0, 20);
    const { error } = await supabase
      .from('outbound_contacts')
      .update({ tags: next })
      .eq('id', c.id as string);
    if (!error) touched++;
  }

  trace({ ok: true, touched, tag: cleanTag, telefono, motivo: motivo ?? null });
  const msg = touched > 0
    ? `Listo. Agregué el tag "${cleanTag}" al contacto ${telefono}.`
    : `El contacto ${telefono} ya tenía el tag "${cleanTag}". Sin cambios.`;
  return NextResponse.json({ result: msg });
}
