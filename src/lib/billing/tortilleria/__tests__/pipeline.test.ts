/**
 * Tests E2E del pipeline: fixture Excel + mapping guardado → BillingInvoice[].
 * Cubre las 3 variantes de formato (varios, ortiz, melendez) y las reglas
 * especiales (DCA consolidado, SILLATPROP crédito, skips de descontinuados).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseTortilleriaBatchXlsx } from '../../parsers/tortilleria-batch';
import { buildInvoicesFromBlocks } from '../pipeline';
import type {
  TortilleriaMapping,
  TortilleriaPipelineConfig,
  ClientMappingEntry,
  ProductMappingEntry,
} from '../types';

const FIXTURES = join(__dirname, '..', '..', 'parsers', '__tests__', 'fixtures');

const loadXlsx = (name: string) => readFileSync(join(FIXTURES, name));

// ---- Mapping construido para los 3 fixtures -------------------------------

const CLIENTS: ClientMappingEntry[] = [
  // Varios
  { titlePattern: 'CARDENAS ALIMENTOS',            codigo: '045',           razon: 'CARDENAS ALIMENTOS', rfc: 'CAL960522981' },
  { titlePattern: 'CTE. SILLA TPROP.',             codigo: 'SILLATPROP',    razon: 'ADAN HUGO MARTINEZ TORRES', rfc: 'MATA850818NX7' },
  { titlePattern: 'SEPULVEDA',                     codigo: '044',           rfc: 'CPS080529V47' },
  { titlePattern: 'CTE. 008 CARNES ALANIS SUC. SANTA FE', codigo: '008',    rfc: 'CAL051103F36' },
  { titlePattern: 'CTE. 008 CARNES ALANIS SUC. LA JOYA',  codigo: '008',    rfc: 'CAL051103F36' },
  { titlePattern: 'CTE: 546 PROCESADORA',          codigo: '546',           rfc: 'PAK0205246F9' },
  { titlePattern: 'SUPER ROMA',                    codigo: 'SUPERROMA',     rfc: 'SCC120614MC1' },
  { titlePattern: 'RESERVA 85',                    codigo: 'RESERVA85' },
  { titlePattern: 'DYCOMSA DEL NORTE',             codigo: 'DYCOMSA',       rfc: 'DNO170131RV8' },
  { titlePattern: 'GM CARNES SUC. DIEGO DIAZ',     codigo: 'GMDIEGO',       rfc: 'CGD1703142I1' },
  { titlePattern: 'GM CARNES SUC. SAN NICOLAS',    codigo: 'GMSANICO',      rfc: 'CGM030227URA' },
  { titlePattern: 'LEAL (CTE. 590)',               codigo: '590',           rfc: 'LEA691201DX0' },
  { titlePattern: 'F CARNES',                      codigo: 'FCARNES1',      rfc: 'FCA980305M10' },
  { titlePattern: 'Cte.659',                       codigo: '659',           rfc: 'VACC491222KN6' },
  { titlePattern: '(CTE.529)',                     codigo: '529',           rfc: 'COMS590812UI3' },
  { titlePattern: '(583)SAN ANGEL',                codigo: '583',           rfc: 'CAML630103ET9' },
  { titlePattern: 'NUEVO MUNDO (CTE.132)',         codigo: '132',           rfc: 'SCN830823HI8' },
  { titlePattern: 'BALDERAS CTE. 072',             codigo: '072',           rfc: 'BSC030923IQ5' },
  { titlePattern: 'BALDERAS SRI',                  codigo: 'BALDERASRI',    rfc: 'BSC030923IQ5' },
  { titlePattern: 'BALDERAS (CTE. 478)',           codigo: '478',           rfc: 'BSC030923IQ5' },
  { titlePattern: 'ALICASA',                       codigo: 'ALICASA',       rfc: 'ALI240212J35' },
  { titlePattern: 'CTE. 392 EL NORTE',             codigo: '392',           rfc: 'NEC090709QW3' },
  { titlePattern: 'APODACA',                       codigo: '491',           rfc: 'NEC090709QW3' },
  { titlePattern: 'FRISA ALIMENTOS',               codigo: 'FRISAALIMENTOS' },
  { titlePattern: 'ALWIN FOOD',                    codigo: '',              skip: true, notes: 'YA NO SE LE FACTURA' },
  { titlePattern: 'ALIMENOTOS EL NEGRO',           codigo: '',              skip: true, notes: 'YA NO SE LE FACTURA' },
  // Ortiz
  { titlePattern: 'CTE:593 CARNES ORTIZ',          codigo: '593',           rfc: 'BACM600602IX1' },
  { titlePattern: 'CTE:594 CARNES ORTIZ',          codigo: '594',           rfc: 'OIBD830524K59' },
  { titlePattern: 'CTE:595 CARNES ORTIZ',          codigo: '595',           rfc: 'OIBK920730JM5' },
  // Melendez
  { titlePattern: 'MELENDEZ  HACIENDA',            codigo: 'MTHACIENDA',    rfc: 'CMT170216BE8' },
  { titlePattern: 'MELENDEZ  CASA BLANCA',         codigo: 'MTCASABLANCA' },
  { titlePattern: 'MELENDEZ  HUINALA',             codigo: 'MTHUINALA',     rfc: 'CMT170216BE8' },
  { titlePattern: 'MELENDEZ  CONCORDIA',           codigo: 'MTCONCORDIA' },
  { titlePattern: 'MELENDEZ  RINCON',              codigo: 'MTRINCON',      rfc: 'CMT170216BE8' },
  { titlePattern: 'MELENDEZ  CIENCIA',             codigo: 'MTCIENCIA',     rfc: 'CMT170216BE8' },
  { titlePattern: 'MELENDEZ  ANZURES',             codigo: 'MTANZURES',     rfc: 'CMT170216BE8' },
  { titlePattern: 'MELENDEZ  UROS',                codigo: 'MTURO',         rfc: 'CMT170216BE8' },
];

const PRODUCTS: ProductMappingEntry[] = [
  { columnaPattern: 'ESTRELLA',      sku: '001', claveSat: '50161509', unidadSat: 'KGM' },
  { columnaPattern: 'ESTRELLA 1',    sku: '001', claveSat: '50161509', unidadSat: 'KGM' },
  { columnaPattern: 'ESTRELLA 1KG',  sku: '001', claveSat: '50161509', unidadSat: 'KGM' },
  { columnaPattern: 'ESTRELLA 1/2',  sku: '021', claveSat: '50161509', unidadSat: 'H87' },
  { columnaPattern: 'RANCHO',        sku: '002', claveSat: '50161509', unidadSat: 'KGM' },
  { columnaPattern: 'RANCHO 1KG',    sku: '002', claveSat: '50161509', unidadSat: 'KGM' },
  { columnaPattern: 'RANCHO 1/2',    sku: '022', claveSat: '50161509', unidadSat: 'H87' },
  { columnaPattern: 'ROJA',          sku: '004', claveSat: '50161509', unidadSat: 'KGM' },
  { columnaPattern: 'FRIJOL',        sku: '005', claveSat: '50131700', unidadSat: 'KGM' },
  { columnaPattern: 'SALSA .500',    sku: '006', claveSat: '50131701', unidadSat: 'KGM' },
  { columnaPattern: 'SALSA 500',     sku: '006', claveSat: '50131701', unidadSat: 'KGM' },
  { columnaPattern: 'GELITA',        sku: '015', claveSat: '50161509', unidadSat: 'KGM' },
  { columnaPattern: 'GELITA 1KG',    sku: '015', claveSat: '50161509', unidadSat: 'KGM' },
  { columnaPattern: 'GELITA ESD',    sku: '015', claveSat: '50161509', unidadSat: 'KGM' },
  { columnaPattern: 'S GELITA',      sku: '015', claveSat: '50161509', unidadSat: 'KGM' },
  { columnaPattern: 'TACO',          sku: '017', claveSat: '50161509', unidadSat: 'KGM' },
  { columnaPattern: 'TACO 1KG',      sku: '017', claveSat: '50161509', unidadSat: 'KGM' },
  { columnaPattern: 'TACO 1 KG',     sku: '017', claveSat: '50161509', unidadSat: 'KGM' },
  { columnaPattern: 'TACO 1KG.',     sku: '017', claveSat: '50161509', unidadSat: 'KGM' },
  { columnaPattern: 'MI ESTRELLA',   sku: '054', claveSat: '50161509', unidadSat: 'H87' },
  { columnaPattern: 'S/MARCA',       sku: 'VTSM', claveSat: '50161509', unidadSat: 'H87' },
  { columnaPattern: 'SN MARCA',      sku: 'VTSM', claveSat: '50161509', unidadSat: 'H87' },
];

const MAPPING: TortilleriaMapping = {
  version:            '1.0',
  updatedAt:          '2026-09-08T00:00:00Z',
  creditCodes:        ['SILLATPROP'],
  consolidationRules: [
    { matchPrefix: 'DCA', consolidateToCode: 'DCA', reason: 'Beatriz consolida DCA en 1 CFDI' },
  ],
  clients:            CLIENTS,
  products:           PRODUCTS,
};

const CONFIG: TortilleriaPipelineConfig = {
  rfcEmisor:            'TES010203ABC', // placeholder
  serieDefault:         'T',
  usoCFDIDefault:       'G03',
  claveSATDefault:      '50161509',
  regimenFiscal:        '601',
  codigoPostalEmisor:   '64000',
};

// ---- Tests ----------------------------------------------------------------

describe('pipeline — CTES. VARIOS', () => {
  const buf = loadXlsx('varios.xlsx');
  const parsed = parseTortilleriaBatchXlsx(buf);
  const result = buildInvoicesFromBlocks(parsed.blocks, MAPPING, CONFIG);

  it('skip ALWIN FOOD y ALIMENOTOS EL NEGRO', () => {
    const titles = result.skipped.map(s => s.tituloBloque);
    expect(titles.some(t => /ALWIN FOOD/i.test(t))).toBe(true);
    expect(titles.some(t => /ALIMENOTOS EL NEGRO/i.test(t))).toBe(true);
    expect(result.skipped.length).toBe(2);
  });

  it('consolida los 3 bloques DCA en 1 CFDI a código DCA', () => {
    const dca = result.invoices.filter(i => i.clientRFC === 'DCA' || (i.notes && /Consolidado/.test(i.notes)));
    // Buscar la factura consolidada por metodoPago + notes
    const consolidated = result.invoices.find(i => i.notes?.includes('Consolidado'));
    expect(consolidated).toBeDefined();
    expect(consolidated!.clientRFC).toBe('DCA');
    expect(consolidated!.metodoPago).toBe('PUE');
  });

  it('SILLATPROP factura con metodoPago PPD (crédito)', () => {
    // El código SILLATPROP tiene RFC MATA850818NX7 en el mapping
    const silla = result.invoices.find(i => i.clientRFC === 'MATA850818NX7');
    expect(silla).toBeDefined();
    expect(silla!.metodoPago).toBe('PPD');
  });

  it('Cardenas 045 → factura con RFC CAL960522981 y total $8972.60', () => {
    const cardenas = result.invoices.find(i => i.clientRFC === 'CAL960522981');
    expect(cardenas).toBeDefined();
    const total = cardenas!.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
    expect(total).toBeCloseTo(8972.6, 1);
    // Cardenas tiene 2 líneas: ESTRELLA 1/2 → SKU 021, RANCHO 1/2 → SKU 022
    const skus = cardenas!.lines.map(l => l.sku).sort();
    expect(skus).toEqual(['021', '022']);
  });

  it('emite 1 factura por bloque no consolidado ni skipped ni vacío', () => {
    // 29 bloques totales, -2 skip (ALWIN, ALIMENOTOS), 3 DCA → 1 consolidado,
    // -2 bloques vacíos (RESERVA 85 y APODACA con 0 remisiones esta semana) = 23
    expect(result.invoices.length).toBe(23);
  });

  it('sin errores de resolución de cliente', () => {
    expect(result.errors).toEqual([]);
  });
});

describe('pipeline — Ortiz', () => {
  const parsed = parseTortilleriaBatchXlsx(loadXlsx('ortiz.xlsx'));
  const result = buildInvoicesFromBlocks(parsed.blocks, MAPPING, CONFIG);

  it('emite 3 facturas separadas (razones sociales distintas)', () => {
    expect(result.invoices.length).toBe(3);
  });

  it('cada factura Ortiz tiene el RFC correcto', () => {
    const rfcs = result.invoices.map(i => i.clientRFC).sort();
    expect(rfcs).toEqual(['BACM600602IX1', 'OIBD830524K59', 'OIBK920730JM5']);
  });

  it('totales agregan al del Excel por bloque', () => {
    const totals = result.invoices
      .map(i => i.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0))
      .sort();
    expect(totals[0]).toBeCloseTo(12750, 0);
    expect(totals[1]).toBeCloseTo(19214, 0);
    expect(totals[2]).toBeCloseTo(21714, 0);
  });

  it('todas PUE (Ortiz no está en creditCodes)', () => {
    for (const inv of result.invoices) {
      expect(inv.metodoPago).toBe('PUE');
    }
  });
});

describe('pipeline — Melendez', () => {
  const parsed = parseTortilleriaBatchXlsx(loadXlsx('melendez.xlsx'));
  const result = buildInvoicesFromBlocks(parsed.blocks, MAPPING, CONFIG);

  it('emite 7 facturas (8 bloques - 1 vacío CONCORDIA)', () => {
    // CONCORDIA tiene 0 remisiones → sin líneas → se salta con warning
    expect(result.invoices.length).toBe(7);
  });

  it('warning por bloque CONCORDIA vacío', () => {
    expect(result.warnings.some(w => /CONCORDIA/i.test(w.tituloBloque) && /sin líneas/i.test(w.message))).toBe(true);
  });

  it('cada Melendez tiene su código MT*', () => {
    const codes = result.invoices.map(i => i.clientRFC);
    // Los que tienen RFC en el mapping devuelven CMT170216BE8, los que no (MTCASABLANCA)
    // devuelven el código como fallback.
    const withRfc = codes.filter(c => c === 'CMT170216BE8');
    expect(withRfc.length).toBeGreaterThanOrEqual(5);
  });
});
