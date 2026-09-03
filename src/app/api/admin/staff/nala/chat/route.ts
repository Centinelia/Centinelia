import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { isAdmin } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { MEERKAT_ROLES } from '@/lib/portal/meerkat-roles';
import { executeAgentTool } from '@/lib/tools/executor';
import { getCentineliaFiscalConfig, isFacturamaSandbox } from '@/lib/invoicing/facturama/centinelia-preset';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const NALA = MEERKAT_ROLES.find(r => r.id === 'nala')!;
const MODEL = 'claude-sonnet-4-5';
const MAX_ITERATIONS = 8;

// ─── Tool schemas para Nala (Anthropic format) ────────────────────────────
const NALA_TOOLS: Anthropic.Tool[] = [
  {
    name: 'emitir_cfdi_centinelia',
    description:
      'Emite un CFDI 4.0 tipo Ingreso a nombre de Centinelia hacia un cliente. Por default es PPD (Pago en parcialidades o diferido) con forma de pago 99 (Por definir). Adjunta XML + PDF y los envía por correo al receptor si se pasa receptor_email.',
    input_schema: {
      type: 'object',
      properties: {
        receptor_rfc:    { type: 'string', description: 'RFC del receptor (13 chars persona moral, 13 chars persona física).' },
        receptor_nombre: { type: 'string', description: 'Razón social o nombre del receptor, exactamente como aparece en su CSF. MAYÚSCULAS sin acentos.' },
        receptor_cp:     { type: 'string', description: 'Código postal del receptor (5 dígitos).' },
        receptor_regimen:{ type: 'string', description: 'Régimen fiscal SAT del receptor. Default 601 (Personas Morales). Personas físicas usan 612.' },
        receptor_email:  { type: 'string', description: 'Correo del receptor a donde se manda el CFDI. Omite si el cliente no dio correo.' },
        uso_cfdi:        { type: 'string', description: 'Uso CFDI. Default G03 (Gastos en general). Otros comunes: G01 (Adquisición mercancía), G02 (Devolución).' },
        forma_pago:      { type: 'string', description: 'Forma de pago SAT. Default 99 (Por definir, típico en PPD).' },
        metodo_pago:     { type: 'string', enum: ['PUE', 'PPD'], description: 'PPD (default) si va a pagar después. PUE si ya pagó.' },
        items: {
          type: 'array',
          description: 'Conceptos a facturar. Al menos 1.',
          items: {
            type: 'object',
            properties: {
              descripcion:    { type: 'string' },
              valor_unitario: { type: 'number' },
              cantidad:       { type: 'number', description: 'Default 1.' },
              con_iva:        { type: 'boolean', description: 'Default true (IVA 16%). Pon false solo si el concepto está exento.' },
            },
            required: ['descripcion', 'valor_unitario'],
          },
        },
      },
      required: ['receptor_rfc', 'receptor_nombre', 'receptor_cp', 'items'],
    },
  },
  {
    name: 'solicitar_complemento_pago',
    description:
      'Emite un Complemento de Pago (REP, CFDI tipo P) referenciando el UUID de un CFDI PPD ya timbrado. Se dispara cuando llega comprobante SPEI del cliente. Adjunta XML + PDF y los envía por correo al receptor si se pasa receptor_email.',
    input_schema: {
      type: 'object',
      properties: {
        cfdi_uuid_original: { type: 'string', description: 'UUID (36 chars, formato 8-4-4-4-12) del CFDI PPD original al que se le está aplicando el pago.' },
        monto_pagado:       { type: 'number', description: 'Monto exacto del pago recibido (con IVA, tal como aparece en el SPEI).' },
        fecha_pago:         { type: 'string', description: 'Fecha y hora del pago SPEI en ISO 8601 (YYYY-MM-DDTHH:MM:SS).' },
        num_operacion:      { type: 'string', description: 'Número de operación bancaria del SPEI. Opcional pero recomendado.' },
        num_parcialidad:    { type: 'number', description: 'Número de parcialidad. Default 1 (pago único o primer pago).' },
        saldo_anterior:     { type: 'number', description: 'Saldo pendiente ANTES de este pago. Default = monto_pagado (pago único).' },
        saldo_insoluto:     { type: 'number', description: 'Saldo pendiente DESPUÉS de este pago. Default = max(0, saldo_anterior - monto_pagado).' },
        iva_base:           { type: 'number', description: 'Base del IVA del CFDI original (subtotal sin IVA). Requerido si hubo IVA.' },
        iva_importe:        { type: 'number', description: 'Importe del IVA del CFDI original. Requerido si hubo IVA.' },
        forma_pago:         { type: 'string', description: 'Forma de pago SAT. Default 03 (Transferencia electrónica). Otros: 01 (Efectivo), 04 (Tarjeta crédito), 28 (Débito).' },
        receptor_rfc:       { type: 'string' },
        receptor_nombre:    { type: 'string' },
        receptor_cp:        { type: 'string' },
        receptor_regimen:   { type: 'string', description: 'Default 601.' },
        receptor_email:     { type: 'string', description: 'Correo del receptor. Omite si no se conoce.' },
      },
      required: ['cfdi_uuid_original', 'monto_pagado', 'fecha_pago', 'receptor_rfc', 'receptor_nombre', 'receptor_cp'],
    },
  },
];

