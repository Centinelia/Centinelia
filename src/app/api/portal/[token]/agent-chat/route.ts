import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { notionClient } from '@/lib/notion/client';

export const dynamic = 'force-dynamic';

const CREATE_CONTRACT_DRAFT_TOOL: Anthropic.Tool = {
  name: 'create_contract_draft',
  description: 'Crea un borrador de contrato de prestación de servicios para un cliente específico, basado en la plantilla del negocio. Úsala cuando el dueño te pida generar un contrato para un cliente, o cuando la conversación (llamada/correo) haya resultado en un acuerdo comercial.',
  input_schema: {
    type: 'object' as const,
    properties: {
      client_name:  { type: 'string', description: 'Nombre completo del cliente o razón social' },
      client_email: { type: 'string', description: 'Correo electrónico del cliente' },
      client_rfc:   { type: 'string', description: 'RFC del cliente (si se conoce)' },
      client_phone: { type: 'string', description: 'Teléfono del cliente (si se conoce)' },
      clause_overrides: {
        type: 'array',
        description: 'Ajustes a cláusulas específicas respecto a la plantilla base',
        items: {
          type: 'object',
          properties: {
            id:      { type: 'string', description: 'ID de la cláusula (ej: vigencia, monto, pago)' },
            enabled: { type: 'boolean', description: 'Si la cláusula debe incluirse' },
            body:    { type: 'string',  description: 'Texto personalizado de la cláusula' },
          },
          required: ['id'],
        },
      },
      notes:       { type: 'string', description: 'Notas internas para el dueño sobre este contrato' },
      source_type: { type: 'string', enum: ['llamada', 'correo', 'manual'], description: 'Origen del contrato' },
      source_ref:  { type: 'string', description: 'Referencia al origen (ej: ID de llamada, asunto de correo)' },
    },
    required: [],
  },
};

interface Params { params: Promise<{ token: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const { messages, agentId } = await req.json() as {
    messages: { role: string; content: string }[];
    agentId?: string;
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'Invalid messages' }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
  }

  const supabase = createAdminClient();

  const { data: accountAgent } = await supabase
    .from('voice_agents')
    .select('id, portal_email')
    .eq('portal_token', token)
    .single();
  if (!accountAgent) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  const targetQuery = agentId
    ? supabase.from('voice_agents').select('*').eq('id', agentId).eq('portal_email', accountAgent.portal_email).single()
    : supabase.from('voice_agents').select('*').eq('portal_token', token).single();
  const { data: agent } = await targetQuery;
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

  const agentName = (agent.agent_name as string | null)?.trim() || 'Centinelia';
  const agentRole = (agent.role as string | null)?.trim() || null;

  const sections: string[] = [];

  sections.push([
    '# Identidad',
    `Nombre: ${agentName}`,
    `Negocio: ${agent.business_name}`,
    agentRole ? `Rol: ${agentRole}` : '',
    (agent.business_description as string | null) ? `Descripción: ${agent.business_description}` : '',
  ].filter(Boolean).join('\n'));

  if ((agent.knowledge_base as string | null)?.trim()) {
    sections.push(`# Base de conocimiento del negocio\n${agent.knowledge_base}`);
  }
  if ((agent.role_knowledge_base as string | null)?.trim()) {
    sections.push(`# Instrucciones del rol${agentRole ? ` — ${agentRole}` : ''}\n${agent.role_knowledge_base}`);
  }
  if ((agent.role_learnings as string | null)?.trim()) {
    sections.push(`# Aprendizajes del agente\n${agent.role_learnings}`);
  }

  const { data: calls } = await supabase
    .from('voice_calls')
    .select('caller_number, duration_seconds, summary, outcome, created_at')
    .eq('agent_id', agent.id)
    .order('created_at', { ascending: false })
    .limit(20);

  if (calls?.length) {
    const lines = calls.map(c => {
      const date = new Date(c.created_at as string).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
      const mins = Math.round(((c.duration_seconds as number) || 0) / 60);
      return `- ${date} | ${(c.caller_number as string) || 'Desconocido'} | ${mins}min | ${(c.outcome as string) || 'otro'} | ${(c.summary as string) || 'Sin resumen'}`;
    });
    sections.push(`# Llamadas recientes (últimas 20)\n${lines.join('\n')}`);
  }

  const { data: inbox } = await supabase
    .from('ops_inbox')
    .select('id, email_from, email_subject, category, ai_summary, status, attachments, created_at')
    .eq('agent_id', agent.id)
    .order('created_at', { ascending: false })
    .limit(10);

