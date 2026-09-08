#!/usr/bin/env node
/**
 * check-llm-logging.mjs
 *
 * Guarda: cualquier archivo en src/ que llame `anthropic.messages.create`
 * (o cliente equivalente) DEBE también referenciar `logLlmCall`. Sin logging,
 * el gasto Anthropic queda invisible en el dashboard interno (llm_call_log) y
 * no se puede auditar contra la factura Anthropic. Ver postmortem 2026-09-08
 * (spike vision/extract del 07 no loggeado).
 *
 * Uso: node scripts/check-llm-logging.mjs
 * Exit 0 si todo ok, 1 si hay violaciones.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const SRC  = join(ROOT, 'src');

const CALL_PATTERN = /\.messages\.create\s*\(/;
const LOG_PATTERN  = /logLlmCall/;

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

const files = await walk(SRC);
const violations = [];

for (const file of files) {
  const src = await readFile(file, 'utf8');
  // Strip block comments y line comments para evitar falsos positivos en docs.
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  if (!CALL_PATTERN.test(stripped)) continue;
  if (LOG_PATTERN.test(stripped))  continue;
  violations.push(relative(ROOT, file).replace(/\\/g, '/'));
}

if (violations.length > 0) {
  console.error('\n[check-llm-logging] Archivos que llaman anthropic.messages.create SIN logLlmCall:\n');
  for (const v of violations) console.error(`  - ${v}`);
  console.error(
    '\nSolución: importar `logLlmCall` de `@/lib/observability/llm-log` y envolver' +
    '\nla llamada en try/catch loggeando usage + errores. Ver src/lib/ai/self-eval.ts' +
    '\ncomo referencia. Sin esto, el gasto Anthropic queda invisible en llm_call_log.\n',
  );
  process.exit(1);
}

console.log(`[check-llm-logging] OK — ${files.length} archivos escaneados, 0 violaciones.`);
