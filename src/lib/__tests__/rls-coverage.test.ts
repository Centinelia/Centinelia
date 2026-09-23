import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

// Static regression test para .brain/policies/migrations.md regla 1:
// "Todo CREATE TABLE lleva ENABLE ROW LEVEL SECURITY inmediatamente después."
//
// Escanea todas las migrations en supabase/migrations/ y verifica que cada
// tabla creada en el schema public tenga RLS habilitado en alguna migration
// (misma u otra posterior).
//
// Aplica en CI vía `npm test`. Origen: sesión 2026-09-23 tras Supabase Advisor
// que reportó 18 tablas sin RLS con data fiscal + OAuth tokens expuestos.

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../supabase/migrations');

// Tablas que legítimamente NO necesitan RLS. Documentar razón inline.
// Cualquier adición requiere PR con approval de Nazre.
const RLS_ALLOWLIST = new Set<string>([
  // (vacío por ahora - todas las tablas de public deben tener RLS)
]);

const CREATE_TABLE_RE =
  /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?["`]?([a-z_][a-z0-9_]*)["`]?\s*\(/gi;
const ENABLE_RLS_RE =
  /alter\s+table\s+(?:public\.)?["`]?([a-z_][a-z0-9_]*)["`]?\s+enable\s+row\s+level\s+security/gi;

function extractMatches(content: string, regex: RegExp): string[] {
  const results: string[] = [];
  const r = new RegExp(regex.source, regex.flags);
  let match: RegExpExecArray | null;
  while ((match = r.exec(content)) !== null) {
    results.push(match[1].toLowerCase());
  }
  return results;
}

describe('RLS coverage on public tables', () => {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const createdTables = new Set<string>();
  const rlsEnabledTables = new Set<string>();
  let combinedContent = '';

  for (const f of files) {
    const content = readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
    combinedContent += '\n' + content;
    for (const t of extractMatches(content, CREATE_TABLE_RE)) {
      createdTables.add(t);
    }
    for (const t of extractMatches(content, ENABLE_RLS_RE)) {
      rlsEnabledTables.add(t);
    }
  }

  // Extra: algunas migrations habilitan RLS vía DO $$ block con ARRAY dinámico
  // (ej. 20260923120000_enable_rls_on_public_tables.sql). Para esos casos,
  // detectamos DO blocks que mencionan ENABLE ROW LEVEL SECURITY y extraemos
  // cualquier string literal como potencial nombre de tabla.
  const doBlockRe = /DO\s*\$\$([\s\S]*?)\$\$/gi;
  let doMatch: RegExpExecArray | null;
  while ((doMatch = doBlockRe.exec(combinedContent)) !== null) {
    const body = doMatch[1];
    if (!/ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(body)) continue;
    const names = body.match(/'([a-z_][a-z0-9_]*)'/gi) ?? [];
    for (const n of names) {
      rlsEnabledTables.add(n.replace(/'/g, '').toLowerCase());
    }
  }

  it('every public table created in migrations has RLS enabled somewhere', () => {
    const missing = [...createdTables]
      .filter((t) => !rlsEnabledTables.has(t))
      .filter((t) => !RLS_ALLOWLIST.has(t))
      .sort();

    if (missing.length > 0) {
      const remedio = missing
        .map((t) => `  ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`)
        .join('\n');
      throw new Error(
        `\n${missing.length} tabla(s) sin RLS habilitado:\n` +
          missing.map((t) => `  - ${t}`).join('\n') +
          `\n\nRemedio: agregar a la migration correspondiente:\n${remedio}\n\n` +
          `Si la tabla es genuinamente pública, agregarla al RLS_ALLOWLIST ` +
          `con razón documentada.\n`,
      );
    }

    expect(missing).toEqual([]);
  });

  it('discovered at least the tables we know exist', () => {
    // Sanity check: si el regex se rompe, no queremos que el test pase por
    // accidente. Verificamos que al menos las tablas críticas se detectaron.
    const criticasEsperadas = [
      'centinelia_clientes',
      'centinelia_billing',
      'social_accounts',
      'content_drafts',
    ];
    for (const t of criticasEsperadas) {
      expect(createdTables.has(t), `expected ${t} in createdTables`).toBe(true);
      expect(rlsEnabledTables.has(t), `expected ${t} in rlsEnabledTables`).toBe(true);
    }
  });
});
