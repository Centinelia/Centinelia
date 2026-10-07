// Regression test: notificaciones del propio sistema Centinelia NUNCA van
// al LLM del inbox-processor, sin importar subject/body/factura-match/thread.
//
// Historia:
//   2026-10-07: AC Proyectos (camila@acproyectos.com) quemó ~455 ops en 2 días
//   porque las notifs del sistema (`notificaciones@centinelia.mx`) con subject
//   `[Factura] <subject original>` disparaban `looksLikeInvoice=true`,
//   bypaseaban el quick classifier, y el LLM las procesaba generando más notifs
//   anidadas. Loop recursivo (`[Factura] [Factura] [Factura] ...` 10+ niveles).
//
//   El guard se agregó ANTES del bloque `looksLikeInvoice` para que ninguna
//   excepción le pueda ganar. Es intencionalmente stupid-simple: match por
//   remitente, skip, no cobro. Ver [[feedback-notificaciones-self-loop]].

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(
  resolve(__dirname, '..', 'inbox-processor.ts'),
  'utf8',
);

describe('inbox-processor.ts self-notification guard (regression 2026-10-07)', () => {
  it('tiene guard contra notificaciones@centinelia.mx', () => {
    expect(SRC).toMatch(/notificaciones@centinelia\\?\.mx/);
  });

  it('guard aparece ANTES del bloque looksLikeInvoice/quickClassifyEmail', () => {
    const guardPos = SRC.indexOf('isSelfNotification');
    const looksLikeInvoicePos = SRC.indexOf('!looksLikeInvoice');
    expect(guardPos).toBeGreaterThan(-1);
    expect(looksLikeInvoicePos).toBeGreaterThan(-1);
    expect(guardPos).toBeLessThan(looksLikeInvoicePos);
  });

  it('guard retorna antes de llamar consumeAiOp', () => {
    // Verifica que el `if (isSelfNotification)` tenga un `return` antes del
    // primer `consumeAiOp` del archivo. Si alguien agrega un cobro dentro
    // del guard, este test falla.
    const guardStart = SRC.indexOf('if (isSelfNotification)');
    expect(guardStart).toBeGreaterThan(-1);
    // Tomar hasta el siguiente cierre de bloque } de top-level
    const slice = SRC.slice(guardStart, guardStart + 1500);
    expect(slice).toMatch(/\breturn;\s*}/);
    // El slice del guard NO debe tener consumeAiOp
    expect(slice).not.toMatch(/consumeAiOp\(/);
  });

  it('guard también cubre no-reply y noreply @centinelia.mx', () => {
    // Defense in depth: cualquier variante del propio dominio enviando
    // automáticos debe estar atrapada, no solo `notificaciones@`.
    expect(SRC).toMatch(/no-reply@centinelia\\?\.mx/);
    expect(SRC).toMatch(/noreply@centinelia\\?\.mx/);
  });

  it('guard inserta row en ops_inbox con status=skipped', () => {
    // Para que el correo quede visible en bandeja y la bitácora, no se
    // pierde silenciosamente. Simplemente no se cobra.
    const guardStart = SRC.indexOf('if (isSelfNotification)');
    const slice = SRC.slice(guardStart, guardStart + 1500);
    expect(slice).toMatch(/status:\s*'skipped'/);
    expect(slice).toMatch(/\.from\('ops_inbox'\)\.insert/);
  });
});
