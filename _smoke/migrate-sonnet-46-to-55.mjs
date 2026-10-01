// Migración Sonnet 4.6 → 5.5 en todas las llamadas LLM del codebase.
// User ask 2026-10-01: "Deberíamos usar Sonnet 5.5 en todo lo que hoy use Sonnet 4.6."
//
// Scope:
// - Reemplaza literal 'claude-sonnet-4-6' → 'claude-sonnet-5-5' en src/, scripts/, __snapshots__/.
// - EXCLUYE 2 archivos de test que pin'ean el comportamiento 4.6 (son los controles
//   negativos del guard `isPostTempModel` y de `meerkat-invoker-temperature`).
// - EXCLUYE docs/, fixtures/, specs/ (histórico, no se re-escribe).
// - EXCLUYE node_modules/, .next/, .claude/.
//
// Pattern Node (no PowerShell per [[feedback-powershell-51-utf8-bulk-edit]]).

import fs from 'node:fs';
import path from 'node:path';

const OLD = `'claude-sonnet-4-6'`;
const NEW = `'claude-sonnet-5-5'`;

// Archivos a NO modificar (explícitamente pinnean 4-6 como caso de control)
const EXCLUDED = new Set([
  'src/lib/anthropic/__tests__/model-guards.test.ts',
  'src/lib/golden-tests/__tests__/meerkat-invoker-temperature.test.ts',
]);

// Directorios a NO entrar
const SKIP_DIRS = new Set(['node_modules', '.next', '.claude', '.git', 'coverage', 'playwright-report', 'test-results']);
// Y además: docs/, fixtures/, _smoke/ no son código de prod — skip también
const SKIP_TOP = new Set(['docs', 'fixtures', '_smoke']);

// Extensiones a procesar
const EXTS = new Set(['.ts', '.tsx', '.mjs', '.js', '.json']);

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel  = path.relative('.', full).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      if (dir === '.' && SKIP_TOP.has(entry.name)) continue;
      walk(full, acc);
    } else if (entry.isFile()) {
      if (!EXTS.has(path.extname(entry.name))) continue;
      if (EXCLUDED.has(rel)) continue;
      acc.push(rel);
    }
  }
  return acc;
}

const files = walk('.');
let touched = 0;
let hitFiles = [];

for (const rel of files) {
  const content = fs.readFileSync(rel, 'utf-8');
  if (!content.includes('claude-sonnet-4-6')) continue;
  // Reemplazo global pero conservativo: solo el string literal exacto
  // (incluye comillas simples/dobles/template para cubrir todos los casos sintácticos).
  const next = content
    .replace(/'claude-sonnet-4-6'/g, "'claude-sonnet-5-5'")
    .replace(/"claude-sonnet-4-6"/g, '"claude-sonnet-5-5"')
    .replace(/`claude-sonnet-4-6`/g, '`claude-sonnet-5-5`');
  if (next === content) continue;
  fs.writeFileSync(rel, next, 'utf-8');
  touched++;
  hitFiles.push(rel);
}

console.log(`Modified ${touched} files:`);
for (const f of hitFiles) console.log('  ' + f);
console.log('\nExcluded (pin 4.6 behavior intentionally):');
for (const f of EXCLUDED) console.log('  ' + f);
