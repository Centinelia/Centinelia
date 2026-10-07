/**
 * Safety net post-LLM: valida que el `ai_summary` + `ai_draft` producidos
 * por el inbox-processor NO contengan hallucinations observadas en
 * producción. Si violan, retorna violations específicas para que el
 * caller re-prompt con feedback.
 *
 * Historia:
 *   2026-10-07 (demo AC Camila) — Nami en producción respondió con
 *   múltiples hallucinations consistentes a pesar de reglas en el prompt:
 *   - "El Google Sheet de OC no está configurado" (inventa integración inexistente)
 *   - "Intenté avisar a un humano con pedir_a_humano y las tres solicitudes
 *     fallaron" (inventa tool invocation que nunca ocurrió)
 *   - "No tengo conectado el archivo" (niega que inventory_excel_config exista)
 *   - Firma "Camila Rodarte, Coordinadora de Almacén" (suplanta identidad)
 *   El prompt tiene estas prohibiciones explícitas pero Sonnet 5.5 las ignora.
 *
 * Design:
 *   - Lista de regex de frases BANEADAS → direct block
 *   - Hallucination patterns: "intenté/ejecuté/invoqué/usé {TOOL_NAME}"
 *     SIN que esa tool aparezca en `toolsActuallyInvoked` → block
 *   - Firma como humano del team roster → block
 *   - Returns ok|false con `violations` (lista de problemas específicos)
 *     y `retryPrompt` listo para re-feed al LLM
 */

export interface DraftValidationInput {
  summary:              string | null;
  draft:                string | null;
  agentName:            string;                     // ej. "Nami"
  teamHumanNames:       string[];                   // ej. ["Camila Rodarte", "Victoria Acosta"]
  toolsActuallyInvoked: string[];                   // ej. ["buscar_correo_enviado"]
}

export interface DraftValidationResult {
  ok:          boolean;
  violations:  DraftViolation[];
  retryPrompt: string | null;
}

export type DraftViolationKind =
  | 'banned_phrase'
  | 'tool_claim_without_invocation'
  | 'impersonation'
  | 'nonexistent_integration';

export interface DraftViolation {
  kind:     DraftViolationKind;
  excerpt:  string;
  reason:   string;
  fix:      string;
}

// ── Frases BANEADAS (observadas en producción) ──────────────────────────────
// Si cualquiera de estos regex matchea en summary o draft, el draft se rechaza.

