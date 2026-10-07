// Regression test: Nami (meerkat_role_id='nami') default-skip de correos que
// no piden explícitamente acción del Excel de inventario.
//
// Historia:
//   2026-10-07: AC Proyectos quemó pool de 455 ops en 48h procesando correos
//   que no eran su responsabilidad (facturas Home Depot auto, respuestas
//   automáticas de Trane, backlogs auto, notifs del propio sistema).
//   User textual: "nami solo debería leer y procesar correos que vayan
//   dirigidos para que ella ejecute en el excel".

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(
  resolve(__dirname, '..', 'inbox-processor.ts'),
  'utf8',
);

describe('inbox-processor.ts Nami default-skip (regression 2026-10-07)', () => {
  it('define isNamiExcelTask + NAMI_EXCEL_KEYWORDS', () => {
    expect(SRC).toMatch(/function isNamiExcelTask/);
    expect(SRC).toMatch(/NAMI_EXCEL_KEYWORDS/);
  });

  it('guard aparece después de isSelfNotification y antes del quick classifier call', () => {
    const selfNotif = SRC.indexOf('isSelfNotification');
    const namiGuard = SRC.indexOf("roleId === 'nami'");
    // quickClassifyEmail aparece varias veces; el que importa es la invocación, no la import
    const quickClassifierCall = SRC.indexOf('const quick = quickClassifyEmail(');
    expect(selfNotif).toBeGreaterThan(-1);
    expect(namiGuard).toBeGreaterThan(selfNotif);
    expect(quickClassifierCall).toBeGreaterThan(namiGuard);
  });

  it('guard verifica meerkat_role_id === "nami" via DB query', () => {
    const namiGuardIdx = SRC.indexOf("roleId === 'nami'");
    // Mirar antes y después del match
    const slice = SRC.slice(Math.max(0, namiGuardIdx - 800), namiGuardIdx + 100);
    expect(slice).toMatch(/\.from\('voice_agents'\)/);
    expect(slice).toMatch(/\.select\('features'\)/);
    expect(slice).toContain('meerkat_role_id');
  });

  it('guard respeta excepciones: existingInboxId y fromSpamFolder', () => {
    const namiGuardIdx = SRC.indexOf("roleId === 'nami'");
    const slice = SRC.slice(Math.max(0, namiGuardIdx - 1000), namiGuardIdx);
    expect(slice).toMatch(/!existingInboxId.*&&.*!fromSpamFolder/);
  });

  it('guard inserta row status=skipped SIN llamar consumeAiOp', () => {
    const namiGuardIdx = SRC.indexOf("roleId === 'nami'");
    const slice = SRC.slice(namiGuardIdx, namiGuardIdx + 1500);
    expect(slice).toMatch(/status:\s*'skipped'/);
    expect(slice).not.toMatch(/consumeAiOp\(/);
    expect(slice).toMatch(/\breturn;/);
  });

  it('NAMI_EXCEL_KEYWORDS cubre los dominios clave del Excel inventario', () => {
    const match = SRC.match(/const NAMI_EXCEL_KEYWORDS = \[([\s\S]*?)\];/);
    expect(match).toBeTruthy();
    const kwBlock = match![1].toLowerCase();
    for (const kw of ['oc', 'factura', 'backlog', 'serie', 'modelo', 'bodega', 'trane', 'cfdi', 'registr', 'procesar', 'equipo']) {
      expect(kwBlock, `keyword "${kw}" debe estar en NAMI_EXCEL_KEYWORDS`).toContain(kw);
    }
  });

  it('isNamiExcelTask firma y comportamiento: PDF/XML + palabra clave en nombre → true', () => {
    // Verifica que la función existe y tiene la firma esperada
    expect(SRC).toMatch(/function isNamiExcelTask\(subject: string, body: string, attachments:/);
    // Verifica que el attachment check busca extensiones + keywords
    const fnStart = SRC.indexOf('function isNamiExcelTask');
    const fnSlice = SRC.slice(fnStart, fnStart + 1200);
    expect(fnSlice).toMatch(/\\\.\(pdf\|xml\|xlsx\?\|txt\)\$/);
    expect(fnSlice).toMatch(/factura.*oc.*backlog|oc.*factura.*backlog/i);
  });
});
