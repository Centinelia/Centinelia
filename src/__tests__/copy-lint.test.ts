/**
 * copy-lint — scanner que revisa `src/**\/*.tsx` por violaciones de las
 * reglas de copy de Centinelia. Corre en cada `pnpm test`.
 *
 * Reglas enforced:
 *
 *  R1 (em-dash): `—` prohibido en JSX visible al usuario. Usar `.`, `;`, `,`
 *     o paréntesis. Ver [[feedback-no-em-dash]] en memory.
 *
 *  R2 (emoji):   caracteres del rango Unicode de emojis prohibidos en JSX.
 *     Icons via Lucide únicamente. Ver [[feedback-no-emojis]].
 *
 *  R3 (IA visible): la palabra "IA" como token separado prohibida en JSX
 *     visible (usar "empleado digital"). Ver [[feedback-no-ia-visible]].
 *
 * Cómo agregar excepción legítima:
 *   - Añadir el path o pattern al ALLOWLIST correspondiente abajo, con
 *     comentario del motivo (ej. "landing SEO usa 'agente IA' por búsqueda").
 *
 * Cómo funciona:
 *   - Lee cada .tsx, remueve comentarios (line + block).
 *   - Extrae JSX texto entre `>` `<` + valores de props visibles
 *     (title, tooltip, label, placeholder, aria-label, alt, description).
 *   - Reporta line-level. No usa AST — regex es "good enough" y no adds deps.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';

// ─── Rules ──────────────────────────────────────────────────────────────────

const RULES = {
  emDash: /—/u,
  emoji:  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F600}-\u{1F64F}]/u,
  iaWord: /\bIA\b/,
} as const;

// Props JSX cuyo valor sí es visible al usuario (title, tooltip, etc). Extraer
// también estos porque muchas violaciones viven ahí, no en text nodes.
const VISIBLE_PROPS = [
  'title', 'tooltip', 'placeholder', 'aria-label', 'alt',
  'description', 'label', 'subtitle', 'summary',
];

// ─── Allowlists (por regla) ────────────────────────────────────────────────
// Cada entrada: path o pattern + motivo explícito. NUEVA entry SIN motivo =
// PR rechazado. Cuando se resuelve la deuda, remover del allowlist.

/** Files donde el em-dash es legítimo (docs legales, contratos, PDF invoices
 *  con typografía formal). */
const EM_DASH_ALLOWLIST: RegExp[] = [
  // Legal + contratos: em-dash como separador tipográfico entre nombre del
  // proveedor y su función es formato estándar de doc legal. No es copy UI.
  /src[\\/]app[\\/]legal[\\/]/,
  /src[\\/]lib[\\/]contract[\\/]/,
];

/** Files donde algún emoji es legítimo. Zero tolerance por default. */
const EMOJI_ALLOWLIST: RegExp[] = [
  // (agregar aquí solo con motivo)
];

/** Files donde "IA" visible es legítimo (landing con SEO, docs legales). */
const IA_ALLOWLIST: RegExp[] = [
  // Landing pages y SEO: "agente IA" es término que la gente busca en Google.
  /src[\\/]app[\\/]\(landing\)[\\/]/,
  /src[\\/]app[\\/]landing[\\/]/,
  /src[\\/]app[\\/]\(marketing\)[\\/]/,
  // Legal + contratos: precisión terminológica (contrato de servicio de "IA")
  // es requerida para conformidad LFPDPPP / CFF. No es UI, es documento firmado.
  /src[\\/]app[\\/]legal[\\/]/,
  /src[\\/]lib[\\/]contract[\\/]/,
];

// ─── Scanner ────────────────────────────────────────────────────────────────

interface Violation {
  file:    string;
  line:    number;
  rule:    keyof typeof RULES;
  snippet: string;
}

const SRC_ROOT = join(process.cwd(), 'src');

function isAllowlisted(file: string, rule: keyof typeof RULES): boolean {
  const list = rule === 'emDash' ? EM_DASH_ALLOWLIST
             : rule === 'emoji'  ? EMOJI_ALLOWLIST
             : IA_ALLOWLIST;
  return list.some(re => re.test(file));
}

/** Walk recursivo de .tsx bajo src/. Devuelve paths absolutos. */
function walkTsx(root: string): string[] {
  const out: string[] = [];
  const stack: string[] = [root];
  while (stack.length) {
    const cur = stack.pop()!;
    let entries: string[] = [];
    try { entries = readdirSync(cur); } catch { continue; }
    for (const name of entries) {
      const full = join(cur, name);
      let st;
      try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) {
        // Skip node_modules por si aparece anidado, y __tests__ para no
        // linetar fixtures que intencionalmente contienen los patrones.
        if (name === 'node_modules' || name === '__tests__') continue;
        stack.push(full);
      } else if (name.endsWith('.tsx') && !name.endsWith('.test.tsx')) {
        out.push(full);
      }
    }
  }
  return out;
}

/** Extrae los "candidatos" (líneas que contienen texto visible al usuario)
 *  de un archivo .tsx. Retorna Map<lineNumber, texto candidato>. */
