#!/usr/bin/env node
/**
 * check-llm-logging.mjs
 *
 * Guarda: cualquier archivo en src/ o scripts/ que llame
 * `anthropic.messages.create` o `.stream` (o cliente equivalente) DEBE
 * también referenciar `logLlmCall`. Sin logging, el gasto Anthropic queda
 * invisible en el dashboard interno (llm_call_log) y no se puede auditar
 * contra la factura Anthropic. Ver postmortem 2026-09-08 (spike
 * vision/extract del 07 no loggeado) y post 2026-10-05 (gap $28 en 30
 * días por scripts/eval/* sin logging + .stream no cubierto).
 *
 * Uso: node scripts/check-llm-logging.mjs
 * Exit 0 si todo ok, 1 si hay violaciones.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Match ambos: .messages.create() y .messages.stream(). Vapi customLLM
// y endpoints de chat usan .stream, no .create — el patrón original los
// dejaba fuera.
export const CALL_PATTERN = /\.messages\.(create|stream)\s*\(/;
export const LOG_PATTERN  = /logLlmCall/;

// Allow-list: archivos legitimos que llaman al SDK sin logLlmCall
// (ej. el linter mismo, scripts de infra 100% ajenos a cost tracking).
// Agregar entradas aquí requiere justificación; no es escape hatch para
// scripts de eval o features productivos.
export const DEFAULT_ALLOW_LIST = new Set([
  'scripts/check-llm-logging.mjs',
]);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) files.push(...await walk(full));
    else if (/\.(ts|tsx|mjs|js)$/.test(e.name)) files.push(full);
  }
  return files;
}

/**
 * Escanea los `targets` relativos a `root` y devuelve la lista de
 * paths relativos a `root` que llaman al SDK sin `logLlmCall`.
 */
export async function findUnloggedCallSites({ root, targets, allowList = DEFAULT_ALLOW_LIST }) {
  const files = (await Promise.all(targets.map(walk))).flat();
  const violations = [];
  for (const file of files) {
    const rel = relative(root, file).replace(/\\/g, '/');
    if (allowList.has(rel)) continue;
    const src = await readFile(file, 'utf8');
    const stripped = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    if (!CALL_PATTERN.test(stripped)) continue;
    if (LOG_PATTERN.test(stripped))  continue;
    violations.push(rel);
  }
  return { files, violations };
}

// CLI entrypoint. Solo corre cuando el archivo se invoca directo (no en tests).
const __invokedPath = process.argv[1] ? process.argv[1].replace(/\\/g, '/') : '';
const __thisFile    = fileURLToPath(import.meta.url).replace(/\\/g, '/');
if (__invokedPath === __thisFile) {
  const ROOT    = join(fileURLToPath(import.meta.url), '..', '..');
  const TARGETS = [join(ROOT, 'src'), join(ROOT, 'scripts')];
  const { files, violations } = await findUnloggedCallSites({ root: ROOT, targets: TARGETS });

  if (violations.length > 0) {
    console.error('\n[check-llm-logging] Archivos que llaman anthropic.messages.(create|stream) SIN logLlmCall:\n');
    for (const v of violations) console.error(`  - ${v}`);
    console.error(
      '\nSolución: importar `logLlmCall` de `@/lib/observability/llm-log` y envolver' +
      '\nla llamada en try/catch loggeando usage + errores. Ver src/lib/ai/self-eval.ts' +
      '\ncomo referencia. Sin esto, el gasto Anthropic queda invisible en llm_call_log.\n',
    );
    process.exit(1);
  }

  console.log(`[check-llm-logging] OK — ${files.length} archivos escaneados, 0 violaciones.`);
}