  if (inbox?.length) {
    const lines = inbox.map(i => {
      const date = new Date(i.created_at as string).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
      const atts = (i.attachments as { name: string; url: string }[] | null) ?? [];
      const attStr = atts.length
        ? ` | Adjuntos: ${atts.map(a => `${a.name} → ${a.url}`).join(', ')}`
        : '';
      return `- [ID:${i.id}] ${date} | ${(i.category as string) || 'general'} | De: ${i.email_from} | ${i.email_subject} | [${i.status}] ${(i.ai_summary as string) || ''}${attStr}`;
    });
    sections.push(`# Bandeja de entrada (últimos 10)\n${lines.join('\n')}\n\nCuando menciones un adjunto, incluye la URL exacta para que el dueño pueda descargarlo.`);
  }

  const { data: meetings } = await supabase
    .from('ops_meetings')
    .select('title, participants, status, scheduled_at, summary, created_at')
    .eq('agent_id', agent.id)
    .order('created_at', { ascending: false })
    .limit(10);

  if (meetings?.length) {
    const lines = meetings.map(m => {
      const dateStr = (m.scheduled_at as string) || (m.created_at as string);
      const date = new Date(dateStr).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
      const parts = Array.isArray(m.participants) ? (m.participants as string[]).join(', ') : '';
      return `- ${date} | ${(m.title as string) || 'Sin título'} | [${m.status}] | ${parts} | ${(m as any).summary || ''}`;
    });
    sections.push(`# Juntas recientes\n${lines.join('\n')}`);
  }

  const { data: contracts } = await supabase
    .from('ops_contracts')
    .select('name, contract_type, counterparty, expiry_date, status, notes')
    .eq('agent_id', agent.id)
    .order('expiry_date', { ascending: true })
    .limit(10);

  if (contracts?.length) {
    const lines = contracts.map(c => {
      const exp = (c.expiry_date as string)
        ? new Date(c.expiry_date as string).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
        : 'Sin vencimiento';
      return `- ${c.name} | ${(c.contract_type as string) || 'contrato'} | ${(c.counterparty as string) || ''} | vence: ${exp} | [${c.status}] | ${(c.notes as string) || ''}`;
    });
    sections.push(`# Contratos\n${lines.join('\n')}`);
  }

  if ((agent.notion_access_token as string | null) && (agent.notion_db_id as string | null)) {
    try {
      const notion = notionClient(agent.notion_access_token as string);
      const { results } = await (notion.databases as any).query({
        database_id: agent.notion_db_id as string,
        page_size:   20,
        sorts:       [{ timestamp: 'last_edited_time', direction: 'descending' }],
      });
      if (results.length) {
        const lines = (results as any[]).map(page => {
          const p       = page.properties;
          const nombre  = p['Nombre']?.title?.[0]?.plain_text  ?? 'Sin nombre';
          const tipo    = p['Tipo']?.select?.name               ?? '';
          const fecha   = p['Fecha']?.date?.start               ?? '';
          const estado  = p['Estado']?.select?.name             ?? '';
          const resumen = p['Resumen']?.rich_text?.[0]?.plain_text ?? '';
          return `- ${fecha} | ${nombre} | ${tipo} | ${estado} | ${resumen}`;
        });
        sections.push(`# CRM Notion\n${lines.join('\n')}`);
      }
    } catch { /* Notion unavailable */ }
  }

  const context = sections.join('\n\n');

  const system = `Eres ${agentName}, el agente IA de ${agent.business_name}${agentRole ? ` con el rol de ${agentRole}` : ''}.

El dueño del negocio te está consultando directamente. Tienes acceso completo a tu operación: base de conocimiento, llamadas recientes, bandeja de entrada, juntas, contratos y CRM.

Responde como un agente inteligente que conoce profundamente el negocio. Usa los datos disponibles para dar respuestas precisas y concretas. Cita fechas y nombres cuando los tengas. Si la información no está en tu contexto, dilo con claridad.

Cuando el dueño te pida generar un contrato para un cliente, usa la herramienta create_contract_draft. Si la llamada o correo mencionan cláusulas específicas que difieren de la plantilla base, ajústalas en clause_overrides.

Responde en español mexicano. Sé directo — 2 a 5 oraciones a menos que se pida más detalle.

## Contexto operativo

${context}`;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const typedMessages = (messages as { role: 'user' | 'assistant'; content: string }[]).slice(-20);

