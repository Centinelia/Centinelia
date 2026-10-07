// Regression: notifs del propio sistema no deben acumular prefijos `[Factura]`
// recursivamente aunque el guard isSelfNotification se rompiera. Defense in depth.
// Caso AC Proyectos 2026-10-07: subjects observados hasta
// `[Factura] [Factura] [Factura] [Factura] [Factura] [Factura] [Factura] [Factura] [Factura] [Factura] ...`

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(
  resolve(__dirname, '..', 'inbox-processor.ts'),
  'utf8',
);

describe('inbox-processor.ts stripOwnPrefixes (regression 2026-10-07)', () => {
  it('exporta/define stripOwnPrefixes y CATEGORY_PREFIX_RX', () => {
    expect(SRC).toMatch(/function stripOwnPrefixes/);
    expect(SRC).toMatch(/CATEGORY_PREFIX_RX/);
  });

  it('CATEGORY_PREFIX_RX cubre todos los labels + Email + Aviso + Alerta', () => {
    const match = SRC.match(/const CATEGORY_PREFIX_RX = ([^;]+);/);
    expect(match).toBeTruthy();
    const rxStr = match![1];
    for (const label of ['Proveedor', 'Cliente', 'Urgente', 'Factura', 'Notificación', 'Spam', 'Otro', 'Email', 'Aviso', 'Alerta']) {
      expect(rxStr).toContain(label);
    }
  });

  it('ambas construcciones de subject usan stripOwnPrefixes', () => {
    const subjectLines = SRC.match(/subject:\s*`\[\$\{CATEGORY_LABELS[^`]*`/g);
    expect(subjectLines).toBeTruthy();
    expect(subjectLines!.length).toBeGreaterThanOrEqual(2);
    for (const line of subjectLines!) {
      expect(line).toContain('stripOwnPrefixes(');
    }
  });

  it('función stripOwnPrefixes aplicada: pattern funcional', () => {
    // Compilamos el regex del source y verificamos que efectivamente strippea
    // niveles recursivos. Test funcional sin importar runtime.
    const match = SRC.match(/const CATEGORY_PREFIX_RX = (\/[^;]+\/[a-z]*);/);
    expect(match).toBeTruthy();
    const rx = eval(match![1]);  // seguro: construido desde nuestra propia source
    const cases: Array<[string, string]> = [
      ['[Factura] [Factura] [Factura] X', 'X'],
      ['[Factura] Archivos PDF', 'Archivos PDF'],
      ['[Proveedor] RE: ENTREGA', 'RE: ENTREGA'],
      ['[Email] [Factura] [Aviso] mezclado', 'mezclado'],
      ['Sin prefijo', 'Sin prefijo'],
      ['  [Factura]  con espacios', 'con espacios'],
    ];
    for (const [input, expected] of cases) {
      const stripped = input.replace(rx, '').trim();
      expect(stripped).toBe(expected);
    }
  });
});
