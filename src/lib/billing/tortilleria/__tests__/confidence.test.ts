/**
 * Tests de checkConfidence — decide auto-approve vs pending.
 * 5 checks: RFC del mapping, total cuadra, precios > 0, SKUs del catálogo,
 * sin warnings del parser.
 */
import { describe, it, expect } from 'vitest';
import { checkConfidence } from '../confidence';
import type { BillingInvoice } from '../../adapter';
import type { ParsedBlock } from '../../parsers/tortilleria-batch';
import type { TortilleriaMapping } from '../types';

// --- Fixtures ---

const baseMapping: TortilleriaMapping = {
  version: '1.0',
  updatedAt: '2026-09-09',
  creditCodes: [],
  consolidationRules: [],
  clients: [],
  products: [
    { columnaPattern: 'ESTRELLA 1/2', sku: '021', claveSat: '50161509', unidadSat: 'H87' },
    { columnaPattern: 'RANCHO 1/2',   sku: '022', claveSat: '50161509', unidadSat: 'H87' },
  ],
};

const baseBlock = (overrides: Partial<ParsedBlock> = {}): ParsedBlock => ({
  codigoCliente:         '045',
  tituloBloque:          'CARDENAS ALIMENTOS (CTE. 045)',
  headerRowIndex:        0,
  productos:             [],
  remisiones:            [],
  totalGeneralExcel:     8972.60,
  totalGeneralCalculado: 8972.60,
  warnings:              [],
  ...overrides,
});

const baseInvoice = (overrides: Partial<BillingInvoice> = {}): BillingInvoice => ({
  clientRFC:     'CAL960522981',
  date:          '2026-09-05',
  lines:         [
    { sku: '021', qty: 326, unitPrice: 22.1, ivaTasa: 0 },
    { sku: '022', qty:  80, unitPrice: 22.1, ivaTasa: 0 },
  ],
  paymentMethod: 'transferencia',
  usoCFDI:       'G01',
  serie:         'FTEN',
  metodoPago:    'PUE',
  ...overrides,
});

// --- Tests ---

describe('checkConfidence — happy path', () => {
  it('auto-aprueba cuando todos los checks pasan', () => {
    const r = checkConfidence({
      invoice:      baseInvoice(),
      sourceBlocks: [baseBlock()],
      mapping:      baseMapping,
      warnings:     [],
    });
    expect(r.autoApprove).toBe(true);
    expect(r.reasons).toEqual([]);
  });
});

describe('checkConfidence — check 1: RFC del catálogo', () => {
  it('falla si clientRFC parece código (no RFC shape)', () => {
    const r = checkConfidence({
      invoice:      baseInvoice({ clientRFC: 'DCA' }),
      sourceBlocks: [baseBlock()],
      mapping:      baseMapping,
      warnings:     [],
    });
    expect(r.autoApprove).toBe(false);
    expect(r.reasons[0]).toMatch(/no tiene RFC en tu catálogo/i);
    expect(r.reasons[0]).toMatch(/DCA/);
  });

  it('acepta RFC persona moral válido (12 chars)', () => {
    const r = checkConfidence({
      invoice:      baseInvoice({ clientRFC: 'CAL051103F36' }),
      sourceBlocks: [baseBlock()],
      mapping:      baseMapping,
      warnings:     [],
    });
    expect(r.autoApprove).toBe(true);
  });

  it('acepta RFC persona física válido (13 chars)', () => {
    const r = checkConfidence({
      invoice:      baseInvoice({ clientRFC: 'MATA850818NX7' }),
      sourceBlocks: [baseBlock()],
      mapping:      baseMapping,
      warnings:     [],
    });
    expect(r.autoApprove).toBe(true);
  });

  it('acepta RFC genérico SAT XAXX010101000', () => {
    const r = checkConfidence({
      invoice:      baseInvoice({ clientRFC: 'XAXX010101000' }),
      sourceBlocks: [baseBlock()],
      mapping:      baseMapping,
      warnings:     [],
    });
    expect(r.autoApprove).toBe(true);
  });

  it('rechaza RFC muy corto', () => {
    const r = checkConfidence({
      invoice:      baseInvoice({ clientRFC: 'AB123' }),
      sourceBlocks: [baseBlock()],
      mapping:      baseMapping,
      warnings:     [],
    });
    expect(r.autoApprove).toBe(false);
  });
});

describe('checkConfidence — check 2: total cuadra', () => {
  it('falla si total calculado difiere > $1 del declarado', () => {
    const invoice = baseInvoice({
      lines: [{ sku: '021', qty: 100, unitPrice: 22.1, ivaTasa: 0 }], // total = 2210
    });
    const block = baseBlock({ totalGeneralExcel: 3000 }); // declarado 3000
    const r = checkConfidence({
      invoice,
      sourceBlocks: [block],
      mapping:      baseMapping,
      warnings:     [],
    });
    expect(r.autoApprove).toBe(false);
    expect(r.reasons.some(x => /no cuadra/i.test(x))).toBe(true);
  });

  it('falla si el bloque no trae TOTAL GENERAL declarado', () => {
    const block = baseBlock({ totalGeneralExcel: null });
    const r = checkConfidence({
      invoice:      baseInvoice(),
      sourceBlocks: [block],
      mapping:      baseMapping,
      warnings:     [],
    });
    expect(r.autoApprove).toBe(false);
    expect(r.reasons.some(x => /no trae TOTAL GENERAL/i.test(x))).toBe(true);
  });

  it('tolera diff <= $1 (redondeos)', () => {
    const block = baseBlock({ totalGeneralExcel: 8973 }); // calculado 8972.60, diff 0.40
    const r = checkConfidence({
      invoice:      baseInvoice(),
      sourceBlocks: [block],
      mapping:      baseMapping,
      warnings:     [],
    });
    expect(r.autoApprove).toBe(true);
  });

  it('valida consolidados: suma de totales de bloques fuente', () => {
    // Consolidado DCA de 2 bloques: 100 + 150 = 250 declarado
    const b1 = baseBlock({ totalGeneralExcel: 100 });
    const b2 = baseBlock({ totalGeneralExcel: 150 });
    const invoice = baseInvoice({
      clientRFC: 'ABC010101ABC', // RFC válido
      lines: [{ sku: '021', qty: 10, unitPrice: 25, ivaTasa: 0 }], // total 250
    });
    const r = checkConfidence({
      invoice,
      sourceBlocks: [b1, b2],
      mapping:      baseMapping,
      warnings:     [],
    });
    expect(r.autoApprove).toBe(true);
  });
});

