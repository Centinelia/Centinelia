/**
 * Transformers OpenAI ↔ Anthropic para el customLLM endpoint (F1.1).
 *
 * Vapi manda payload en formato OpenAI /v1/chat/completions. Nosotros lo
 * convertimos a Anthropic SDK format, aplicando cache_control ephemeral en
 * el system prompt y en la última tool. Anthropic cachea todo el prefijo
 * (tools + system), y en cada turno subsecuente de la misma llamada
 * hitamos cache — el prompt de voz de 898 líneas paga full-rate una sola
 * vez por sesión en vez de una vez por turno.
 */

import type Anthropic from '@anthropic-ai/sdk';

// ── OpenAI request shape (subset que usa Vapi) ────────────────────────────

export interface OpenAIMessage {
  role:           'system' | 'user' | 'assistant' | 'tool';
  content?:       string | Array<{ type: string; text?: string }> | null;
  tool_calls?:    Array<{
    id:       string;
    type:     'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?:  string;
  name?:          string;
}

export interface OpenAITool {
  type:     'function';
  function: {
    name:        string;
    description: string;
    parameters:  Record<string, unknown>;
  };
}

export interface OpenAIRequest {
  model:        string;
  messages:     OpenAIMessage[];
  temperature?: number;
  max_tokens?:  number;
  tools?:       OpenAITool[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  stream?:      boolean;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function contentToString(content: OpenAIMessage['content']): string {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(c => c.text ?? '').join('');
  return '';
}

// ── Message transform ───────────────────────────────────────────────────────

function transformMessage(m: OpenAIMessage): Anthropic.MessageParam | null {
  if (m.role === 'system') return null;   // handled separately

  if (m.role === 'user') {
    return { role: 'user', content: contentToString(m.content) };
  }

  if (m.role === 'assistant') {
    // Assistant puede tener text + tool_calls simultáneos
    const blocks: Anthropic.ContentBlockParam[] = [];
    const text = contentToString(m.content);
    if (text.trim()) blocks.push({ type: 'text', text });
    for (const tc of m.tool_calls ?? []) {
      let input: unknown = {};
      try { input = JSON.parse(tc.function.arguments || '{}'); } catch { input = {}; }
      blocks.push({
        type: 'tool_use',
        id:   tc.id,
        name: tc.function.name,
        input: input as Record<string, unknown>,
      });
    }
    if (blocks.length === 0) return null;
    return { role: 'assistant', content: blocks };
  }

  if (m.role === 'tool') {
    // OpenAI tool result → Anthropic tool_result (dentro de un user turn)
    return {
      role: 'user',
      content: [{
        type: 'tool_result',
        tool_use_id: m.tool_call_id ?? '',
        content: contentToString(m.content),
      }],
    };
  }

  return null;
}

// ── Full request transform ──────────────────────────────────────────────────

export interface TransformedRequest {
  model:       string;
  max_tokens:  number;
  temperature?: number;
  system?:     Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>;
  messages:    Anthropic.MessageParam[];
  tools?:      Anthropic.Tool[];
  tool_choice?: Anthropic.ToolChoice;
}

export function transformRequest(req: OpenAIRequest): TransformedRequest {
  // 1. Extraer system messages y unir en un solo bloque cacheado.
  const systemTexts = req.messages
    .filter(m => m.role === 'system')
    .map(m => contentToString(m.content))
    .filter(t => t.trim().length > 0);

  const system = systemTexts.length > 0
    ? [{
        type: 'text' as const,
        text: systemTexts.join('\n\n'),
        cache_control: { type: 'ephemeral' as const },
      }]
    : undefined;

  // 2. Transformar messages no-system.
  const messages: Anthropic.MessageParam[] = [];
  for (const m of req.messages) {
    const transformed = transformMessage(m);
    if (transformed) messages.push(transformed);
  }

  // 3. Transformar tools con cache_control en la última.
  //    Anthropic cachea tools + system como prefijo unificado, así que un solo
  //    marcador en la última tool cubre a todas.
  let tools: Anthropic.Tool[] | undefined;
  if (req.tools && req.tools.length > 0) {
    tools = req.tools.map((t, i, arr) => {
      const isLast = i === arr.length - 1;
      const tool: Anthropic.Tool = {
        name:         t.function.name,
        description:  t.function.description,
        input_schema: t.function.parameters as Anthropic.Tool['input_schema'],
        ...(isLast ? { cache_control: { type: 'ephemeral' as const } } : {}),
      };
      return tool;
    });
  }

  // 4. Tool choice.
  let toolChoice: Anthropic.ToolChoice | undefined;
  if (req.tool_choice === 'auto') toolChoice = { type: 'auto' };
  else if (req.tool_choice === 'none') toolChoice = undefined;
  else if (req.tool_choice && typeof req.tool_choice === 'object' && req.tool_choice.type === 'function') {
    toolChoice = { type: 'tool', name: req.tool_choice.function.name };
  }

  return {
    model:       req.model,
    max_tokens:  req.max_tokens ?? 1024,
    temperature: req.temperature,
    system,
    messages,
    tools,
    tool_choice: toolChoice,
  };
}