function extractCandidateLines(src: string): Map<number, string> {
  const out = new Map<number, string>();

  // Strip block comments /* ... */ y line comments // ... primero.
  const noBlockComments = src.replace(/\/\*[\s\S]*?\*\//g, '');
  const lines = noBlockComments.split('\n');

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Strip line comments (después del primer `//` fuera de string). Heurística
    // simple: no soporta URLs con // en strings sin escape; falsos negativos OK.
    const commentIdx = line.indexOf('//');
    if (commentIdx >= 0) {
      const before = line.slice(0, commentIdx);
      // Si el // está dentro de comillas, no es comentario. Chequeo rápido:
      // contar comillas antes.
      const quotes = (before.match(/["']/g) || []).length;
      if (quotes % 2 === 0) {
        line = before;
      }
    }

    // Buscar contenido visible al usuario:
    // 1. JSX text entre `>` y `<`
    // 2. Props visibles: title="...", tooltip="..."
    const jsxTextMatches = Array.from(line.matchAll(/>([^<>]{2,})</g));
    const propMatches = VISIBLE_PROPS.flatMap(p =>
      Array.from(line.matchAll(new RegExp(`${p}=(?:"([^"]+)"|'([^']+)'|\\{[\`']([^\`']+)[\`']\\})`, 'g')))
    );

    const parts: string[] = [];
    for (const m of jsxTextMatches) parts.push(m[1]);
    for (const m of propMatches)    parts.push(m[1] || m[2] || m[3] || '');

    if (parts.length > 0) out.set(i + 1, parts.join(' | '));
  }
  return out;
}

function scan(files: string[]): Violation[] {
  const violations: Violation[] = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    const candidates = extractCandidateLines(src);
    for (const [lineNum, text] of candidates) {
      for (const rule of Object.keys(RULES) as (keyof typeof RULES)[]) {
        if (isAllowlisted(file, rule)) continue;
        if (RULES[rule].test(text)) {
          violations.push({
            file:    file.replace(SRC_ROOT + sep, 'src' + sep),
            line:    lineNum,
            rule,
            snippet: text.length > 100 ? text.slice(0, 100) + '…' : text,
          });
        }
      }
    }
  }
  return violations;
}

function groupByRule(vs: Violation[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of vs) out[v.rule] = (out[v.rule] ?? 0) + 1;
  return out;
}

// ─── Snapshot: baseline de la deuda actual ─────────────────────────────────
// La 1ª corrida documenta el estado. Cada nueva violación (no listada aquí) =
// test rojo. Cuando se arregla una violación existente, se remueve del snapshot.

const BASELINE_MAX_PER_RULE: Record<keyof typeof RULES, number> = {
  // Actualizado 2026-09-14 tras limpieza completa. Todos en 0 — cualquier
  // violación nueva = test rojo. Legal + contract allowlisted como
  // typografía formal permitida.
  emDash: 0,
  emoji:  0,
  iaWord: 0,
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('copy-lint — reglas de copy visible al usuario', () => {
  const files = walkTsx(SRC_ROOT);
  const violations = scan(files);
  const counts = groupByRule(violations);

  it(`no aumenta violaciones de em-dash sobre baseline (${BASELINE_MAX_PER_RULE.emDash})`, () => {
    const count = counts.emDash ?? 0;
    if (count > BASELINE_MAX_PER_RULE.emDash) {
      const newOnes = violations.filter(v => v.rule === 'emDash').slice(0, 10);
      throw new Error(
        `em-dash violations subió a ${count} (baseline ${BASELINE_MAX_PER_RULE.emDash}). ` +
        `Nuevas (10 max): ${newOnes.map(v => `${v.file}:${v.line}`).join(', ')}. ` +
        `Fix el em-dash y decrementa el baseline en el mismo PR.`,
      );
    }
    expect(count).toBeLessThanOrEqual(BASELINE_MAX_PER_RULE.emDash);
  });

  it(`no aumenta violaciones de emoji sobre baseline (${BASELINE_MAX_PER_RULE.emoji})`, () => {
    const count = counts.emoji ?? 0;
    if (count > BASELINE_MAX_PER_RULE.emoji) {
      const newOnes = violations.filter(v => v.rule === 'emoji').slice(0, 10);
      throw new Error(
        `emoji violations subió a ${count} (baseline ${BASELINE_MAX_PER_RULE.emoji}). ` +
        `Reemplazar por Lucide icon. Nuevas: ${newOnes.map(v => `${v.file}:${v.line}`).join(', ')}.`,
      );
    }
    expect(count).toBeLessThanOrEqual(BASELINE_MAX_PER_RULE.emoji);
  });

  it(`no aumenta violaciones de "IA" visible sobre baseline (${BASELINE_MAX_PER_RULE.iaWord})`, () => {
    const count = counts.iaWord ?? 0;
    if (count > BASELINE_MAX_PER_RULE.iaWord) {
      const newOnes = violations.filter(v => v.rule === 'iaWord').slice(0, 10);
      throw new Error(
        `"IA" visible violations subió a ${count} (baseline ${BASELINE_MAX_PER_RULE.iaWord}). ` +
        `Usar "empleado digital". Nuevas: ${newOnes.map(v => `${v.file}:${v.line}`).join(', ')}.`,
      );
    }
    expect(count).toBeLessThanOrEqual(BASELINE_MAX_PER_RULE.iaWord);
  });

  it('imprime resumen (útil para ajustar el baseline)', () => {
    // No falla; solo emite el resumen al stdout de vitest para que quien
    // corra el suite pueda actualizar BASELINE_MAX_PER_RULE de una.
    console.log(`[copy-lint] counts: em-dash=${counts.emDash ?? 0}, emoji=${counts.emoji ?? 0}, IA=${counts.iaWord ?? 0}`);
    if ((counts.emDash ?? 0) > 0) {
      const em = violations.filter(v => v.rule === 'emDash');
      console.log('[copy-lint] em-dash hits:');
      for (const v of em) console.log(`  ${v.file}:${v.line}  ${v.snippet}`);
    }
    expect(true).toBe(true);
  });
});
