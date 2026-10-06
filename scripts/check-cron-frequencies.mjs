#!/usr/bin/env node
/**
 * check-cron-frequencies.mjs
 *
 * Prevención estática del patrón del bug 2026-10-05 (PR #112): un cron
 * costoso que corre más seguido de lo necesario genera gasto compuesto.
 *
 * Historia:
 *   2026-10-05 PR #112: bajamos nash-monitor de 1h a 4h para ahorrar
 *   ~$7-11/mes en Anthropic. El fix fue reversible por descuido o buena
 *   fe (alguien ve "cada 4h" y piensa que debería ser más frecuente).
 *
 * Este linter protege la decisión documentando el mínimo acordado y
 * bloqueando el build si vercel.json lo viola. Para subir la frecuencia
 * de un cron protegido se debe editar también este archivo con nueva
 * justificación en el commit.
 *
 * Uso: node scripts/check-cron-frequencies.mjs
 * Exit 0 si OK, 1 si hay violaciones.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');

/**
 * Crons con mínimo acordado. Cualquier intento de bajar el intervalo
 * (correrlo MÁS seguido) debe editar esta lista + justificar en commit.
 *
 * minMinutes = intervalo mínimo entre ejecuciones. Si el schedule
 * actual implica un intervalo menor, el linter falla.
 */
export const PROTECTED_CRONS = [
  {
    path:       '/api/cron/nash-monitor',
    minMinutes: 240,  // cada 4h
    reason:     'PR #112 (2026-10-05): bajamos de 1h a 4h por costo (~$7-11/mes save). Las señales que monitorea (bug_report, escalated_stale, failed_handoff) toleran 4h de latencia. Anomaly + drift detection tienen throttle interno 60min que sigue aplicando.',
    // Monitor-del-monitor: cuando bajamos la cadencia del cron, también hay
    // que subir el threshold de "está atascado" para no disparar falsas
    // alarmas (bug 2026-10-05: tras bajar Nash a 4h, el threshold 3h en
    // daily-digest/route.ts seguía igual → alerta "Nash atascado" en cada
    // ciclo). El threshold debe ser al menos 2× cadencia + colchón para
    // absorber el ~25% miss-rate de Vercel sin falsa alarma.
    stuckThreshold: {
      file:   'src/app/api/cron/daily-digest/route.ts',
      symbol: 'NASH_STALE_THRESHOLD_MS',
      minMs:  480 * 60_000,   // 480 min = 2× cadencia 240min (threshold real: 10h, con margen)
    },
  },
];

/**
 * Parsea el schedule cron (5 campos: minute hour day month weekday) y
 * devuelve el intervalo típico en minutos entre ejecuciones.
 *
 * Soporta los patrones comunes de Vercel. Devuelve null si el schedule
 * no se puede parsear a un intervalo simple (ej. combinaciones raras).
 */
export function parseCronIntervalMinutes(schedule) {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minute, hour, day, month, weekday] = parts;

  // Patrones comunes:
  // "*/N * * * *"     → cada N minutos (si N válido 1-59)
  // "0 * * * *"       → cada hora (60 min)
  // "N * * * *"       → cada hora (60 min, offset irrelevante para intervalo)
  // "0 */N * * *"     → cada N horas (N*60 min)
  // "0 N * * *"       → cada día (1440 min, offset irrelevante)
  // "0 0 * * *"       → cada día (1440 min)
  // "0 0 * * N"       → cada semana (10080 min)

  const everyWildcards = (day === '*' && month === '*' && weekday === '*');

  // "*/N * * * *"
  const minStepMatch = minute.match(/^\*\/(\d+)$/);
  if (minStepMatch && hour === '*' && everyWildcards) {
    return parseInt(minStepMatch[1], 10);
  }

  // "0 */N * * *" o "N */M * * *" (offset en minutos no cambia el período)
  const hourStepMatch = hour.match(/^\*\/(\d+)$/);
  if (hourStepMatch && /^\d+$/.test(minute) && everyWildcards) {
    return parseInt(hourStepMatch[1], 10) * 60;
  }

  // "0 * * * *" o "N * * * *" (ejecución una vez por hora)
  if (hour === '*' && /^\d+$/.test(minute) && everyWildcards) {
    return 60;
  }

  // "0 N * * *" o "0 0 * * *" (una vez al día a hora fija)
  if (/^\d+$/.test(hour) && /^\d+$/.test(minute) && everyWildcards) {
    return 1440;
  }

  // "0 0 * * N" (una vez por semana)
  if (/^\d+$/.test(hour) && /^\d+$/.test(minute) && day === '*' && month === '*' && /^\d+$/.test(weekday)) {
    return 10080;
  }

  // No reconocido — mejor conservador: devolver null (el caller decide).
  return null;
}

// Parsea una expresión aritmética literal como "10 * 60 * 60_000" o
// "3 * 60 * 60000" (valor en ms). Soporta underscores numéricos y multiplicación.
// Devuelve el valor numérico o null si no se puede evaluar de forma segura.
export function parseMsLiteral(expr) {
  const cleaned = expr.replace(/_/g, '').trim();
  if (!/^[\d\s*]+$/.test(cleaned)) return null;
  try {
    const parts = cleaned.split('*').map(p => p.trim());
    if (parts.some(p => !/^\d+$/.test(p))) return null;
    return parts.reduce((acc, p) => acc * parseInt(p, 10), 1);
  } catch {
    return null;
  }
}