const BANNED_PHRASES: Array<{ rx: RegExp; reason: string; fix: string; kind: DraftViolationKind }> = [
  {
    rx: /\bGoogle\s*Sheet(s?|\s|$)/i,
    reason: 'Nami NO usa Google Sheets. Su inventario vive en Excel OneDrive/SharePoint.',
    fix: 'Elimina toda mención a Google Sheets. Si querías registrar, usa inv_procesar_oc_qb o inv_agregar_equipo. Si no puedes identificar la tool correcta, deja el draft en null (en lugar de inventar una integración que no existe).',
    kind: 'nonexistent_integration',
  },
  {
    // 2026-10-07 patrones nuevos: el modelo adaptó Google Sheet → "hoja de OC",
    // "hoja de inventario", "sheet_no_configurado" (en snake_case como error),
    // o "sheetnoconfigurado" (sin underscores). Todos son el mismo hallucination.
    rx: /\b(hoja|sheet|plantilla)\s*(de\s+)?(oc|inventario|salida|facturas?|backlog|ventas?|compras?)\b/i,
    reason: 'No existe "la hoja de X" como integración separada. El Excel completo YA está vinculado y las tools inv_* abren todas sus hojas (sheets) por nombre interno (STOCK, BACKLOG, INVENTARIO, etc.).',
    fix: 'No menciones "la hoja de OC/inventario/salida" como si fuera algo que necesita configurar. Si querías escribir en la hoja STOCK o similar, invoca la tool inv_* correspondiente. El sistema sabe en qué hoja escribir.',
    kind: 'nonexistent_integration',
  },
  {
    // "sheet_no_configurado" / "sheetnoconfigurado" como pseudo-error-code inventado
    rx: /\bsheet[_\s]*no[_\s]*(configurad[oa]|mapead[oa]|conectad[oa])/i,
    reason: 'Ese error_code "sheet_no_configurado" NO existe. Las tools inv_* no devuelven ese error. Si una tool falló, cita el error_code REAL que devolvió, no inventes.',
    fix: 'Elimina esa pseudo-referencia a error_code. Si invocaste una tool y falló, menciona el error que REALMENTE devolvió. Si no invocaste la tool, no inventes errores que nunca ocurrieron.',
    kind: 'tool_claim_without_invocation',
  },
  {
    // Match ambos ordenes: "no está configurado el excel" / "el excel no está configurado"
    rx: /\b(excel|sheet|hoja|archivo|inventario|integraci[oó]n)\b[\s\S]{0,80}\bno\s+(est[áa]|he\s+sido|ha\s+sido)\s+(configurad[oa]|conectad[oa]|vinculad[oa]|mapead[oa])\b|\bno\s+(est[áa]|he\s+sido|ha\s+sido)\s+(configurad[oa]|conectad[oa]|vinculad[oa]|mapead[oa])\b[\s\S]{0,80}\b(excel|sheet|hoja|archivo|inventario|integraci[oó]n)\b/i,
    reason: 'inventory_excel_config SÍ existe para esta org — verifica antes de afirmar que falta.',
    fix: 'Las tools inv_* abren el Excel solas. Si una tool falla técnicamente, invócala y reporta el error exacto que devolvió, no digas "no está configurado".',
    kind: 'nonexistent_integration',
  },
  {
    rx: /\bno\s+tengo\s+(conectad[oa]|acceso\s+a)\s+(el\s+(archivo|excel|sheet|hoja|inventario)|al\s+(archivo|excel|sheet|hoja|inventario))/i,
    reason: 'Nami SÍ tiene acceso al Excel vía las tools inv_*.',
    fix: 'Elimina esa frase. Invoca la tool inv_* que corresponda al tipo de documento recibido.',
    kind: 'nonexistent_integration',
  },
  {
    rx: /\b(conecta(r)?|configur(a|ar|e|es)|vincula(r)?|enlaza(r)?|habilitar?)\s+(el\s+|la\s+|que\s+se\s+)?(archivo|excel|sheet|hoja|inventario|integraci[oó]n)/i,
    reason: 'Nunca pidas al cliente que conecte/configure algo — el inventario YA está conectado.',
    fix: 'Elimina la petición de conectar algo. Si realmente no puedes avanzar sin algo del cliente, pide un dato concreto (ej. "¿cuál es la serie del equipo?") no una re-configuración.',
    kind: 'banned_phrase',
  },
  {
    // "que se configure la hoja", "que configures el sheet", "necesito que se habilite"
    rx: /\bnecesito\s+que\s+(se\s+configur[ea]|configures?|habilites?|se\s+habilite|se\s+conecte|conectes?|vincules?)/i,
    reason: 'Nami nunca necesita que el cliente configure/habilite nada — todo está configurado al activar su rol.',
    fix: 'Elimina esa petición. Si una tool falló, menciona el error real. Si falta un dato del documento (serie, modelo), pide ESE dato específico.',
    kind: 'banned_phrase',
  },
  {
    rx: /\ben\s+Integraciones\s+del\s+portal\b/i,
    reason: 'No pidas al cliente que vaya a Integraciones. El Excel YA está vinculado.',
    fix: 'Elimina esa referencia.',
    kind: 'banned_phrase',
  },
  {
    // "indique en qué otro lugar registrarla" — asume que la ubicación es dudosa
    rx: /\b(indique[sm]?|dime|ind[ií]came)\s+(en\s+qu[eé]|cu[áa]l)\s+(otro\s+)?(lugar|sheet|hoja|excel|archivo|sistema)\s+(la\s+)?(registr|guard|anot|capturar?)/i,
    reason: 'El lugar donde registrar OC/factura/salida ya está decidido por tus tools inv_*. No preguntes al cliente dónde registrar.',
    fix: 'Elimina esa pregunta. Invoca la tool inv_* correspondiente al tipo de documento.',
    kind: 'banned_phrase',
  },
];

