import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');

const TOOLS_WITH_SIDE_EFFECTS = [
  'registrar-incidencia',
  'registrar-cliente-nuevo',
  'registrar-pedido',
  'crear-ticket',
  'agendar-cita',
  'agendar-cita-externa',
  'crear-reporte',
  'marcar-no-llamar',
  'generar-punto-acuerdo',
  'generar-acta-sesion',
  'enviar-correo',
  'enviar-documento-oficina',
  'llamar-a',
  'qb-crear-factura',
  'qb-registrar-pago',
  'registrar-encuesta',
  'buscar-en-web',
  'consultar-agente',
  'crear-documento',
  'crear-lead',
];

// Regex: acepta ambos patterns —
//   • functional wrap: `withDedup(...)`
//   • imperative pair: `dedupLookup(...)` + `dedupStore(...)` (para handlers
//     con lógica inline compleja donde el wrap functional requeriría refactor)
const DEDUP_IMPORT_RE   = /import\s+\{[^}]*(withDedup|dedupLookup|dedupStore)[^}]*\}\s+from\s+['"]@\/lib\/tools\/dedup\/with-dedup['"]/;
const DEDUP_CALL_RE     = /\b(withDedup|dedupLookup|dedupStore)\s*\(/;
const DEDUP_PRESENT_RE  = /\b(withDedup|dedupLookup|dedupStore)\b/;

describe('tool coverage — dedup middleware applied', () => {
  for (const tool of TOOLS_WITH_SIDE_EFFECTS) {
    it(`${tool} route.ts importa y llama dedup middleware`, () => {
      const routePath = path.join(ROOT, 'src', 'app', 'api', 'voice', 'tools', tool, 'route.ts');
      const src = readFileSync(routePath, 'utf8');
      expect(src, `${tool} debería importar withDedup o dedupLookup/dedupStore`).toMatch(DEDUP_IMPORT_RE);
      expect(src, `${tool} debería llamar withDedup(...) o dedupLookup(...)/dedupStore(...)`).toMatch(DEDUP_CALL_RE);
    });
  }

  it('cualquier tool nueva con INSERT + consumeAiOp debe estar en TOOLS_WITH_SIDE_EFFECTS', () => {
    const dir = path.join(ROOT, 'src', 'app', 'api', 'voice', 'tools');
    const tools = readdirSync(dir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    const missing: string[] = [];
    for (const tool of tools) {
      const routePath = path.join(dir, tool, 'route.ts');
      if (!existsSync(routePath)) continue;
      const src = readFileSync(routePath, 'utf8');
      const hasInsert    = /\.insert\(/.test(src);
      const hasConsumeOp = /consumeAiOp/.test(src);
      const hasDedup     = DEDUP_PRESENT_RE.test(src);
      if ((hasInsert || hasConsumeOp) && !hasDedup) missing.push(tool);
    }

    expect(missing, `tools con side-effects sin dedup wrapper: ${missing.join(', ')}`).toEqual([]);
  });
});
