#!/usr/bin/env node
/**
 * check-stale-reset-date.mjs
 *
 * Guarda: `voice_agents.minutes_reset_date` queda stale para cuentas Stripe
 * (el cron reset-minutes solo actualiza `account_minutes.minutes_reset_date`).
 * Cualquier lectura del campo en voice_agents que se use para mostrar fecha
 * de ciclo al cliente / proyectar consumo lleva al bug Tortillería 2026-10-12
 * (correo "28 días restantes" cuando eran 19).
 *
 * Fuente única correcta: `src/lib/portal/account-cycle.ts` (loadAccountCycle
 * / computeAccountCycle). Si tu código necesita el reset date, pasa por ahí.
 *
 * Esta guard es sintáctica (regex) — no entiende semánticamente qué tabla se
 * está leyendo. Para evitar falsos positivos, flagea sólo archivos que
 * contengan AMBOS: `voice_agents` (referencia a la tabla) Y `minutes_reset_date`
 * (lectura del campo). Allow-list cubre: el helper fuente única, el cron que
 * sí tiene permiso de leer/escribir el campo, migraciones, tests, y types
 * generados.
 *
 * Uso: node scripts/check-stale-reset-date.mjs
 * Exit 0 si todo ok, 1 si hay violaciones.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Patrón de bug: `.from('voice_agents').select(...minutes_reset_date...)` en el
// mismo bloque. Detecta la lectura directa de la tabla stale. Permite:
//  - lectura de `account_minutes.minutes_reset_date` (fresca, correcta)
//  - lectura de `organizations.minutes_reset_date` (campo semánticamente distinto)
//  - escrituras `.update({ minutes_reset_date: ... })` o `.insert({ minutes_reset_date: ... })`
const BAD_READ_PATTERN = /\.from\s*\(\s*['"]voice_agents['"]\s*\)\s*(?:\s*\n\s*)?\.select\s*\(\s*['"][^'"]*minutes_reset_date/;
// Si el archivo ya pasa por el helper fuente única (o por una función que
// internamente lo usa, como maybeSendQuotaEmail), se asume que la lectura de
// `voice_agents.minutes_reset_date` es sólo fallback legítimo (standalone sin
// portal_email) o parte del input a loadAccountCycle({ agentResetDate }).
const HELPER_PATTERN = /loadAccountCycle|computeAccountCycle|maybeSendQuotaEmail/;

// Allow-list: archivos legítimos que mencionan AMBOS strings sin introducir
// el bug. Agregar entradas aquí requiere justificación. Nunca agregar un
// cron, API route o email template "porque funciona hoy".
export const DEFAULT_ALLOW_LIST = new Set([
  // Fuente única — el helper que todos los demás deben usar
  'src/lib/portal/account-cycle.ts',
  'src/lib/portal/__tests__/account-cycle.test.ts',
  // Cron de reset — es el único que actualiza voice_agents.minutes_reset_date
  // para agentes standalone sin portal_email
  'src/app/api/cron/reset-minutes/route.ts',
  // pool-status: lee minutes_reset_date de agent como fallback explícito,
  // documentado como "último recurso solo para standalone sin portal_email"
  'src/lib/portal/pool-status.ts',
  // Cron de monitoreo de contratos anuales — campo semánticamente distinto
  // (fin de contrato anual, no ciclo billing mensual)
  'src/lib/ops/contracts-monitor.ts',
  // UI admin: dashboard interno, nunca correo cliente
  'src/app/admin/inicio/page.tsx',
  'src/app/admin/billing/BillingClient.tsx',
  'src/app/admin/facturacion/page.tsx',
  // Linter mismo
  'scripts/check-stale-reset-date.mjs',
]);

async function walk(dir) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); }
  catch { return []; }
  const files = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      // Skip migrations, generated types, node_modules, tests, build output
      if (/^(node_modules|\.next|dist|build|supabase|__tests__|coverage)$/.test(e.name)) continue;
      files.push(...await walk(full));
    } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.ts$/.test(e.name) && !/\.generated\./.test(e.name)) {
      files.push(full);
    }
  }
  return files;
}

export async function findStaleResetDateReads({ root, targets, allowList = DEFAULT_ALLOW_LIST }) {
  const files = (await Promise.all(targets.map(walk))).flat();
  const violations = [];
  for (const file of files) {
    const rel = relative(root, file).replace(/\\/g, '/');
    if (allowList.has(rel)) continue;
    const src = await readFile(file, 'utf8');
    // Strip comments para no flagear menciones en docstrings
    const stripped = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    if (!BAD_READ_PATTERN.test(stripped)) continue;
    if (HELPER_PATTERN.test(stripped))    continue;
    violations.push(rel);
  }
  return { files, violations };
}

const __invokedPath = process.argv[1] ? process.argv[1].replace(/\\/g, '/') : '';
const __thisFile    = fileURLToPath(import.meta.url).replace(/\\/g, '/');
if (__invokedPath === __thisFile) {
  const ROOT    = join(fileURLToPath(import.meta.url), '..', '..');
  const TARGETS = [join(ROOT, 'src')];
  const { files, violations } = await findStaleResetDateReads({ root: ROOT, targets: TARGETS });

  if (violations.length > 0) {
    console.error('\n[check-stale-reset-date] Archivos que mencionan `voice_agents` y `minutes_reset_date`:\n');
    for (const v of violations) console.error(`  - ${v}`);
    console.error(
      '\n`voice_agents.minutes_reset_date` queda stale para cuentas Stripe (nunca lo actualiza' +
      '\nel cron reset-minutes, que solo mueve `account_minutes.minutes_reset_date`).' +
      '\n\nSi necesitas el reset date para mostrarlo al cliente o calcular ciclo, usa:' +
      '\n  import { loadAccountCycle } from "@/lib/portal/account-cycle";' +
      '\n\nSi tienes una razón legítima para leer el campo (ej. cron de reset mismo), agrega' +
      '\nel archivo a DEFAULT_ALLOW_LIST en scripts/check-stale-reset-date.mjs con comentario.' +
      '\n\nContexto: bug Tortillería 2026-10-12 (correo "28 días restantes" cuando eran 19).\n',
    );
    process.exit(1);
  }
  console.log(`[check-stale-reset-date] OK: ${files.length} archivos escaneados, 0 violaciones.`);
}