// ── Hallucination sobre tool invocations ─────────────────────────────────────
// 2 pasadas:
//  (1) Encuentra todos los nombres snake_case tool-like en el texto
//  (2) Para cada uno NO invocado, verifica si hay un verbo de past-claim
//      en los ~120 chars anteriores ("intenté", "ejecuté", "invoqué", "falló",
//      "no funcionó", etc.) — si sí, es una claim; si no, es mención neutra.
const SNAKE_CASE_TOOL_RX = /\b([a-z]+_[a-z_0-9]+)\b/g;
const PAST_CLAIM_VERBS_RX = /\b(intent[eé]|ejecut[eé]|invoqu[eé]|us[eé](?!r)|llam[eé](?!r)|prob[eé](?!r)|falló|falla(ron|ban)?|no\s+funcion[oó]|no\s+respond[ií]o|devolvi[oó]\s+error|solicitudes\s+fallaron)\b/i;

function findToolClaimHallucinations(text: string, actuallyInvoked: Set<string>): Array<{ claimed: string; excerpt: string }> {
  const hits: Array<{ claimed: string; excerpt: string }> = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = SNAKE_CASE_TOOL_RX.exec(text)) !== null) {
    const toolName = m[1].toLowerCase();
    // Filter: must look like tool (at least verb_noun, length ≥ 6 total)
    if (toolName.length < 6) continue;
    if (!/^[a-z]+_[a-z_0-9]{3,}$/.test(toolName)) continue;
    if (seen.has(toolName)) continue;
    if (actuallyInvoked.has(toolName)) continue;
    // Ventana de contexto: 120 chars antes + 80 chars después
    const ctxStart = Math.max(0, m.index - 120);
    const ctxEnd   = Math.min(text.length, m.index + toolName.length + 80);
    const context  = text.slice(ctxStart, ctxEnd);
    // Debe haber un past-claim verb en la ventana
    if (!PAST_CLAIM_VERBS_RX.test(context)) continue;
    seen.add(toolName);
    hits.push({ claimed: toolName, excerpt: context.trim() });
  }
  return hits;
}

// ── Firma suplantando humano ─────────────────────────────────────────────────
// Busca al final del draft (últimas 400 chars) menciones a nombres del
// team roster. Si Nami firma "Camila Rodarte" es suplantación.
//
// 2026-10-07: pass si el nombre del agente aparece ANTES del nombre humano en
// la zona de firma. Patrón esperado del template corporate:
//   "Saludos,\n\nNami\nAsistente de Inventarios\nAC Proyectos\n..."
// Si el nombre del agente está correctamente al inicio del bloque Y después
// aparece un nombre humano (ej. en el bloque de empresa que menciona razón
// social o un contacto adicional), NO es impersonation.
function findImpersonation(draft: string, teamHumans: string[], agentName: string): string | null {
  if (!draft) return null;
  const tail = draft.slice(-400);  // zona de firma
  const normalizedAgent = agentName.toLowerCase().trim();
  const tailLow = tail.toLowerCase();
  for (const human of teamHumans) {
    if (!human || human.trim().length < 3) continue;
    const h = human.trim();
    const parts = h.split(/\s+/).filter(p => p.length >= 3);
    if (parts.length < 2) continue;  // single names muy frecuentes, saltar
    const nameRx = new RegExp(`\\b${parts.map(escapeRx).join('\\s+')}\\b`, 'i');
    const humanMatch = tail.match(nameRx);
    if (!humanMatch) continue;

    // Si el nombre del agente aparece ANTES del humano en el tail, es firma
    // válida (el agente firma primero, el humano aparece como contacto o
    // nombre de empresa). Si NO aparece el agente, o aparece DESPUÉS, es
    // suplantación.
    const agentIdx = tailLow.indexOf(normalizedAgent);
    const humanIdx = humanMatch.index ?? -1;
    if (agentIdx >= 0 && agentIdx < humanIdx) continue;  // firma correcta
    return h;
  }
  return null;
}

