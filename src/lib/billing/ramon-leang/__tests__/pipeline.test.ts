/**
 * Tests del pipeline Ramón Leang: distribución + config fiscal + edge cases.
 */
import { describe, it, expect } from 'vitest';
import { buildInvoicesFromWeek, buildInvoicesFromBlocks } from '../pipeline';
import type { ParsedWeekBlock } from '../../parsers/ramon-leang-weekly';
import type { RamonLeangConfig } from '../types';

const CONFIG: RamonLeangConfig = {
  rfcEmisor:     'LEGR730729PU9',
  razonSocial:   'RAMON OMAR LEANG GUTIERREZ',
  regimenFiscal: '612',
  codigoPostal:  '66470',
  serie:         'RL',
  usoCFDI:       'G01',
  formaPago:     '01',  // efectivo (venta al público general en Ramón Leang)
  sku:           'VT',
  descripcion:   'Venta de Tortilla',
  ivaTasa:       0,
  claveSAT:      '50161509',
  unidadSAT:     'KGM',
};

const baseBlock = (o: Partial<ParsedWeekBlock> = {}): ParsedWeekBlock => ({
  weekStart:        '2026-09-04',
  totalDepositos:   87046.5,
  cfdiBase:         14507,
  ajusteFecha:      '2026-09-08',
  ajusteMonto:      14511.5,
  diasHabiles:      [1, 2, 3, 4, 7],
  diasHabilesRaw:   '1, 2, 3, 4, 7',
  detalleDepositos: [18553.5, 6844, 13849, 18212.5, 11961.5, 17626],
  observaciones:    null,
  headerRowIndex:   0,
  colIndex:         3,
  warnings:         [],
  ...o,
});

describe('buildInvoicesFromWeek — happy path', () => {
  const b = baseBlock();
  const r = buildInvoicesFromWeek(b, CONFIG);

  it('emite 5 CFDIs base + 1 ajuste = 6 CFDIs totales', () => {
    expect(r.error).toBeNull();
    expect(r.invoices).toHaveLength(6);
  });

  it('cada CFDI base tiene fecha del día correcto', () => {
    expect(r.invoices[0].date).toBe('2026-09-01');
    expect(r.invoices[1].date).toBe('2026-09-02');
    expect(r.invoices[2].date).toBe('2026-09-03');
    expect(r.invoices[3].date).toBe('2026-09-04');
    expect(r.invoices[4].date).toBe('2026-09-07');
  });

  it('cada CFDI base tiene monto = cfdiBase', () => {
    for (let i = 0; i < 5; i++) {
      expect(r.invoices[i].lines[0].unitPrice).toBe(14507);
      expect(r.invoices[i].lines[0].qty).toBe(1);
    }
  });

  it('CFDI ajuste tiene fecha y monto correctos', () => {
    expect(r.invoices[5].date).toBe('2026-09-08');
    expect(r.invoices[5].lines[0].unitPrice).toBe(14511.5);
  });

  it('todos los CFDIs a Público General XAXX010101000', () => {
    for (const inv of r.invoices) {
      expect(inv.clientRFC).toBe('XAXX010101000');
    }
  });

  it('todos con SKU VT + descripción Venta de Tortilla', () => {
    for (const inv of r.invoices) {
      expect(inv.lines[0].sku).toBe('VT');
      expect(inv.lines[0].description).toBe('Venta de Tortilla');
    }
  });

  it('todos con serie RL, uso G01, forma pago efectivo, PUE', () => {
    for (const inv of r.invoices) {
      expect(inv.serie).toBe('RL');
      expect(inv.usoCFDI).toBe('G01');
      expect(inv.paymentMethod).toBe('efectivo');
      expect(inv.metodoPago).toBe('PUE');
    }
  });

  it('paymentMethod se deriva del formaPago SAT del config', () => {
    // Ya cubierto por el test previo (formaPago 01 → efectivo). Este verifica
    // que el pipeline SÍ mira el config y no está hardcoded.
    const configTransfer = { ...CONFIG, formaPago: '03' };
    const r2 = buildInvoicesFromWeek(baseBlock(), configTransfer);
    for (const inv of r2.invoices) {
      expect(inv.paymentMethod).toBe('transferencia');
    }
  });

  it('suma de todos los CFDIs = total depósitos', () => {
    const suma = r.invoices.reduce((s, i) => s + i.lines[0].unitPrice, 0);
    expect(suma).toBe(87046.5);
  });

  it('meta identifica cuál es el ajuste', () => {
    expect(r.meta[0].isAjuste).toBe(false);
    expect(r.meta[5].isAjuste).toBe(true);
  });

  it('sin observaciones: usa notes default', () => {
    for (const inv of r.invoices) {
      expect(inv.notes).toBe('Ramón Leang - Venta al público general');
    }
  });

  it('con observaciones: se copian verbatim a notes de todos los CFDIs de la semana', () => {
    const b = baseBlock({ observaciones: 'Semana con feriado 16-sep, cliente confirma pago en efectivo' });
    const rc = buildInvoicesFromWeek(b, CONFIG);
    for (const inv of rc.invoices) {
      expect(inv.notes).toBe('Semana con feriado 16-sep, cliente confirma pago en efectivo');
    }
  });

  it('observaciones vacías (whitespace only): cae al default', () => {
    const b = baseBlock({ observaciones: '   ' });
    const rc = buildInvoicesFromWeek(b, CONFIG);
    for (const inv of rc.invoices) {
      expect(inv.notes).toBe('Ramón Leang - Venta al público general');
    }
  });
});

