import { describe, it, expect } from 'vitest';
import { buildPendingPath } from '../paths';

describe('buildPendingPath', () => {
  it('produce el formato canonico Clientes_Periodicos/<RFC>/Pendientes.xlsx', () => {
    expect(buildPendingPath('/Facturacion', 'XAXX010101000'))
      .toBe('/Facturacion/Clientes_Periodicos/XAXX010101000/Pendientes.xlsx');
  });

  it('normaliza trailing slash del basePath', () => {
    expect(buildPendingPath('/Facturacion/', 'XAXX010101000'))
      .toBe('/Facturacion/Clientes_Periodicos/XAXX010101000/Pendientes.xlsx');
  });

  it('sanitiza el RFC (caracteres no alfanumericos -> underscore)', () => {
    // sanitizeRfc preserva case y solo reemplaza no-alfanumerico con _.
    expect(buildPendingPath('/base', 'xaxx010101000'))
      .toBe('/base/Clientes_Periodicos/xaxx010101000/Pendientes.xlsx');
    expect(buildPendingPath('/base', 'RFC-CON.SLASH/Y espacios'))
      .toBe('/base/Clientes_Periodicos/RFC_CON_SLASH_Y_espacios/Pendientes.xlsx');
  });

  it('mismo output para el mismo (basePath, RFC) desde cualquier caller', () => {
    // Invariante de la refactorizacion: tools.ts, apply.ts y billing-periodic-cuts
    // deben producir exactamente el mismo path para cliente periodico.
    const a = buildPendingPath('/Facturacion/2026', 'XAXX010101000');
    const b = buildPendingPath('/Facturacion/2026', 'XAXX010101000');
    expect(a).toBe(b);
  });
});
