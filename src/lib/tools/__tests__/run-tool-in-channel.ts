/**
 * runToolInChannel — harness para verificar que una tool produce el MISMO
 * resultado desde cualquiera de los 3 canales (voice, chat, email).
 *
 * Motivo: el bug #1 recurrente de Centinelia es que una tool funciona en un
 * canal pero silenciosamente falla en otro. `tool-completeness.test.ts` cubre
 * la parte estática (schemas registrados). Este harness cubre la parte
 * dinámica (mismo executor devuelve mismo resultado).
 *
 * Uso típico:
 *
 *   describe('buscar_cliente en los 3 canales', () => {
 *     it.each(['voice', 'chat', 'email'] as const)(
 *       '%s: match exacto por RFC',
 *       async (channel) => {
 *         const result = await runToolInChannel(channel, 'buscar_cliente', {
 *           rfc: 'XAXX010101000',
 *         }, fixtureAgentCtx());
 *         expect(result.ok).toBe(true);
 *         expect(result.data.rfc).toBe('XAXX010101000');
 *       },
 *     );
 *   });
 *
 * El harness NO ejecuta el LLM. Ejecuta el executor.ts directamente, que es
 * la única fuente compartida entre los 3 canales (voice, chat y email lo
 * llaman todos).
 */

import type { Channel } from '../registry';

export interface ToolInvocationContext {
  agentId:      string;
  portalEmail:  string;
  meerkatId:    string | null;
  channel:      Channel;
  /** Overrides para testing sin tocar la base de datos. */
  overrides?: {
    voice_agents?: Record<string, unknown>;
    features?:     Record<string, unknown>;
  };
}

export interface ToolInvocationResult {
  ok:    boolean;
  data?: unknown;
  error?: string;
}

/**
 * Ejecuta una tool a través del executor compartido. Retorna el resultado
 * homologado — el shape es el mismo sin importar el canal, porque los 3
 * canales pasan por `executeToolCall()` en `src/lib/tools/executor.ts`.
 *
 * NOTA: Este helper es un THIN WRAPPER hoy. La implementación real conecta
 * con `executeToolCall(name, args, ctx)`. En vitest, los tests que usan
 * este harness deben mockear las dependencias externas del executor
 * (Supabase, Anthropic, Vapi) con `vi.mock`.
 *
 * El harness se mantiene mínimo a propósito: si en el futuro los 3 canales
 * divergen (ej: chat agrega retry, voice tiene timeout diferente), aquí
 * aparece la parametrización por canal. Hoy son idénticos.
 */
export async function runToolInChannel(
  channel: Channel,
  name:    string,
  args:    Record<string, unknown>,
  ctx:     ToolInvocationContext,
): Promise<ToolInvocationResult> {
  // Import dinámico para evitar cargar el executor entero cuando el test no
  // lo necesita (algunos tests solo verifican schemas via completeness).
  const executorModule = await import('@/lib/tools/executor') as {
    executeAgentTool: (
      name: string,
      args: Record<string, unknown>,
      ctx:  unknown,
    ) => Promise<unknown>;
  };

  try {
    const result = await executorModule.executeAgentTool(name, args, {
      ...ctx,
      channel, // ctx.channel se sobrescribe con el que pide el test
    });
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Verifica en un solo test que los 3 canales retornan resultados EQUIVALENTES
 * para los mismos inputs. Útil como smoke test rápido de que una tool está
 * verdaderamente wireada en los 3 canales.
 *
 * Ejemplo:
 *
 *   it('read_url funciona igual en los 3 canales', async () => {
 *     await expectSameAcrossChannels('read_url', { url: 'https://example.com' }, ctx);
 *   });
 */
export async function expectSameAcrossChannels(
  name:  string,
  args:  Record<string, unknown>,
  ctx:   Omit<ToolInvocationContext, 'channel'>,
): Promise<void> {
  const channels: Channel[] = ['voice', 'chat', 'email'];
  const results = await Promise.all(
    channels.map(c => runToolInChannel(c, name, args, { ...ctx, channel: c })),
  );

  const [voice, chat, email] = results;

  if (voice.ok !== chat.ok || chat.ok !== email.ok) {
    throw new Error(
      `Tool ${name} divergió entre canales:\n` +
      `  voice: ${voice.ok ? 'ok' : voice.error}\n` +
      `  chat:  ${chat.ok  ? 'ok' : chat.error}\n` +
      `  email: ${email.ok ? 'ok' : email.error}`,
    );
  }

  // Comparación estructural profunda: si los 3 son ok, los payloads deben
  // ser iguales (asumiendo executor idempotente sin side effects entre calls).
  if (JSON.stringify(voice.data) !== JSON.stringify(chat.data) ||
      JSON.stringify(chat.data)  !== JSON.stringify(email.data)) {
    throw new Error(`Tool ${name} produjo payloads distintos por canal`);
  }
}