  type AssistantBlock =
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> };

  const readable = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (text: string) =>
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ text })}\n\n`));

      try {
        const stream = client.messages.stream({
          model:      'claude-sonnet-4-6',
          max_tokens: 2048,
          system,
          tools:      [CREATE_CONTRACT_DRAFT_TOOL],
          messages:   typedMessages,
        });

        const assistantBlocks: AssistantBlock[] = [];
        let toolInputBuffer = '';
        let pendingToolId: string | null = null;
        let pendingToolName: string | null = null;

        for await (const chunk of stream) {
          if (chunk.type === 'content_block_start') {
            if (chunk.content_block.type === 'text') {
              assistantBlocks.push({ type: 'text', text: '' });
            } else if (chunk.content_block.type === 'tool_use') {
              pendingToolId   = chunk.content_block.id;
              pendingToolName = chunk.content_block.name;
              toolInputBuffer = '';
              assistantBlocks.push({ type: 'tool_use', id: chunk.content_block.id, name: chunk.content_block.name, input: {} });
            }
          } else if (chunk.type === 'content_block_delta') {
            if (chunk.delta.type === 'text_delta') {
              send(chunk.delta.text);
              const last = assistantBlocks.at(-1);
              if (last?.type === 'text') last.text += chunk.delta.text;
            } else if (chunk.delta.type === 'input_json_delta') {
              toolInputBuffer += chunk.delta.partial_json;
            }
          } else if (chunk.type === 'content_block_stop' && pendingToolId) {
            try {
              const parsed = JSON.parse(toolInputBuffer) as Record<string, unknown>;
              const last = assistantBlocks.at(-1);
              if (last?.type === 'tool_use') last.input = parsed;
            } catch { /* malformed — keep empty input */ }
          } else if (
            chunk.type === 'message_delta' &&
            chunk.delta.stop_reason === 'tool_use' &&
            pendingToolId &&
            pendingToolName === 'create_contract_draft'
          ) {
            // Execute the tool
            const toolInput = (() => {
              try { return JSON.parse(toolInputBuffer) as Record<string, unknown>; }
              catch { return {}; }
            })();
            const last = assistantBlocks.at(-1);
            if (last?.type === 'tool_use') last.input = toolInput;

            // Load template clauses for this agent
            const { data: tpl } = await supabase
              .from('contract_templates').select('clauses').eq('agent_id', agent.id).single();

            const DEFAULT_CLAUSE_IDS = ['partes','objeto','vigencia','contraprestacion','pago','confidencialidad','propiedad','responsabilidad','terminacion','jurisdiccion','aceptacion'];
            type Clause = { id: string; title: string; body: string; required: boolean; enabled: boolean };
            let baseClauses: Clause[] = (tpl?.clauses as Clause[] | null) ?? [];

            // If no custom template, use defaults from contract-template route (inline minimal set)
            if (!baseClauses.length) {
              baseClauses = DEFAULT_CLAUSE_IDS.map(id => ({
                id, title: id.toUpperCase(), body: '', required: ['partes','objeto','vigencia','contraprestacion','jurisdiccion','aceptacion'].includes(id), enabled: true,
              }));
            }

            // Apply clause_overrides
            const overrides = (toolInput.clause_overrides ?? []) as { id: string; enabled?: boolean; body?: string }[];
            const finalClauses = baseClauses.map(c => {
              const ov = overrides.find(o => o.id === c.id);
              if (!ov) return c;
              return {
                ...c,
                ...(ov.enabled !== undefined && !c.required ? { enabled: ov.enabled } : {}),
                ...(ov.body !== undefined ? { body: ov.body } : {}),
              };
            });

            const { data: draft, error: draftError } = await supabase
              .from('contract_drafts')
              .insert({
                agent_id:     agent.id,
                client_name:  (toolInput.client_name  as string | null) ?? null,
                client_email: (toolInput.client_email as string | null) ?? null,
                client_rfc:   (toolInput.client_rfc   as string | null) ?? null,
                client_phone: (toolInput.client_phone as string | null) ?? null,
                clauses:      finalClauses,
                notes:        (toolInput.notes        as string | null) ?? null,
                source_type:  (toolInput.source_type  as string | null) ?? 'llamada',
                source_ref:   (toolInput.source_ref   as string | null) ?? null,
                status:       'borrador',
              })
              .select('id')
              .single();

            const toolResult = draftError
              ? { ok: false, error: draftError.message }
              : { ok: true, draft_id: draft!.id, message: `Borrador creado correctamente con ID ${draft!.id}. El dueño puede verlo en la sección Contratos → Borradores de la Oficina.` };

            // Second streaming call with tool result
            const stream2 = client.messages.stream({
              model:      'claude-sonnet-4-6',
              max_tokens: 1024,
              system,
              messages: [
                ...typedMessages,
                { role: 'assistant' as const, content: assistantBlocks as Anthropic.ContentBlock[] },
                { role: 'user' as const, content: [{ type: 'tool_result' as const, tool_use_id: pendingToolId, content: JSON.stringify(toolResult) }] },
              ],
            });

            for await (const chunk2 of stream2) {
              if (chunk2.type === 'content_block_delta' && chunk2.delta.type === 'text_delta') {
                send(chunk2.delta.text);
              }
            }
          }
        }

        controller.enqueue(enc.encode('data: [DONE]\n\n'));
      } catch {
        controller.enqueue(
          enc.encode(`data: ${JSON.stringify({ error: 'Error generando respuesta' })}\n\n`)
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });
}