describe('buildInvoicesFromWeek — edge cases', () => {
  it('sin ajuste (división exacta): solo N CFDIs base', () => {
    const b = baseBlock({ ajusteFecha: null, ajusteMonto: null });
    const r = buildInvoicesFromWeek(b, CONFIG);
    expect(r.invoices).toHaveLength(5);
    expect(r.meta.every(m => !m.isAjuste)).toBe(true);
  });

  it('semana cruza fin de mes: días 1-3 caen en mes siguiente', () => {
    // Martes 2026-09-29: semana martes-lunes = 29 sep, 30 sep, 1 oct, 2 oct,
    // 3 oct, 4 oct, 5 oct. Días hábiles [29, 30, 1, 2, 5] deberían mapear a
    // 29/09, 30/09, 01/10, 02/10, 05/10 (NO 01/09, 02/09, 05/09).
    const b = baseBlock({
      weekStart:   '2026-09-29',
      diasHabiles: [29, 30, 1, 2, 5],
      ajusteFecha: '2026-10-03',
    });
    const r = buildInvoicesFromWeek(b, CONFIG);
    expect(r.invoices[0].date).toBe('2026-09-29');
    expect(r.invoices[1].date).toBe('2026-09-30');
    expect(r.invoices[2].date).toBe('2026-10-01');
    expect(r.invoices[3].date).toBe('2026-10-02');
    expect(r.invoices[4].date).toBe('2026-10-05');
    expect(r.invoices[5].date).toBe('2026-10-03');
  });

  it('semana cruza fin de año: días 30, 31, 1, 2 mapean a dic 30-31 + ene 1-2', () => {
    const b = baseBlock({
      weekStart:   '2026-12-29',
      diasHabiles: [30, 31, 1, 2],
      ajusteFecha: '2027-01-04',
    });
    const r = buildInvoicesFromWeek(b, CONFIG);
    expect(r.invoices[0].date).toBe('2026-12-30');
    expect(r.invoices[1].date).toBe('2026-12-31');
    expect(r.invoices[2].date).toBe('2027-01-01');
    expect(r.invoices[3].date).toBe('2027-01-02');
    expect(r.invoices[4].date).toBe('2027-01-04');
  });

  it('sin cfdiBase: error explicito, sin invoices', () => {
    const b = baseBlock({ cfdiBase: null });
    const r = buildInvoicesFromWeek(b, CONFIG);
    expect(r.error).toMatch(/cfdiBase/);
    expect(r.invoices).toEqual([]);
  });

  it('sin días hábiles: error explicito', () => {
    const b = baseBlock({ diasHabiles: [] });
    const r = buildInvoicesFromWeek(b, CONFIG);
    expect(r.error).toMatch(/días hábiles/);
    expect(r.invoices).toEqual([]);
  });

  it('IVA tasa se propaga desde config', () => {
    const configConIva = { ...CONFIG, ivaTasa: 0.16 };
    const r = buildInvoicesFromWeek(baseBlock(), configConIva);
    for (const inv of r.invoices) {
      expect(inv.lines[0].ivaTasa).toBe(0.16);
    }
  });
});

describe('buildInvoicesFromBlocks — acumula errores + invoices', () => {
  const b1 = baseBlock({ weekStart: '2026-09-04' });
  const b2 = baseBlock({ weekStart: '2026-09-11', diasHabiles: [8, 9, 10] });
  const b3 = baseBlock({ weekStart: '2026-09-18', cfdiBase: null });

  const r = buildInvoicesFromBlocks([b1, b2, b3], CONFIG);

  it('acumula invoices de bloques válidos', () => {
    expect(r.invoices).toHaveLength(6 + 4);
  });

  it('reporta errores de bloques inválidos sin cortar el batch', () => {
    expect(r.errors.length).toBeGreaterThanOrEqual(1);
    expect(r.errors[0].weekStart).toBe('2026-09-18');
  });
});
