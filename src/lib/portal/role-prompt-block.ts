import { MEERKAT_MAP, type MeerkatRoleId, type MeerkatRole } from '@/lib/portal/meerkat-roles';

/**
 * Helper centralizado para inyectar el prompt del rol (promptPersonalidad)
 * en el system prompt de un meerkat, independientemente del canal.
 *
 * ROOT CAUSE de bugs recurrentes previos: cada canal (agent-chat, voice-llm,
 * teams-webhook, portal/chat, demo/*) construía su propio system prompt sin
 * inyectar el role prompt del meerkat. Los refuerzos escritos en
 * meerkat-roles.ts promptPersonalidad solo tenían efecto en los canales que
 * casualmente leían ese campo (inbox-processor, nash-runner, neka). Resultado:
 * Nami (y cualquier otro meerkat) respondía con prompt genérico en chat,
 * hallucinando cosas prohibidas por su rol (ej. mencionar Google Sheets
 * cuando usa Excel). Caso real: AC Camila 2026-10-07.
 *
 * Fix PARA SIEMPRE: todos los canales que inicien una conversación con un
 * meerkat deben componer el system prompt con `buildRolePromptBlock()`.
 * Un test en src/lib/portal/__tests__/role-prompt-block.test.ts valida que
 * los canales conocidos invoquen esta función.
 */

export interface RolePromptBlockInput {
  meerkatRoleId: string | null | undefined;  // de voice_agents.features.meerkat_role_id
}

/**
 * Construye el bloque de prompt role-specific para inyectar en un system
 * prompt. Si no hay roleId válido o el rol no tiene promptPersonalidad,
 * devuelve string vacío (safe to concat).
 *
 * Formato: `## REGLAS Y PROCESO DE TU ROL (<Nombre> - <Rol>)\n\n<prompt>\n`
 *
 * Variant 'chat': extrae solo las secciones críticas (anti-hallucination,
 * proceso corto) del promptPersonalidad. El prompt completo pesado rompió
 * el chat con Camila 2026-10-07 (respuesta basura "1 6203"). Para chat
 * necesitamos reglas duras cortas, no el runbook operativo completo que
 * sirve a inbox-processor o voice.
 */
export function buildRolePromptBlock({ meerkatRoleId, variant = 'full' }: RolePromptBlockInput & { variant?: 'full' | 'chat' } = { meerkatRoleId: null }): string {
  if (!meerkatRoleId) return '';
  const role = MEERKAT_MAP[meerkatRoleId as MeerkatRoleId] as MeerkatRole | undefined;
  if (!role?.promptPersonalidad) return '';
  if (variant === 'chat') {
    return buildChatVariant(role);
  }
  return `\n## REGLAS Y PROCESO DE TU ROL (${role.nombre} - ${role.rol})\n\n${role.promptPersonalidad}\n`;
}

/**
 * Variant corta para el chat conversacional: extrae SOLO reglas anti-
 * hallucination (frases prohibidas, afirmaciones falsas a evitar) del
 * promptPersonalidad. NO incluye procesos paso-a-paso ("Paso 1: ejecuta X,
 * Paso 2: ejecuta Y") porque confunden al modelo entre "invocar tool"
 * vs. "narrar tool call como texto". Caso real demo AC 2026-10-07:
 * variant con proceso hizo que Nami imprimiera tool calls JSON como texto
 * (fake "revisar_mi_inbox_ahora {ok:true...}", fake IDs "a91f", etc.).
 *
 * Modelo decide cuándo invocar tools basado en el prompt genérico del chat
 * (que ya tiene "REGLA CRÍTICA: Ejecutar tools, no narrarlos"). El rol
 * solo contribuye las reglas duras: QUÉ NO decir, no QUÉ hacer paso-a-paso.
 */
