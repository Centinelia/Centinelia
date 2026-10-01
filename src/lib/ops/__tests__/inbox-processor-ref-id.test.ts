// Regression test ligero: verifica que el loop de iters en inbox-processor
// sigue sufijando reference_id con `:iter${i}`.
//
// Antes del fix 2026-10-01, cada iteración del tool loop llamaba
// consumeAiOp con el mismo (source=inbox_processor, reference_id=
// existingInboxId ?? rawMessageId). El UNIQUE constraint
// ops_ledger_portal_ref_kind_uniq rechazaba todas las iters >=2 →
// undercharge activo en producción Tortillería.
//
// No es un test funcional del flujo completo del inbox processor (ese
// requiere mockear Anthropic + Supabase + tool executor). Es un guard de
// regresión que detecta si alguien remueve el sufijo y vuelve el bug.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(
  resolve(__dirname, '..', 'inbox-processor.ts'),
  'utf8',
);

describe('inbox-processor.ts reference_id loop (regression 2026-10-01)', () => {
  it('cobro base dentro del loop (i > 0) sufija reference_id con :iter${i}', () => {
    // Buscar el bloque donde se cobra iteración intermedia (línea 2098 original)
    const match = SRC.match(
      /if\s*\(\s*i\s*>\s*0\s*\)\s*\{[\s\S]{0,500}?reference_id:\s*(`[^`]+`|[^,\n]+)/,
    );
    expect(match).toBeTruthy();
    const refExpr = match![1].trim();
    expect(refExpr).toContain(':iter');
    expect(refExpr).toContain('${i}');
  });

  it('cobro base fuera del loop (línea ~1601) usa reference_id SIN sufijo iter', () => {
    // Esta es la línea del cobro inicial — es la 1ª iter en términos de billing.
    // Debe seguir referenciando el inbox id SIN sufijo (es la "primera y única"
    // antes del loop interno).
    const match = SRC.match(
      /autoMode === 'observador'[\s\S]{0,100}?:\s*await consumeAiOp[\s\S]{0,300}?reference_id:\s*([^,\n]+)/,
    );
    expect(match).toBeTruthy();
    const refExpr = match![1].trim();
    expect(refExpr).not.toContain(':iter');
    // Debe ser el existingInboxId o rawMessageId pelado
    expect(refExpr).toMatch(/existingInboxId|rawMessageId/);
  });
});
