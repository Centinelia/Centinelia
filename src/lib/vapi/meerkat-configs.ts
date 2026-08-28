// Model + Prompt Versioning — pilar 1 evolution framework.
//
// REGLAS DURAS:
// 1. NUNCA editar una versión activa. Para cualquier cambio, agrega una nueva versión
//    (ej. NIA_CONFIGS[2] = { ... }). Editar in-place rompe la garantía de rollback.
// 2. NUNCA borrar una versión que exista como active_version en meerkat_active_versions
//    o como pinned_meerkat_version en algún voice_agents.features. El resolver caería
//    al fallback y perderías el rollback.
// 3. Cuando agregues NIA_CONFIGS[N], NO cambies el active_version en DB automáticamente.
//    Deploy primero (v_N disponible pero no activa), luego /admin/versiones para activar.

export interface MeerkatModelConfig {
  provider:              string;
  model:                 string;
  temperature:           number;
  maxTokens:             number;
  speed:                 number;
  minChars:              number;
  voiceModel?:           string;
  sttModel?:             string;
  punctuationBoundaries?: string[];
}

type MeerkatConfigVersions = Record<number, MeerkatModelConfig>;

const NIA_CONFIGS: MeerkatConfigVersions = {
  1: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', temperature: 0.35, maxTokens: 400, speed: 0.91, minChars: 25, voiceModel: 'eleven_turbo_v2_5', sttModel: 'nova-3' },
  // v2: primer battle test del pilar 3. Cambio minimo (temperature 0.35 -> 0.36)
  // para validar el flujo goldens -> flag rollout gradual -> llamada real -> observabilidad.
  2: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', temperature: 0.36, maxTokens: 400, speed: 0.91, minChars: 25, voiceModel: 'eleven_turbo_v2_5', sttModel: 'nova-3' },
};

const NOAH_CONFIGS: MeerkatConfigVersions = {
  // REVERT a Sonnet 4.6 (2026-08-27): Haiku no pudo con el flow de tortillería
  // (buscar_directorio → trigger_outbound_call). Aunque el endpoint devolvía
  // el ejemplo exacto en el error message, Haiku llamó trigger_outbound_call
  // con {} tres veces sin corregir. Prompt-following con args estructurados
  // complejos y tools encadenadas está fuera de su rango.
  //
  // Con Sonnet 4.6 el flow funciona pero el margen es apretado (~$0.24/min
  // LLM sobre precio de venta ~6 MXN/min). Siguiente palanca: activar
  // use_custom_llm en Noah (feature flag) para usar /api/voice/llm con
  // prompt caching Anthropic, baja Sonnet a ~$0.05-0.08/min post-primer
  // turno. Pendiente validar que la ruta llm/chat/completions tenga el
  // cache_control totalmente implementado.
  //
  // punctuationBoundaries sin ',' y minChars 60: chunks cubren cláusulas
  // completas, direcciones no suenan staccato.
  1: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', temperature: 0.60, maxTokens: 150, speed: 1.00, minChars: 60, voiceModel: 'eleven_turbo_v2_5', sttModel: 'nova-3', punctuationBoundaries: ['.', '!', '?'] },
};

const NICO_CONFIGS: MeerkatConfigVersions = {
  1: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', temperature: 0.35, maxTokens: 110, speed: 0.98, minChars: 28, voiceModel: 'eleven_turbo_v2_5', sttModel: 'nova-3' },
};

const NELIA_CONFIGS: MeerkatConfigVersions = {
  1: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', temperature: 0.40, maxTokens: 110, speed: 0.98, minChars: 28, voiceModel: 'eleven_turbo_v2_5', sttModel: 'nova-3' },
  // v2 2026-08-28: upgrade a Sonnet 4.6 por el mismo bug que Noah v1 hit
  // (comment arriba): Haiku 4.5 emite tool calls con arguments={} para
  // registrar_incidencia + ignora el error message del tool response y
  // alucina éxito. Trace confirma en tool_call_log 2026-08-28 18:52-19:00 UTC.
  // maxTokens subido a 200 para Sonnet.
  2: { provider: 'anthropic', model: 'claude-sonnet-4-6',       temperature: 0.40, maxTokens: 200, speed: 0.98, minChars: 28, voiceModel: 'eleven_turbo_v2_5', sttModel: 'nova-3' },
};

const NARA_CONFIGS: MeerkatConfigVersions = {
  1: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', temperature: 0.30, maxTokens: 150, speed: 1.02, minChars: 28, voiceModel: 'eleven_flash_v2_5', sttModel: 'nova-2' },
};

const NAIA_CONFIGS: MeerkatConfigVersions = {
  1: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', temperature: 0.35, maxTokens: 150, speed: 1.02, minChars: 28, voiceModel: 'eleven_flash_v2_5', sttModel: 'nova-2' },
};

const NEO_CONFIGS: MeerkatConfigVersions = {
  1: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', temperature: 0.20, maxTokens: 110, speed: 1.05, minChars: 25, voiceModel: 'eleven_flash_v2_5', sttModel: 'nova-2' },
};

const NOVA_CONFIGS: MeerkatConfigVersions = {
  1: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', temperature: 0.70, maxTokens: 150, speed: 1.05, minChars: 25, voiceModel: 'eleven_flash_v2_5', sttModel: 'nova-2' },
};

const NOX_CONFIGS: MeerkatConfigVersions = {
  1: { provider: 'anthropic', model: 'claude-sonnet-4-6', temperature: 0.15, maxTokens: 80, speed: 1.05, minChars: 25, voiceModel: 'eleven_flash_v2_5', sttModel: 'nova-2' },
};

const NIVA_CONFIGS: MeerkatConfigVersions = {
  1: { provider: 'anthropic', model: 'claude-sonnet-4-6', temperature: 0.25, maxTokens: 150, speed: 1.00, minChars: 28, voiceModel: 'eleven_flash_v2_5', sttModel: 'nova-2' },
};

export const MEERKAT_CONFIGS: Record<string, MeerkatConfigVersions> = {
  nia:   NIA_CONFIGS,
  noah:  NOAH_CONFIGS,
  nico:  NICO_CONFIGS,
  nelia: NELIA_CONFIGS,
  nara:  NARA_CONFIGS,
  naia:  NAIA_CONFIGS,
  neo:   NEO_CONFIGS,
  nova:  NOVA_CONFIGS,
  nox:   NOX_CONFIGS,
  niva:  NIVA_CONFIGS,
};

export const DEFAULT_MODEL_CONFIG: MeerkatModelConfig = {
  provider: 'anthropic', model: 'claude-haiku-4-5-20251001', temperature: 0.40, maxTokens: 150,
  speed: 0.98, minChars: 28, voiceModel: 'eleven_turbo_v2_5', sttModel: 'nova-3',
};