interface ChatMessageIn {
  role: 'user' | 'assistant';
  content: string;
}

function buildSystemPrompt(): string {
  const cfg = getCentineliaFiscalConfig();
  const sandbox = isFacturamaSandbox();
  return `Eres ${NALA.nombre}, ${NALA.rol} interna de Centinelia. Hablas con Nazre (el dueño) desde el admin. Tu misión: timbrar CFDIs y Complementos de Pago cuando él te lo pida, y confirmarle cada acción con el UUID resultante.

${NALA.promptPersonalidad}

DATOS FISCALES DE CENTINELIA (siempre usa estos como emisor, no preguntes):
- RFC: ${cfg.rfc}
- Régimen: ${cfg.regimenFiscal}
- Razón social: ${cfg.razonSocial}
- CP expedición: ${cfg.lugarExpedicion}
- Correo contacto: ${cfg.emailContacto}

PAC actual: Facturama en modo ${sandbox ? 'SANDBOX (los UUIDs generados NO tienen validez fiscal — son de prueba)' : 'PROD (timbres válidos fiscalmente)'}.

REGLA DE COMUNICACIÓN:
- Ve directo al grano. Nazre te conoce, no repitas cortesías largas.
- Cuando timbres algo, dile: UUID + monto + si se envió por correo. Nada más.
- Si te faltan datos del receptor (RFC, razón social, CP, correo), pide EXACTAMENTE los que faltan, no todos.
- No inventes datos. Si Nazre no te dio el UUID original para un REP, pídelo textual.
- Si un timbre falla, dile el error específico y sugiere qué campo revisar.`;
}

export async function POST(req: NextRequest) {
  if (!await isAdmin()) {
    return NextResponse.json({ error: 'admin only' }, { status: 401 });
  }

  const { messages } = await req.json() as { messages: ChatMessageIn[] };
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'messages requerido' }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY missing' }, { status: 500 });

  const anthropic = new Anthropic({ apiKey });
  const supabase = createAdminClient();

  const systemPrompt = buildSystemPrompt();

  // Transcript acumula todos los mensajes (user + assistant + tool_use + tool_result)
  const transcript: Anthropic.MessageParam[] = messages.map(m => ({
    role: m.role,
    content: m.content,
  }));

  // Eventos que devolvemos al frontend para que muestre el progreso
  const events: Array<
    | { kind: 'text'; text: string }
    | { kind: 'tool_call'; name: string; input: Record<string, unknown> }
    | { kind: 'tool_result'; name: string; result: unknown }
    | { kind: 'error'; error: string }
  > = [];

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let resp: Anthropic.Message;
    try {
      resp = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 2048,
        system: systemPrompt,
        tools: NALA_TOOLS,
        messages: transcript,
      });
    } catch (e) {
      events.push({ kind: 'error', error: `Anthropic API: ${(e as Error).message}` });
      break;
    }

    // Añade la respuesta al transcript
    transcript.push({ role: 'assistant', content: resp.content });

    // Extrae texto y tool_uses
    const toolUses: Anthropic.ToolUseBlock[] = [];
    for (const block of resp.content) {
      if (block.type === 'text') {
        events.push({ kind: 'text', text: block.text });
      } else if (block.type === 'tool_use') {
        toolUses.push(block);
        events.push({
          kind: 'tool_call',
          name: block.name,
          input: block.input as Record<string, unknown>,
        });
      }
    }

    if (resp.stop_reason !== 'tool_use' || toolUses.length === 0) {
      break;
    }

    // Ejecuta cada tool y añade tool_result al transcript
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      let result: unknown;
      try {
        result = await executeAgentTool(tu.name, tu.input as Record<string, unknown>, {
          agentId:      'nala-internal',
          portalEmail:  'centinelia-internal',
          agentName:    'Nala',
          businessName: 'Centinelia',
          portalToken:  '',
          agent:        {},
          supabase,
          channel:      'chat',
          userContext:  messages[messages.length - 1]?.content ?? '',
        });
      } catch (e) {
        result = { ok: false, error: `executor exception: ${(e as Error).message}` };
      }
      events.push({ kind: 'tool_result', name: tu.name, result });
      toolResults.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: typeof result === 'string' ? result : JSON.stringify(result),
      });
    }

    transcript.push({ role: 'user', content: toolResults });
  }

  return NextResponse.json({ events });
}
