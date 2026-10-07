// Regression test: cuando el inbox-processor detecta un correo que
// inequívocamente pide una tool específica, DEBE forzar tool_choice en iter 0.
//
// Historia: 2026-10-07 TEST-99999 — Nami recibió correo "REGISTRAR OC
// TEST-99999" con PDF adjunto, procesó el correo 4 iters LLM, pero NO invocó
// inv_procesar_oc_qb (tools_invoked: []). Prefirió escalar a humano. Fix:
// detectForcedTool() + tool_choice en iter 0 elimina la escapatoria.
//
// Test: verifica que la función existe + lógica de detección con fixtures.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(
  resolve(__dirname, '..', 'inbox-processor.ts'),
  'utf8',
);

describe('inbox-processor.ts detectForcedTool (regression 2026-10-07)', () => {
  it('define función detectForcedTool', () => {
    expect(SRC).toMatch(/function detectForcedTool\(/);
  });

  it('cubre las 3 reglas: OC, factura trane, backlog', () => {
    const fnStart = SRC.indexOf('function detectForcedTool');
    const fnBody = SRC.slice(fnStart, fnStart + 3000);
    expect(fnBody).toContain('inv_procesar_oc_qb');
    expect(fnBody).toContain('inv_procesar_factura_trane');
    expect(fnBody).toContain('inv_importar_backlog');
  });

  it('verifica que la tool esté disponible antes de forzar', () => {
    const fnStart = SRC.indexOf('function detectForcedTool');
    const fnBody = SRC.slice(fnStart, fnStart + 3000);
    expect(fnBody).toContain('availableToolNames.has(');
  });

  it('inbox-processor llama detectForcedTool en iter 0', () => {
    expect(SRC).toMatch(/i === 0[\s\S]{0,120}detectForcedTool\(/);
  });

  it('inbox-processor pasa tool_choice si forcedToolName no es null', () => {
    expect(SRC).toMatch(/forcedToolName\s*\?\s*\{\s*tool_choice:\s*\{\s*type:\s*'tool'[\s\S]{0,100}name:\s*forcedToolName/);
  });

  it('regla OC es flexible: matchea "OC 6203", "OC TEST-99999", "OC-6203"', () => {
    // Extraer regex y validar manualmente
    const match = SRC.match(/\/\\boc\\s\*\[-#\]\?\\s\*\[a-z0-9-\]\+\\d\/i/);
    expect(match).toBeTruthy();
    const rx = /\boc\s*[-#]?\s*[a-z0-9-]+\d/i;
    expect(rx.test('REGISTRAR OC 6203')).toBe(true);
    expect(rx.test('REGISTRAR OC TEST-99999 — PRUEBA')).toBe(true);
    expect(rx.test('OC-6203 pending')).toBe(true);
    expect(rx.test('Hola, cómo estás')).toBe(false);
  });

  it('regla attachment-type cubre PDF, XML, XLSX con MIME y filename', () => {
    const fnStart = SRC.indexOf('function detectForcedTool');
    const fnBody = SRC.slice(fnStart, fnStart + 3000);
    expect(fnBody).toMatch(/\\\.pdf|xml|xlsx|application/);
  });
});
