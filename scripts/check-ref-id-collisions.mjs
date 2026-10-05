#!/usr/bin/env node
/**
 * check-ref-id-collisions.mjs
 *
 * Detecta el patrón del bug 2026-10-01 + 2026-10-05: dentro de un mismo
 * archivo, 2+ llamadas a `consumeAiOp` con el mismo `source` Y la misma
 * expresión `reference_id` → colisión contra el UNIQUE constraint
 * `ops_ledger_portal_ref_kind_uniq` cuando ambos cobros disparan →
 * undercharge silencioso (viola [[feedback-pool-accuracy-top-priority]]).
 *
 * Historia:
 *   2026-10-01: fix PR #103 arregló 12 lugares (incidencia, factura,
 *               bitácora, tickets, etc.) sufijando reference_id.
 *   2026-10-05: alerta de infra reveló que inbox-processor quedó fuera
 *               del fix. Se arregló esos 2 call sites.
 *
 * Para que ESTO NO VUELVA A PASAR, este linter escanea toda la codebase
 * y previene que alguien agregue un call site repetido con mismo
 * reference_id. Si el patrón reaparece en el futuro, el linter lo
 * bloquea en CI antes de merge.
 *
 * Uso: node scripts/check-ref-id-collisions.mjs
 * Exit 0 si OK, 1 si hay colisiones.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT    = join(fileURLToPath(import.meta.url), '..', '..');
const TARGETS = [join(ROOT, 'src')];

// Allow-list: archivos donde la "colisión aparente" es false positive
// comprobado (ej. flows realmente mutuamente exclusivos cross-request).
// Agregar entradas requiere justificación en el commit message.
export const DEFAULT_ALLOW_LIST = new Set([]);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) files.push(...await walk(full));
    else if (/\.(ts|tsx)$/.test(e.name) && !e.name.endsWith('.test.ts') && !e.name.endsWith('.test.tsx')) {
      files.push(full);
    }
  }
  return files;
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * Extrae todas las llamadas `consumeAiOp(..., { source: 'x', reference_id: expr, ... })`
 * del source. Devuelve [{ source, reference_id (string de la expresión),
 * line (número 1-based) }].
 *
 * Usa balanced-paren matching para soportar template literals con `${}`
 * dentro de los args (que contienen `{` y rompen regex ingenuo).
 *
 * Limitación: solo compara la expresión como string. Dos variables con
 * distinto nombre pero mismo valor runtime no se detectan (ej. `incidentId`
 * vs `id`). OK para el patrón que queremos atrapar.
 */
export function extractConsumeAiOpCalls(src) {
  const results = [];
  const marker = 'consumeAiOp(';
  let i = 0;
  while ((i = src.indexOf(marker, i)) !== -1) {
    const callStart = i;
    i += marker.length;
    // Camina balanceando parens, considerando strings y template literals
    let depth = 1;
    let inStr = null;  // ', ", or `
    let templateDepth = 0;
    while (i < src.length && depth > 0) {
      const ch = src[i];
      if (inStr) {
        if (ch === '\\') { i += 2; continue; }
        if (inStr === '`' && ch === '$' && src[i + 1] === '{') {
          templateDepth++;
          i += 2;
          continue;
        }
        if (ch === inStr && (inStr !== '`' || templateDepth === 0)) {
          inStr = null;
        }
        i++;
        continue;
      }
      if (templateDepth > 0 && ch === '}') {
        templateDepth--;
        i++;
        continue;
      }
      if (ch === "'" || ch === '"' || ch === '`') {
        inStr = ch;
        i++;
        continue;
      }
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      i++;
    }
    const argsBlob = src.slice(callStart + marker.length, i - 1);
    const sourceM = argsBlob.match(/source:\s*(['"])([^'"]+)\1/);
    const refIdM  = argsBlob.match(/reference_id:\s*((?:`(?:[^`\\]|\\.)*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|[^,}\n]+))/);
    if (sourceM && refIdM) {
      const beforeMatch = src.slice(0, callStart);
      const line = beforeMatch.split('\n').length;
      results.push({
        source:       sourceM[2],
        reference_id: refIdM[1].trim(),
        line,
      });
    }
  }
  return results;
}

/**
 * Devuelve las colisiones detectadas:
 *   { file, source, reference_id, lines: [L1, L2, ...] }
 * Una colisión = en el mismo archivo, 2+ consumeAiOp con mismo source
 * y misma expresión literal de reference_id.
 */
export async function findRefIdCollisions({ root, targets, allowList = DEFAULT_ALLOW_LIST }) {
  const files = (await Promise.all(targets.map(walk))).flat();
  const collisions = [];
  for (const file of files) {
    const rel = relative(root, file).replace(/\\/g, '/');
    if (allowList.has(rel)) continue;
    const raw = await readFile(file, 'utf8');
    const src = stripComments(raw);
    const calls = extractConsumeAiOpCalls(src);
    if (calls.length < 2) continue;
    // Agrupar por (source, reference_id)
    const grouped = new Map();
    for (const c of calls) {
      const key = `${c.source}|${c.reference_id}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(c.line);
    }
    for (const [key, lines] of grouped) {
      if (lines.length < 2) continue;
      const [source, reference_id] = key.split('|');
      collisions.push({ file: rel, source, reference_id, lines });
    }
  }
  return collisions;
}

// CLI entrypoint
const __invokedPath = process.argv[1] ? process.argv[1].replace(/\\/g, '/') : '';
const __thisFile    = fileURLToPath(import.meta.url).replace(/\\/g, '/');
if (__invokedPath === __thisFile) {
  const collisions = await findRefIdCollisions({ root: ROOT, targets: TARGETS });

  if (collisions.length > 0) {
    console.error('\n[check-ref-id-collisions] Posible undercharge: consumeAiOp duplicado:\n');
    for (const c of collisions) {
      console.error(`  ${c.file} (líneas ${c.lines.join(', ')})`);
      console.error(`    source=${c.source}  reference_id=${c.reference_id}`);
    }
    console.error(
      '\nFix: sufijar el reference_id de uno de los cobros con un tag' +
      '\ndistintivo (ej. `${baseRef}:tag`). Ver ' +
      'src/lib/ops/inbox-processor.ts' +
      '\ncomo referencia (sufijos :observador y :processed, fix 2026-10-05).' +
      '\n\nSi el call-site es provadamente mutuamente exclusivo cross-request,' +
      '\nagregar al ALLOW_LIST en scripts/check-ref-id-collisions.mjs con' +
      '\njustificación en el commit message.\n',
    );
    process.exit(1);
  }

  console.log('[check-ref-id-collisions] OK — 0 colisiones detectadas.');
}