function buildChatVariant(role: MeerkatRole): string {
  const full = role.promptPersonalidad;
  // Extrae solo secciones con PROHIBIDO/BANEAD/NUNCA, SIN secciones de
  // "proceso paso 1/paso 2/ejecuta tal tool" que inducen narración.
  const antiHallucinationSections: string[] = [];
  const sectionRx = /(====[^=]+====\s[\s\S]*?)(?===== |\n[A-Z]{3,}[^a-z]{0,80}:|\n\n[A-Z]{3,}|$)/g;
  let m: RegExpExecArray | null;
  while ((m = sectionRx.exec(full)) !== null) {
    const section = m[1];
    // Solo incluir si menciona PROHIBIDO/BANEAD/NUNCA DIGAS Y no es un
    // runbook de pasos (que contendría "Paso 1" o "Paso 2").
    const isAntiHallucination = /PROHIBIDO|BANEAD|NUNCA DIGAS|NUNCA MENCIONES|NUNCA HABLES/i.test(section);
    const isProceduralRunbook = /\bPaso\s+\d+\b/i.test(section) || /\bPASO\s+\d+\b/.test(section);
    if (isAntiHallucination && !isProceduralRunbook) {
      antiHallucinationSections.push(section.trim());
    }
  }
  if (antiHallucinationSections.length === 0) return '';
  return `\n## REGLAS DURAS DE TU ROL (${role.nombre} - ${role.rol})\n\nEstas son restricciones que SIEMPRE aplican, sin importar lo que el dueño te pida. Para saber cómo ejecutar algo (qué tool usar, cómo procesar), rige el prompt general del chat y las descripciones de tus tools — no describas en texto lo que vas a hacer, invoca las tools directamente.\n\n${antiHallucinationSections.join('\n\n')}\n`;
}

/**
 * Lista de canales que DEBEN usar buildRolePromptBlock. El test de
 * __tests__/role-prompt-block.test.ts verifica que cada archivo listado
 * aquí importe o referencie buildRolePromptBlock (o directamente
 * promptPersonalidad / MEERKAT_MAP para casos legacy).
 *
 * Si agregas un nuevo canal que inicia conversación con un meerkat,
 * agrégalo aquí para que el linter de regresión lo cubra.
 */
export const CHANNELS_REQUIRING_ROLE_PROMPT = [
  // Canales que construyen directamente el system prompt y DEBEN inyectar
  // el role prompt via buildRolePromptBlock().
  'src/app/api/portal/[token]/agent-chat/route.ts',       // chat del portal
  'src/app/api/teams/webhook/[token]/route.ts',           // Microsoft Teams
  // Canales con promptPersonalidad hardcoded o leído del MEERKAT_MAP (OK, patrón legacy válido):
  'src/lib/voice/prompt-builder.ts',                       // llamadas (vía MEERKAT_MAP[roleId].promptPersonalidad)
  'src/lib/ops/nash-runner.ts',                            // Nash (vía meerkat?.promptPersonalidad)
  'src/lib/ops/neka-email-runner.ts',                      // Neka email (hardcoded NEKA.promptPersonalidad)
  'src/app/api/admin/staff/neka/chat/route.ts',            // Neka chat admin (hardcoded)
  // Canales que NO necesitan role prompt (no inician convo meerkat-vs-dueño):
  //   src/app/api/voice/llm/chat/completions/route.ts (pass-through, prompt viene de voice/prompt-builder.ts)
  //   src/app/api/portal/chat/route.ts                (chat de soporte Centinelia, no meerkat)
  //   src/app/api/chat/sales/route.ts                 (chat de ventas, no meerkat)
  //   src/app/api/demo/meefi/chat/route.ts            (demo scripted sin agent_id)
  //   src/app/api/cron/learn/route.ts                 (background job)
  //   src/app/api/portal/[token]/generate-kb*         (one-shot generation)
  //   src/lib/ops/inbox-processor.ts                  (correo entrante, usa roleKB/agentRole del agent row)
] as const;
