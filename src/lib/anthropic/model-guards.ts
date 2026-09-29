/**
 * Guards para modelos Anthropic "post-temperature" (Sonnet/Opus/Fable/Mythos 5.x+, Haiku 5.x+).
 *
 * Estos modelos deprecaron `temperature` en favor de adaptive thinking (`effort`).
 * Pasarles `temperature` devuelve 400 "temperature is deprecated for this model".
 *
 * Además, adaptive thinking consume `max_tokens` aunque no se emita al cliente,
 * así que necesitan piso generoso (2000) para que la respuesta quepa.
 *
 * Aprendido en:
 *   - Nia Santiago 2026-09-28 (fix inicial en /api/voice/llm/chat/completions)
 *   - Bug golden_test 2026-09-29 (issues #73, #75) — este helper unifica el patrón
 */

export function isPostTempModel(modelId: string | null | undefined): boolean {
  if (!modelId) return false;
  return (
    /^claude-(sonnet|opus|fable|mythos)-[5-9]/.test(modelId) ||
    /^claude-haiku-[5-9]/.test(modelId)
  );
}

export interface Sonnet55VoiceExtras {
  output_config?: { effort: 'low' };
  thinking?:      { type: 'between_tools' };
}

/**
 * Extras recomendados por Anthropic para voz/chat latency-sensitive con modelos 5.x+.
 * Vacío para modelos previos.
 */
export function sonnet55VoiceExtras(modelId: string | null | undefined): Sonnet55VoiceExtras {
  if (!isPostTempModel(modelId)) return {};
  return {
    output_config: { effort: 'low' as const },
    thinking:      { type: 'between_tools' as const },
  };
}

/**
 * max_tokens efectivo. Sonnet 5.5+ necesita piso porque adaptive thinking
 * consume budget. `floor` default 2000 cubre voz típica; para golden_test con
 * respuestas más largas conviene subirlo explícitamente.
 */
export function effectiveMaxTokens(
  modelId: string | null | undefined,
  requested: number | undefined,
  floor = 2000,
): number | undefined {
  if (!isPostTempModel(modelId)) return requested;
  return Math.max(requested ?? floor, floor);
}
