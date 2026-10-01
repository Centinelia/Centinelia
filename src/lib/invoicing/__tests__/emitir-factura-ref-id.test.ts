// Regression test ligero: verifica que invoice_email_sent sigue usando
// `${result.uuid}:email` como reference_id en emitir-factura.ts.
//
// Antes del fix 2026-10-01, invoice_stamped e invoice_email_sent usaban
// AMBOS `result.uuid` como reference_id. El UNIQUE constraint
// ops_ledger_portal_ref_kind_uniq rechazaba el cobro del email → undercharge
// en la operación de facturación (money-moving, Tortillería).
//
// No es un test funcional del flujo (ese requiere mockear PAC + storage +
// supabase). Es un guard de regresión que detecta si alguien remueve el
// sufijo y vuelve el bug.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(
  resolve(__dirname, '..', 'emitir-factura.ts'),
  'utf8',
);

describe('emitir-factura.ts reference_id (regression 2026-10-01)', () => {
  it('invoice_stamped (base) usa result.uuid como reference_id', () => {
    const match = SRC.match(
      /source:\s*['"]invoice_stamped['"][\s\S]{0,200}?reference_id:\s*([^,\n]+)/,
    );
    expect(match).toBeTruthy();
    const refExpr = match![1].trim();
    expect(refExpr).toBe('result.uuid');
  });

  it('invoice_email_sent usa `${result.uuid}:email` para evitar colisión UNIQUE', () => {
    const match = SRC.match(
      /source:\s*['"]invoice_email_sent['"][\s\S]{0,300}?reference_id:\s*([^,\n]+)/,
    );
    expect(match).toBeTruthy();
    const refExpr = match![1].trim();
    // Debe contener :email para distinguirse de invoice_stamped
    expect(refExpr).toContain(':email');
    // Debe seguir referenciando el uuid de la factura
    expect(refExpr).toContain('result.uuid');
  });

  it('ambos reference_id son distintos entre sí', () => {
    const stampedMatch = SRC.match(
      /source:\s*['"]invoice_stamped['"][\s\S]{0,200}?reference_id:\s*([^,\n]+)/,
    );
    const emailMatch = SRC.match(
      /source:\s*['"]invoice_email_sent['"][\s\S]{0,300}?reference_id:\s*([^,\n]+)/,
    );
    const stamped = stampedMatch![1].trim();
    const email   = emailMatch![1].trim();
    expect(stamped).not.toBe(email);
  });
});