function escapeRx(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Validator principal ─────────────────────────────────────────────────────

export function validateDraft(input: DraftValidationInput): DraftValidationResult {
  const violations: DraftViolation[] = [];
  const combinedText = `${input.summary ?? ''}\n\n${input.draft ?? ''}`;

  // 1. Frases baneadas
  for (const b of BANNED_PHRASES) {
    const match = combinedText.match(b.rx);
    if (match) {
      const idx = combinedText.indexOf(match[0]);
      const start = Math.max(0, idx - 30);
      const end   = Math.min(combinedText.length, idx + match[0].length + 60);
      violations.push({
        kind:    b.kind,
        excerpt: combinedText.slice(start, end).trim(),
        reason:  b.reason,
        fix:     b.fix,
      });
    }
  }

  // 2. Tool claim sin invocación
  const invokedSet = new Set(input.toolsActuallyInvoked.map(t => t.toLowerCase()));
  const toolHits = findToolClaimHallucinations(combinedText, invokedSet);
  for (const h of toolHits) {
    violations.push({
      kind:    'tool_claim_without_invocation',
      excerpt: h.excerpt,
      reason:  `Dices que usaste/intentaste la tool "${h.claimed}" pero NO la invocaste en este turno (tools invocadas: ${input.toolsActuallyInvoked.join(', ') || 'ninguna'}).`,
      fix:     `Si realmente necesitas esa tool, invócala en este turno. Si no la invocaste, no menciones que lo hiciste. Elimina la frase o reescríbela sin mentir sobre lo que ya hiciste.`,
    });
  }

  // 3. Suplantación de identidad en firma
  if (input.draft) {
    const impersonated = findImpersonation(input.draft, input.teamHumanNames, input.agentName);
    if (impersonated) {
      violations.push({
        kind:    'impersonation',
        excerpt: input.draft.slice(-300).trim(),
        reason:  `Firmaste el correo como "${impersonated}" que es un humano del team. Tú eres ${input.agentName}, empleado digital.`,
        fix:     `Reemplaza la firma por tu identidad: "Saludos, ${input.agentName} — Asistente de [negocio]". Puedes dejar el bloque de contacto del negocio (dirección, website) al final, pero el nombre que firma debe ser el tuyo.`,
      });
    }
  }

  if (violations.length === 0) {
    return { ok: true, violations: [], retryPrompt: null };
  }

  const retryPrompt = buildRetryPrompt(violations, input);
  return { ok: false, violations, retryPrompt };
}

function buildRetryPrompt(violations: DraftViolation[], input: DraftValidationInput): string {
  const parts: string[] = [
    `El draft que acabas de producir tiene ${violations.length} problema${violations.length === 1 ? '' : 's'} que debes corregir ANTES de que se envíe:`,
    '',
  ];
  for (const [i, v] of violations.entries()) {
    parts.push(`${i + 1}. [${v.kind}] Fragmento problemático: "${v.excerpt}"`);
    parts.push(`   Razón: ${v.reason}`);
    parts.push(`   Fix: ${v.fix}`);
    parts.push('');
  }
  parts.push(
    `Reescribe el summary + draft completo corrigiendo TODOS los problemas. Si realmente no puedes ayudar con este correo sin ejecutar una tool específica, invoca esa tool en este turno (no digas que lo hiciste si no lo hiciste). Si decides que no requiere respuesta, deja draft=null y marca needs_info=false — es mejor silencio que mentir.`,
  );
  parts.push(``);
  parts.push(`Tu nombre es ${input.agentName}. Humanos del team (NO los suplantes al firmar): ${input.teamHumanNames.slice(0, 10).join(', ') || '(ninguno conocido)'}.`);
  return parts.join('\n');
}
