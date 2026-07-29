/**
 * Streaming translator Anthropic → OpenAI SSE (F1.1).
 *
 * Vapi espera eventos SSE en formato OpenAI /v1/chat/completions:
 *
 *   data: {"choices":[{"delta":{"content":"..."},"index":0}]}
 *   data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"...","function":{"name":"...","arguments":"..."}}]},"index":0}]}
 *   data: {"choices":[{"delta":{},"index":0,"finish_reason":"stop"}]}
 *   data: [DONE]
 *
 * Anthropic SDK devuelve stream de eventos tipados (message_start,
 * content_block_start, content_block_delta, content_block_stop,
 * message_delta, message_stop). Los mapeamos on-the-fly.
 */

import type Anthropic from '@anthropic-ai/sdk';

type FinishReason = 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;

function sseEvent(payload: object): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function mapStopReason(reason: string | null | undefined): FinishReason {
  if (reason === 'end_turn')   return 'stop';
  if (reason === 'stop_sequence') return 'stop';
  if (reason === 'max_tokens') return 'length';
  if (reason === 'tool_use')   return 'tool_calls';
  return 'stop';
}

/**
 * Consume el stream de Anthropic y emite chunks SSE OpenAI-compat.
 * Maneja text_delta y input_json_delta (tool_use argumentos) por separado.
 */
export async function* anthropicToOpenAISse(
  stream: AsyncIterable<Anthropic.MessageStreamEvent>,
  model: string,
): AsyncIterable<string> {
  const id = `chatcmpl-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const created = Math.floor(Date.now() / 1000);
  const base = { id, object: 'chat.completion.chunk', created, model };

  // Estado por content_block index → sabemos qué tipo es y su tool_call index si aplica
  interface BlockState {
    kind:      'text' | 'tool_use';
    toolIndex?: number;
    toolId?:   string;
    toolName?: string;
  }
  const blocks: Record<number, BlockState> = {};
  let toolCallCounter = 0;
  let sentRolePreamble = false;

  for await (const event of stream) {
    switch (event.type) {
      case 'message_start': {
        // Preamble con role assistant — algunos clientes lo esperan.
        yield sseEvent({ ...base, choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }] });
        sentRolePreamble = true;
        break;
      }

      case 'content_block_start': {
        const idx = event.index;
        const block = event.content_block;
        if (block.type === 'text') {
          blocks[idx] = { kind: 'text' };
        } else if (block.type === 'tool_use') {
          const toolIndex = toolCallCounter++;
          blocks[idx] = { kind: 'tool_use', toolIndex, toolId: block.id, toolName: block.name };
          // Vapi (OpenAI-compat) espera anunciar el tool_call al abrir el bloque
          yield sseEvent({
            ...base,
            choices: [{
              index: 0,
              delta: {
                tool_calls: [{
                  index:    toolIndex,
                  id:       block.id,
                  type:     'function',
                  function: { name: block.name, arguments: '' },
                }],
              },
              finish_reason: null,
            }],
          });
        }
        break;
      }

      case 'content_block_delta': {
        const idx = event.index;
        const st  = blocks[idx];
        if (!st) break;

        if (event.delta.type === 'text_delta' && st.kind === 'text') {
          if (!sentRolePreamble) {
            yield sseEvent({ ...base, choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] });
            sentRolePreamble = true;
          }
          yield sseEvent({
            ...base,
            choices: [{ index: 0, delta: { content: event.delta.text }, finish_reason: null }],
          });
        } else if (event.delta.type === 'input_json_delta' && st.kind === 'tool_use') {
          yield sseEvent({
            ...base,
            choices: [{
              index: 0,
              delta: {
                tool_calls: [{
                  index:    st.toolIndex!,
                  function: { arguments: event.delta.partial_json },
                }],
              },
              finish_reason: null,
            }],
          });
        }
        break;
      }

      case 'content_block_stop': {
        // Nada que emitir per se; el finish_reason viene en message_delta.
        break;
      }

      case 'message_delta': {
        const finishReason = mapStopReason(event.delta.stop_reason);
        yield sseEvent({
          ...base,
          choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
        });
        break;
      }

      case 'message_stop': {
        // Marcador final; no emitimos nada aquí — el finish_reason ya se envió.
        break;
      }
    }
  }

  yield 'data: [DONE]\n\n';
}
