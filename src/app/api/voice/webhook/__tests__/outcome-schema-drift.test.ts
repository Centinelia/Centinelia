/**
 * Guarda contra schema drift entre detectOutcome() y el CHECK constraint
 * de voice_calls.outcome.
 *
 * Bug 2026-09-29 (Tortillería / Tecate Six): detectOutcome() devolvía
 * 'incident_registered' pero el CHECK no lo incluía → INSERT fallaba con
 * 23514 → row de voice_calls nunca se creaba → minutos no se cobraban,
 * self-eval no corría, portal no mostraba la llamada. Undercount silencioso.
 *
 * Este test es STATIC: no toca DB. Lee el archivo de la migración de outcome
 * (última que redefine el CHECK) y el código de detectOutcome, y verifica
 * que cada valor de retorno del detectOutcome esté en el set del CHECK.
 * Falla en CI si alguien agrega un nuevo outcome en el código sin la
 * migración correspondiente.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

function projectRoot(): string {
  return path.resolve(__dirname, '..', '..', '..', '..', '..', '..');
}

function readWebhookSource(): string {
  return readFileSync(
    path.join(projectRoot(), 'src', 'app', 'api', 'voice', 'webhook', 'route.ts'),
    'utf8',
  );
}

/**
 * Extrae los valores permitidos por el CHECK constraint más reciente de
 * voice_calls.outcome. Busca en las migraciones el último ALTER TABLE que
 * redefine voice_calls_outcome_check; si no encuentra ninguna migración
 * que lo redefina, cae al schema.sql original.
 */
function extractAllowedOutcomes(): Set<string> {
  const migDir = path.join(projectRoot(), 'supabase', 'migrations');
  const migFiles = readdirSync(migDir).sort().reverse();
  for (const f of migFiles) {
    const content = readFileSync(path.join(migDir, f), 'utf8');
    if (content.includes('voice_calls_outcome_check') && content.includes('ADD CONSTRAINT')) {
      return parseOutcomes(content);
    }
  }
  // Fallback: schema.sql original
  const schema = readFileSync(path.join(projectRoot(), 'supabase', 'schema.sql'), 'utf8');
  return parseOutcomes(schema);
}

function parseOutcomes(sql: string): Set<string> {
  // Captura el bloque "outcome IN (...)" o "outcome in (...)"
  const m = sql.match(/outcome\s+in\s*\(([^)]+)\)/i);
  if (!m) throw new Error('No pude parsear los outcomes del CHECK constraint');
  const literals = m[1].match(/'([^']+)'/g) ?? [];
  return new Set(literals.map(s => s.slice(1, -1)));
}

/**
 * Extrae los string literals que detectOutcome() puede devolver.
 * detectOutcome está en route.ts como function detectOutcome(...) { ... }.
 * Busca todos los `return '<algo>'` dentro de ese cuerpo.
 */
function extractReturnedOutcomes(source: string): Set<string> {
  const start = source.indexOf('function detectOutcome(');
  if (start < 0) throw new Error('function detectOutcome no encontrada');
  // Encuentra la llave de apertura + la de cierre balanceada
  let i = source.indexOf('{', start);
  let depth = 0;
  const openAt = i;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') { depth--; if (depth === 0) break; }
  }
  const body = source.slice(openAt, i + 1);
  const returns = body.match(/return\s+'([^']+)'/g) ?? [];
  return new Set(returns.map(r => r.match(/'([^']+)'/)![1]));
}

describe('voice_calls outcome — schema drift guard', () => {
  it('todos los outcomes que detectOutcome() puede devolver están permitidos por el CHECK constraint', () => {
    const allowed = extractAllowedOutcomes();
    const returned = extractReturnedOutcomes(readWebhookSource());

    // El webhook también hace `outcome = durationSeconds <= 5 ? 'unanswered' : rawOutcome`
    // — 'unanswered' se sobrepone independiente de detectOutcome. Asegurarlo.
    returned.add('unanswered');

    const missing = [...returned].filter(o => !allowed.has(o));
    expect(missing, `outcomes que detectOutcome produce pero el CHECK no acepta: ${missing.join(', ')}`).toEqual([]);
  });

  it('incident_registered está en el catálogo permitido (regresión Tecate 2026-09-29)', () => {
    expect(extractAllowedOutcomes().has('incident_registered')).toBe(true);
  });
});
