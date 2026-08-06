// src/lib/nox/brief-renderer.ts
import Anthropic from '@anthropic-ai/sdk';
import type { BriefData } from './brief-collector';
import { logLlmCall } from '@/lib/observability/llm-log';

const MODEL = 'claude-sonnet-4-6' as const;

export interface BriefBuckets {
  accion: string[];
  prep:   string[];
  fyi:    string[];
}

export interface RenderedBrief {
  markdown: string;
  buckets:  BriefBuckets;
}

interface RenderCtx {
  agentName:    string;
  businessName: string;
  tz:           string;
  ownerName:    string | null;
  kbSnippet:    string | null;
}

function serializeData(data: BriefData): string {
  const parts: string[] = [];

  if (data.urgentEmails.items.length) {
    parts.push('CORREOS URGENTES/IMPORTANTES SIN RESPONDER (últimas 24h):\n' + data.urgentEmails.items.map(e => `- [${e.received_at}] ${e.from}: "${e.subject}" (categoría ${e.category})`).join('\n'));
  }
  if (data.upcomingEvents.items.length) {
    parts.push('AGENDA (hoy y mañana):\n' + data.upcomingEvents.items.map(e => `- ${e.start} → ${e.end}: ${e.title}`).join('\n'));
  }
  if (data.pendingTasks.items.length) {
    parts.push('TAREAS PENDIENTES DEL EQUIPO:\n' + data.pendingTasks.items.map(t => `- [${t.created_at}] ${t.title} (asignada a ${t.assigned_to}, estado ${t.status})`).join('\n'));
  }
  if (data.unresolvedEscalations.items.length) {
    parts.push('ESCALACIONES SIN RESOLVER (empleados pidieron ayuda al dueño):\n' + data.unresolvedEscalations.items.map(h => `- [${h.created_at}] ${h.title} (urgencia ${h.urgency})`).join('\n'));
  }
  if (data.pendingContractDrafts.items.length) {
    parts.push('BORRADORES DE CONTRATO SIN FIRMAR:\n' + data.pendingContractDrafts.items.map(c => `- [${c.created_at}] ${c.client_name ?? 'Sin nombre'}`).join('\n'));
  }

  return parts.length ? parts.join('\n\n') : 'No hay datos en las últimas 24 horas.';
}

const SYSTEM_PROMPT = `Eres Nox, el coordinador digital del dueño de un negocio. Tu trabajo es preparar el "brief del día" clasificando cada dato en 3 buckets:

- accion: cosas que el dueño DEBE hacer HOY (responder correo urgente, resolver escalación de un empleado, decidir sobre contrato listo)
- prep: cosas que necesitan PREPARACIÓN antes de una reunión o evento (llevar cotización, revisar propuesta, contexto de un cliente que llega)
- fyi: cosas informativas para que el dueño esté al tanto (correos ya cerrados por otros empleados, tareas completadas, eventos rutinarios)

Reglas duras:
- Cada bucket es un array de strings. Cada string es un bullet corto (máx 20 palabras) escrito para el dueño en tono directo.
- Sin em-dashes, sin emojis. Usa comas o dos puntos.
- Si no hay nada relevante en un bucket, devuelve array vacío.
- Prioriza señales de acción sobre volumen. Si hay 10 correos FYI, resume "10 correos informativos procesados" en un solo bullet.
- Devuelve SOLO JSON válido con esta forma exacta: {"accion": [...], "prep": [...], "fyi": [...]}. No expliques, no incluyas texto fuera del JSON.`;

function bucketsToMarkdown(buckets: BriefBuckets): string {
  const sections: string[] = [];
  const anyItems = buckets.accion.length + buckets.prep.length + buckets.fyi.length;
  if (anyItems === 0) return 'Sin novedades hoy. Todo bajo control.';

  sections.push('## Requiere acción');
  sections.push(buckets.accion.length ? buckets.accion.map(x => `- ${x}`).join('\n') : '_Nada urgente._');

  sections.push('\n## Necesita preparación');
  sections.push(buckets.prep.length ? buckets.prep.map(x => `- ${x}`).join('\n') : '_Sin preparativos pendientes._');

  sections.push('\n## Al tanto');
  sections.push(buckets.fyi.length ? buckets.fyi.map(x => `- ${x}`).join('\n') : '_Sin novedades informativas._');

  return sections.join('\n');
}

export async function renderBrief(data: BriefData, ctx: RenderCtx): Promise<RenderedBrief> {
  const anthropic = new Anthropic();
  const userPrompt = `NEGOCIO: ${ctx.businessName}
DUEÑO: ${ctx.ownerName ?? 'sin nombre registrado'}
ZONA HORARIA: ${ctx.tz}
${ctx.kbSnippet ? `\nCONTEXTO DEL NEGOCIO:\n${ctx.kbSnippet}\n` : ''}
DATOS DE LAS ÚLTIMAS 24 HORAS + AGENDA HOY/MAÑANA:

${serializeData(data)}

Clasifica cada dato en accion / prep / fyi y devuelve el JSON.`;

  const __t = Date.now();
  let response;
  try {
    response = await anthropic.messages.create({
      model:      MODEL,
      max_tokens: 1200,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: userPrompt }],
    });
    void logLlmCall({ source: 'brief_renderer', model: MODEL, usage: response.usage, latencyMs: Date.now() - __t, meta: { agentName: ctx.agentName } });
  } catch (err) {
    void logLlmCall({ source: 'brief_renderer', model: MODEL, usage: { input_tokens: 0, output_tokens: 0 }, latencyMs: Date.now() - __t, error: err instanceof Error ? err.message : String(err), meta: { agentName: ctx.agentName } });
    throw err;
  }

  const raw = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';

  let parsed: BriefBuckets;
  try {
    // Robust JSON extraction: model may wrap in code fences
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
  } catch {
    parsed = { accion: [], prep: [], fyi: [] };
  }

  const buckets: BriefBuckets = {
    accion: Array.isArray(parsed.accion) ? parsed.accion.filter(x => typeof x === 'string') : [],
    prep:   Array.isArray(parsed.prep)   ? parsed.prep.filter(x => typeof x === 'string')   : [],
    fyi:    Array.isArray(parsed.fyi)    ? parsed.fyi.filter(x => typeof x === 'string')    : [],
  };

  return { markdown: bucketsToMarkdown(buckets), buckets };
}