export async function findCronViolations({ vercelJsonPath, protectedCrons = PROTECTED_CRONS, repoRoot }) {
  const raw = await readFile(vercelJsonPath, 'utf8');
  const vercel = JSON.parse(raw);
  const crons = Array.isArray(vercel.crons) ? vercel.crons : [];

  const violations = [];
  for (const protection of protectedCrons) {
    const cron = crons.find(c => c.path === protection.path);
    if (!cron) {
      violations.push({
        kind:   'missing',
        path:   protection.path,
        reason: `Cron protegido no encontrado en vercel.json (puede haberse removido). Mínimo esperado: ${protection.minMinutes} min.`,
      });
      continue;
    }
    const actualMin = parseCronIntervalMinutes(cron.schedule);
    if (actualMin === null) {
      violations.push({
        kind:     'unparseable',
        path:     protection.path,
        schedule: cron.schedule,
        reason:   `Schedule "${cron.schedule}" no se pudo parsear. El linter requiere un patrón reconocible para validar el intervalo mínimo.`,
      });
      continue;
    }
    if (actualMin < protection.minMinutes) {
      violations.push({
        kind:          'too_frequent',
        path:          protection.path,
        schedule:      cron.schedule,
        actualMinutes: actualMin,
        minMinutes:    protection.minMinutes,
        reason:        protection.reason,
      });
    }

    // Cross-check monitor-del-monitor: cuando la cadencia del cron sube, el
    // threshold de "está atascado" también tiene que subir. Si no, el monitor
    // dispara falsas alarmas en cada ciclo (bug Nash 2026-10-05).
    if (protection.stuckThreshold && repoRoot) {
      try {
        const stuckFile = await readFile(join(repoRoot, protection.stuckThreshold.file), 'utf8');
        const re = new RegExp(
          `(?:const|let|var)\\s+${protection.stuckThreshold.symbol}\\s*(?::\\s*[\\w<>|]+)?\\s*=\\s*([^;\\n]+)`,
        );
        const m = re.exec(stuckFile);
        if (!m) {
          violations.push({
            kind:    'stuck_threshold_missing',
            path:    protection.path,
            reason:  `No encontré el símbolo ${protection.stuckThreshold.symbol} en ${protection.stuckThreshold.file}. El monitor-del-monitor es obligatorio para crons protegidos.`,
          });
        } else {
          const parsed = parseMsLiteral(m[1]);
          if (parsed === null) {
            violations.push({
              kind:    'stuck_threshold_unparseable',
              path:    protection.path,
              reason:  `${protection.stuckThreshold.symbol} = "${m[1].trim()}" no se pudo parsear como literal ms. Usa expresión aritmética simple (ej. "10 * 60 * 60_000").`,
            });
          } else if (parsed < protection.stuckThreshold.minMs) {
            violations.push({
              kind:    'stuck_threshold_too_low',
              path:    protection.path,
              reason:  `${protection.stuckThreshold.symbol} en ${protection.stuckThreshold.file} vale ${parsed}ms (${Math.round(parsed/60_000)}min) pero debe ser >= ${protection.stuckThreshold.minMs}ms (${Math.round(protection.stuckThreshold.minMs/60_000)}min = 2× cadencia + buffer). Si bajas Nash a mayor cadencia, sube también este threshold o vas a dispararte falsas alarmas (bug 2026-10-05).`,
            });
          }
        }
      } catch (err) {
        violations.push({
          kind:    'stuck_threshold_read_error',
          path:    protection.path,
          reason:  `No pude leer ${protection.stuckThreshold.file}: ${err.message}`,
        });
      }
    }
  }
  return violations;
}

// CLI entrypoint
const __invokedPath = process.argv[1] ? process.argv[1].replace(/\\/g, '/') : '';
const __thisFile    = fileURLToPath(import.meta.url).replace(/\\/g, '/');
if (__invokedPath === __thisFile) {
  const violations = await findCronViolations({ vercelJsonPath: join(ROOT, 'vercel.json'), repoRoot: ROOT });

  if (violations.length > 0) {
    console.error('\n[check-cron-frequencies] Violaciones a frecuencias protegidas:\n');
    for (const v of violations) {
      console.error(`  ${v.path}  [${v.kind}]`);
      if (v.schedule) console.error(`    schedule actual: "${v.schedule}" (~${v.actualMinutes ?? '?'} min)`);
      if (v.minMinutes) console.error(`    mínimo acordado: ${v.minMinutes} min`);
      console.error(`    razón: ${v.reason}`);
      console.error('');
    }
    console.error(
      'Si realmente necesitas cambiar el intervalo, edita también\n' +
      'scripts/check-cron-frequencies.mjs (PROTECTED_CRONS) con nueva\n' +
      'justificación en el commit message. No hagas workaround.\n',
    );
    process.exit(1);
  }

  console.log(`[check-cron-frequencies] OK — ${PROTECTED_CRONS.length} cron(s) protegido(s) validado(s).`);
}
