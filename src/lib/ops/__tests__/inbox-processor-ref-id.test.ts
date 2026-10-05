// Regression test ligero: verifica que los call sites de consumeAiOp en
// inbox-processor sufijan reference_id correctamente para evitar collisions
// contra el UNIQUE constraint ops_ledger_portal_ref_kind_uniq.
//
// Historia:
//   2026-10-01: fix original (PR #103) sufijó el loop de iters con
//               `:iter${i}` para evitar que iters >=2 fueran rechazadas.
//   2026-10-05: alerta de infra detectó collision en meefi-demo entre
//               los cobros de autoMode='observador' y autoMode distinto
//               (ambos usaban existingInboxId ?? rawMessageId pelado).
//               Fix: sufijar también :observador y :processed.
//
// No es un test funcional del flujo completo del inbox processor (ese
// requiere mockear Anthropic + Supabase + tool executor). Es un guard de
// regresión que detecta si alguien remueve algún sufijo y vuelve el bug.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(
  resolve(__dirname, '..', 'inbox-processor.ts'),
  'utf8',
);

describe('inbox-processor.ts reference_id suffixes (regression 2026-10-01 + 2026-10-05)', () => {
  it('loop iters (i > 0) sufija reference_id con :iter${i}', () => {
    // Fix 2026-10-01: cada iteración intermedia del tool loop debía cobrar
    // independientemente del cobro base, pero compartía reference_id.
    const match = SRC.match(
      /if\s*\(\s*i\s*>\s*0\s*\)\s*\{[\s\S]{0,500}?reference_id:\s*(`[^`]+`|[^,\n]+)/,
    );
    expect(match).toBeTruthy();
    const refExpr = match![1].trim();
    expect(refExpr).toContain(':iter');
    expect(refExpr).toContain('${i}');
  });

  it('cobro en modo observador sufija reference_id con :observador', () => {
    // Fix 2026-10-05: el cobro de autoMode='observador' no debe colisionar
    // con el cobro de modo processed si el mismo email se reprocesa tras
    // cambiar autoMode.
    const match = SRC.match(
      /if\s*\(\s*autoMode === 'observador'\s*\)\s*\{[\s\S]{0,200}?reference_id:\s*(`[^`]+`|[^,\n]+)/,
    );
    expect(match).toBeTruthy();
    const refExpr = match![1].trim();
    expect(refExpr).toContain(':observador');
    expect(refExpr).toMatch(/existingInboxId|rawMessageId/);
  });

  it('cobro en modo processed (no-observador) sufija reference_id con :processed', () => {
    // Fix 2026-10-05: contrapartida del observador. Garantiza que ambos
    // modos son distinguibles en ai_ops_log.
    const match = SRC.match(
      /autoMode === 'observador'[\s\S]{0,100}?:\s*await consumeAiOp[\s\S]{0,300}?reference_id:\s*(`[^`]+`|[^,\n]+)/,
    );
    expect(match).toBeTruthy();
    const refExpr = match![1].trim();
    expect(refExpr).toContain(':processed');
    expect(refExpr).toMatch(/existingInboxId|rawMessageId/);
  });

  it('los 2 call sites (observador + processed) usan sufijos distintos', () => {
    // Invariante final: nunca deben ser iguales. Si alguien los iguala
    // en el futuro, el bug 2026-10-05 vuelve.
    const observadorMatch = SRC.match(
      /if\s*\(\s*autoMode === 'observador'\s*\)\s*\{[\s\S]{0,200}?reference_id:\s*(`[^`]+`)/,
    );
    const processedMatch = SRC.match(
      /autoMode === 'observador'[\s\S]{0,100}?:\s*await consumeAiOp[\s\S]{0,300}?reference_id:\s*(`[^`]+`)/,
    );
    expect(observadorMatch).toBeTruthy();
    expect(processedMatch).toBeTruthy();
    expect(observadorMatch![1]).not.toEqual(processedMatch![1]);
  });
});