describe('checkConfidence — check 3: precios > 0', () => {
  it('falla si alguna línea tiene precio 0', () => {
    const invoice = baseInvoice({
      lines: [
        { sku: '021', qty: 10, unitPrice: 22.1, ivaTasa: 0 },
        { sku: '022', qty:  5, unitPrice: 0,    ivaTasa: 0 },
      ],
    });
    const r = checkConfidence({
      invoice,
      sourceBlocks: [baseBlock({ totalGeneralExcel: 221 })],
      mapping:      baseMapping,
      warnings:     [],
    });
    expect(r.autoApprove).toBe(false);
    expect(r.reasons.some(x => /sin precio/i.test(x))).toBe(true);
  });

  it('reporta nombre de descripción en el reason', () => {
    const invoice = baseInvoice({
      lines: [{ sku: '099', qty: 1, unitPrice: 0, description: 'GELITA ESPECIAL', ivaTasa: 0 }],
    });
    const r = checkConfidence({
      invoice,
      sourceBlocks: [baseBlock({ totalGeneralExcel: 0 })],
      mapping:      baseMapping,
      warnings:     [],
    });
    expect(r.reasons.some(x => /GELITA ESPECIAL/.test(x))).toBe(true);
  });
});

describe('checkConfidence — check 4: SKUs del catálogo', () => {
  it('falla si algún SKU no está en mapping.products', () => {
    const invoice = baseInvoice({
      lines: [
        { sku: '021',      qty: 100, unitPrice: 22.1, ivaTasa: 0 },
        { sku: 'FANTASMA', qty:  50, unitPrice: 30,   ivaTasa: 0, description: 'PROD RARO' },
      ],
    });
    const r = checkConfidence({
      invoice,
      sourceBlocks: [baseBlock({ totalGeneralExcel: 3710 })],
      mapping:      baseMapping,
      warnings:     [],
    });
    expect(r.autoApprove).toBe(false);
    expect(r.reasons.some(x => /no están en tu catálogo/i.test(x) && /PROD RARO/.test(x))).toBe(true);
  });

  it('auto-aprueba si todos los SKUs vienen del catálogo', () => {
    const r = checkConfidence({
      invoice:      baseInvoice(),
      sourceBlocks: [baseBlock()],
      mapping:      baseMapping,
      warnings:     [],
    });
    expect(r.autoApprove).toBe(true);
  });
});

describe('checkConfidence — check 5: warnings del parser', () => {
  it('falla si hay 1 warning del parser', () => {
    const r = checkConfidence({
      invoice:      baseInvoice(),
      sourceBlocks: [baseBlock()],
      mapping:      baseMapping,
      warnings:     ['Columna 5 sin nombre de producto.'],
    });
    expect(r.autoApprove).toBe(false);
    expect(r.reasons.some(x => /Nala reportó/i.test(x))).toBe(true);
  });

  it('formato con bullets si hay múltiples warnings', () => {
    const r = checkConfidence({
      invoice:      baseInvoice(),
      sourceBlocks: [baseBlock()],
      mapping:      baseMapping,
      warnings:     ['warning A', 'warning B', 'warning C'],
    });
    expect(r.autoApprove).toBe(false);
    const reason = r.reasons.find(x => /Nala reportó 3/.test(x));
    expect(reason).toBeDefined();
    expect(reason).toMatch(/• warning A/);
    expect(reason).toMatch(/• warning B/);
    expect(reason).toMatch(/• warning C/);
  });

  it('NO trunca warnings largos (no ellipsis)', () => {
    const longWarning = 'x'.repeat(500);
    const r = checkConfidence({
      invoice:      baseInvoice(),
      sourceBlocks: [baseBlock()],
      mapping:      baseMapping,
      warnings:     [longWarning],
    });
    expect(r.reasons[0]).toContain(longWarning);
  });
});

describe('checkConfidence — múltiples fallos acumulan reasons', () => {
  it('junta todos los reasons en orden', () => {
    const invoice = baseInvoice({
      clientRFC: 'DCA', // check 1 falla
      lines: [{ sku: 'FANTASMA', qty: 10, unitPrice: 0, ivaTasa: 0 }], // check 3 y 4 fallan
    });
    const block = baseBlock({ totalGeneralExcel: null }); // check 2 falla
    const r = checkConfidence({
      invoice,
      sourceBlocks: [block],
      mapping:      baseMapping,
      warnings:     ['warn'],
    });
    expect(r.autoApprove).toBe(false);
    expect(r.reasons.length).toBeGreaterThanOrEqual(4);
  });
});
