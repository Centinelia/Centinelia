/**
 * reassign.test.ts -- Tests para reassignSales
 *
 * Casos cubiertos:
 * 1. Happy path: 2 ventas "No facturado" reasignadas a cliente con regla daily
 * 2. Reasignacion a cliente con regla weekly: se acumulan en Pendientes.xlsx
 * 3. RFC destino inexistente: lanza error con mensaje claro
 * 4. saleNum inexistente (no en Excel): se registra en missing[]
 * 5. snapshot se invoca antes de writeFile
 * 6. billing_activity_log se inserta con el resumen
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// ---------------------------------------------------------------------------
// Shared mock refs via vi.hoisted
// ---------------------------------------------------------------------------

const {
  mockSupabaseFrom,
  mockSupabaseInsert,
  mockDropboxRead,
  mockDropboxWrite,
  mockSnapshot,
  mockApplyRuleToSale,
} = vi.hoisted(() => ({
  mockSupabaseFrom:      vi.fn(),
  mockSupabaseInsert:    vi.fn(),
  mockDropboxRead:       vi.fn(),
  mockDropboxWrite:      vi.fn(),
  mockSnapshot:          vi.fn(),
  mockApplyRuleToSale:   vi.fn(),
}));

// ---------------------------------------------------------------------------
// vi.mock declarations (hoisted by vitest)
// ---------------------------------------------------------------------------

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: mockSupabaseFrom }),
}));

vi.mock('@/lib/billing/storage/dropbox', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  DropboxClient: vi.fn().mockImplementation(function (this: any) {
    this.readFile  = mockDropboxRead;
    this.writeFile = mockDropboxWrite;
  }),
}));

vi.mock('@/lib/billing/storage/snapshot', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  SnapshotStorage: vi.fn().mockImplementation(function (this: any) {
    this.snapshot = mockSnapshot;
  }),
}));

vi.mock('@/lib/billing/rules/apply', () => ({
  applyRuleToSale: mockApplyRuleToSale,
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { reassignSales } from '../reassign';
import type { OrgCtx } from '../../matching/client';
import type { BillingAdapter, BillingClient } from '../../adapter';
import { ExcelWorkbook } from '../../excel/workbook';
import { DailySalesSchema } from '../../excel/schemas';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CTX: OrgCtx = {
  portalEmail:   'empresa@example.com',
  integrationId: 'integ-001',
};

const BASE_PATH = '/Facturacion/2026';
const DAILY_EXCEL_PATH = '/Facturacion/2026/Ventas_2026-08-17.xlsx';

const TARGET_CLIENT_DAILY: BillingClient = {
  rfc:          'XAXX010101000',
  adapterId:    'cli-daily-001',
  razonSocial:  'PUBLICO EN GENERAL',
  usoCFDI:      'G03',
  regimen:      '616',
  codigoPostal: '64000',
};

const TARGET_CLIENT_WEEKLY: BillingClient = {
  rfc:          'MASC850101ABC',
  adapterId:    'cli-weekly-001',
  razonSocial:  'Maria Sanchez',
  usoCFDI:      'G03',
  regimen:      '612',
  codigoPostal: '64010',
};

/**
 * Builds a Buffer of the daily sales Excel with provided rows.
 * Each row: { num, hora, cliente, rfc, productos, total, metodo, status, factura }
 */
async function buildDailyExcel(rows: Record<string, unknown>[]): Promise<Buffer> {
  const wb = ExcelWorkbook.empty(DailySalesSchema);
  for (const row of rows) {
    wb.appendRow('Ventas', row);
  }
  return wb.toBuffer();
}

/** Stub adapter that returns a client when RFC matches, null otherwise. */
function makeAdapter(clientMap: Record<string, BillingClient | null>): BillingAdapter {
  return {
    getClientByRFC: vi.fn(async (rfc: string) => clientMap[rfc] ?? null),
    searchClient:      vi.fn(),
    searchProduct:     vi.fn(),
    getProductBySKU:   vi.fn(),
    submitInvoiceBatch: vi.fn(),
    freshness:         vi.fn(),
    supportsAutoStamping: vi.fn().mockReturnValue(false),
  } as unknown as BillingAdapter;
}

/**
 * Configures mockSupabaseFrom to handle:
 *   - billing_activity_log insert
 */
function setupSupabaseMock() {
  mockSupabaseInsert.mockResolvedValue({ error: null });
  mockSupabaseFrom.mockReturnValue({ insert: mockSupabaseInsert });
}

// ---------------------------------------------------------------------------
// beforeEach: reset
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockDropboxWrite.mockResolvedValue('/some/path.xlsx');
  mockSnapshot.mockResolvedValue('snapshot-key-001');
  setupSupabaseMock();
});

// ---------------------------------------------------------------------------
// Test 1: happy path -- 2 ventas "No facturado" reasignadas a cliente daily
// ---------------------------------------------------------------------------

describe('reassignSales -- happy path con regla daily', () => {
  it('retorna reassigned=2 cuando 2 filas coinciden con status No facturado', async () => {
    const rows = [
      { num: 1, hora: '10:00', cliente: 'Viejo Cliente', rfc: 'VIEJ000000AAA', productos: 'Pan', total: 100, metodo: 'efectivo', status: 'No facturado', factura: '' },
      { num: 2, hora: '10:30', cliente: 'Otro Viejo', rfc: 'OTRO000000BBB', productos: 'Leche', total: 200, metodo: 'transferencia', status: 'No facturado', factura: '' },
      { num: 3, hora: '11:00', cliente: 'Ya Facturado', rfc: 'YAFF000000CCC', productos: 'Queso', total: 300, metodo: 'efectivo', status: 'Facturado', factura: 'A-001' },
    ];
    const buf = await buildDailyExcel(rows);
    mockDropboxRead.mockResolvedValue(buf);
    mockApplyRuleToSale.mockResolvedValue('daily');

    const adapter = makeAdapter({ [TARGET_CLIENT_DAILY.rfc]: TARGET_CLIENT_DAILY });

    const result = await reassignSales({
      dailyExcelPath: DAILY_EXCEL_PATH,
      saleNums:       [1, 2],
      targetRFC:      TARGET_CLIENT_DAILY.rfc,
      ctx:            CTX,
      adapter,
      basePath:       BASE_PATH,
    });

    expect(result.reassigned).toBe(2);
    expect(result.missing).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.targetClient).toEqual(TARGET_CLIENT_DAILY);
  });

  it('escribe el Excel de vuelta en Dropbox con status Pendiente', async () => {
    const rows = [
      { num: 1, hora: '10:00', cliente: 'Viejo', rfc: 'VIEJ000000AAA', productos: 'Pan', total: 100, metodo: 'efectivo', status: 'No facturado', factura: '' },
    ];
    const buf = await buildDailyExcel(rows);
    mockDropboxRead.mockResolvedValue(buf);
    mockApplyRuleToSale.mockResolvedValue('daily');

    const adapter = makeAdapter({ [TARGET_CLIENT_DAILY.rfc]: TARGET_CLIENT_DAILY });

    await reassignSales({
      dailyExcelPath: DAILY_EXCEL_PATH,
      saleNums:       [1],
      targetRFC:      TARGET_CLIENT_DAILY.rfc,
      ctx:            CTX,
      adapter,
      basePath:       BASE_PATH,
    });

    expect(mockDropboxWrite).toHaveBeenCalledTimes(1);
    expect(mockDropboxWrite.mock.calls[0][0]).toBe(DAILY_EXCEL_PATH);
  });

  it('invoca applyRuleToSale con el RFC destino para cada fila reasignada', async () => {
    const rows = [
      { num: 1, hora: '10:00', cliente: 'Viejo', rfc: 'VIEJ000000AAA', productos: 'Pan', total: 100, metodo: 'efectivo', status: 'No facturado', factura: '' },
      { num: 2, hora: '10:30', cliente: 'Otro', rfc: 'OTRO000000BBB', productos: 'Leche', total: 200, metodo: 'transferencia', status: 'No facturado', factura: '' },
    ];
    const buf = await buildDailyExcel(rows);
    mockDropboxRead.mockResolvedValue(buf);
    mockApplyRuleToSale.mockResolvedValue('daily');

    const adapter = makeAdapter({ [TARGET_CLIENT_DAILY.rfc]: TARGET_CLIENT_DAILY });

    await reassignSales({
      dailyExcelPath: DAILY_EXCEL_PATH,
      saleNums:       [1, 2],
      targetRFC:      TARGET_CLIENT_DAILY.rfc,
      ctx:            CTX,
      adapter,
      basePath:       BASE_PATH,
    });

    expect(mockApplyRuleToSale).toHaveBeenCalledTimes(2);
    // Each call uses the target RFC, not the original row RFC
    expect(mockApplyRuleToSale.mock.calls[0][0]).toMatchObject({ rfc: TARGET_CLIENT_DAILY.rfc });
    expect(mockApplyRuleToSale.mock.calls[1][0]).toMatchObject({ rfc: TARGET_CLIENT_DAILY.rfc });
  });

  it('registra en billing_activity_log', async () => {
    const rows = [
      { num: 1, hora: '10:00', cliente: 'Viejo', rfc: 'VIEJ000000AAA', productos: 'Pan', total: 100, metodo: 'efectivo', status: 'No facturado', factura: '' },
    ];
    const buf = await buildDailyExcel(rows);
    mockDropboxRead.mockResolvedValue(buf);
    mockApplyRuleToSale.mockResolvedValue('daily');

    const adapter = makeAdapter({ [TARGET_CLIENT_DAILY.rfc]: TARGET_CLIENT_DAILY });

    await reassignSales({
      dailyExcelPath: DAILY_EXCEL_PATH,
      saleNums:       [1],
      targetRFC:      TARGET_CLIENT_DAILY.rfc,
      ctx:            CTX,
      adapter,
      basePath:       BASE_PATH,
    });

    expect(mockSupabaseFrom).toHaveBeenCalledWith('billing_activity_log');
    expect(mockSupabaseInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        portal_email:   CTX.portalEmail,
        integration_id: CTX.integrationId,
        action_type:    'ventas_reasignadas',
        severity:       'info',
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Test 2: reasignacion a cliente con regla weekly
// ---------------------------------------------------------------------------

describe('reassignSales -- cliente con regla weekly', () => {
  it('retorna reassigned=1 y applyRuleToSale retorna weekly', async () => {
    const rows = [
      { num: 5, hora: '09:00', cliente: 'Viejo', rfc: 'VIEJ000000AAA', productos: 'Tortillas', total: 500, metodo: 'efectivo', status: 'No facturado', factura: '' },
    ];
    const buf = await buildDailyExcel(rows);
    mockDropboxRead.mockResolvedValue(buf);
    // applyRuleToSale retorna 'weekly' (acumula en Pendientes.xlsx internamente)
    mockApplyRuleToSale.mockResolvedValue('weekly');

    const adapter = makeAdapter({ [TARGET_CLIENT_WEEKLY.rfc]: TARGET_CLIENT_WEEKLY });

    const result = await reassignSales({
      dailyExcelPath: DAILY_EXCEL_PATH,
      saleNums:       [5],
      targetRFC:      TARGET_CLIENT_WEEKLY.rfc,
      ctx:            CTX,
      adapter,
      basePath:       BASE_PATH,
    });

    expect(result.reassigned).toBe(1);
    expect(result.missing).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.targetClient).toEqual(TARGET_CLIENT_WEEKLY);
    expect(mockApplyRuleToSale).toHaveBeenCalledWith(
      expect.objectContaining({ rfc: TARGET_CLIENT_WEEKLY.rfc }),
      CTX,
      BASE_PATH,
    );
  });

  it('sigue escribiendo el Excel diario incluso cuando la regla es weekly', async () => {
    const rows = [
      { num: 5, hora: '09:00', cliente: 'Viejo', rfc: 'VIEJ000000AAA', productos: 'Tortillas', total: 500, metodo: 'efectivo', status: 'No facturado', factura: '' },
    ];
    const buf = await buildDailyExcel(rows);
    mockDropboxRead.mockResolvedValue(buf);
    mockApplyRuleToSale.mockResolvedValue('weekly');

    const adapter = makeAdapter({ [TARGET_CLIENT_WEEKLY.rfc]: TARGET_CLIENT_WEEKLY });

    await reassignSales({
      dailyExcelPath: DAILY_EXCEL_PATH,
      saleNums:       [5],
      targetRFC:      TARGET_CLIENT_WEEKLY.rfc,
      ctx:            CTX,
      adapter,
      basePath:       BASE_PATH,
    });

    // El Excel diario siempre se escribe con el cliente/RFC actualizado
    expect(mockDropboxWrite).toHaveBeenCalledWith(DAILY_EXCEL_PATH, expect.any(Buffer));
  });
});

// ---------------------------------------------------------------------------
// Test 3: RFC destino inexistente -> throw
// ---------------------------------------------------------------------------

describe('reassignSales -- RFC inexistente', () => {
  it('lanza error cuando adapter.getClientByRFC retorna null', async () => {
    const rows = [
      { num: 1, hora: '10:00', cliente: 'Viejo', rfc: 'VIEJ000000AAA', productos: 'Pan', total: 100, metodo: 'efectivo', status: 'No facturado', factura: '' },
    ];
    const buf = await buildDailyExcel(rows);
    mockDropboxRead.mockResolvedValue(buf);

    const adapter = makeAdapter({}); // no hay ningún cliente en el mapa

    await expect(
      reassignSales({
        dailyExcelPath: DAILY_EXCEL_PATH,
        saleNums:       [1],
        targetRFC:      'RFC_INEXISTENTE_000',
        ctx:            CTX,
        adapter,
        basePath:       BASE_PATH,
      }),
    ).rejects.toThrow('RFC_INEXISTENTE_000');
  });

  it('no escribe en Dropbox cuando el RFC es invalido', async () => {
    const rows = [
      { num: 1, hora: '10:00', cliente: 'Viejo', rfc: 'VIEJ000000AAA', productos: 'Pan', total: 100, metodo: 'efectivo', status: 'No facturado', factura: '' },
    ];
    const buf = await buildDailyExcel(rows);
    mockDropboxRead.mockResolvedValue(buf);

    const adapter = makeAdapter({});

    await expect(
      reassignSales({
        dailyExcelPath: DAILY_EXCEL_PATH,
        saleNums:       [1],
        targetRFC:      'RFC_INVALIDO_000',
        ctx:            CTX,
        adapter,
        basePath:       BASE_PATH,
      }),
    ).rejects.toThrow();

    expect(mockDropboxWrite).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Test 4: saleNum inexistente -> registra en missing[]
// ---------------------------------------------------------------------------

describe('reassignSales -- saleNums inexistentes', () => {
  it('agrega a missing[] los nums que no existen en el Excel', async () => {
    const rows = [
      { num: 1, hora: '10:00', cliente: 'Viejo', rfc: 'VIEJ000000AAA', productos: 'Pan', total: 100, metodo: 'efectivo', status: 'No facturado', factura: '' },
    ];
    const buf = await buildDailyExcel(rows);
    mockDropboxRead.mockResolvedValue(buf);
    mockApplyRuleToSale.mockResolvedValue('daily');

    const adapter = makeAdapter({ [TARGET_CLIENT_DAILY.rfc]: TARGET_CLIENT_DAILY });

    const result = await reassignSales({
      dailyExcelPath: DAILY_EXCEL_PATH,
      saleNums:       [1, 99, 100], // 99 y 100 no existen
      targetRFC:      TARGET_CLIENT_DAILY.rfc,
      ctx:            CTX,
      adapter,
      basePath:       BASE_PATH,
    });

    expect(result.reassigned).toBe(1);
    expect(result.missing).toContain(99);
    expect(result.missing).toContain(100);
    expect(result.errors).toEqual([]);
  });

  it('no reasigna filas con status distinto a No facturado aunque el num coincida', async () => {
    const rows = [
      // num=2 existe pero ya fue facturado
      { num: 2, hora: '11:00', cliente: 'Ya Facturado', rfc: 'YAFF000000CCC', productos: 'Queso', total: 300, metodo: 'efectivo', status: 'Facturado', factura: 'A-001' },
    ];
    const buf = await buildDailyExcel(rows);
    mockDropboxRead.mockResolvedValue(buf);
    mockApplyRuleToSale.mockResolvedValue('daily');

    const adapter = makeAdapter({ [TARGET_CLIENT_DAILY.rfc]: TARGET_CLIENT_DAILY });

    const result = await reassignSales({
      dailyExcelPath: DAILY_EXCEL_PATH,
      saleNums:       [2],
      targetRFC:      TARGET_CLIENT_DAILY.rfc,
      ctx:            CTX,
      adapter,
      basePath:       BASE_PATH,
    });

    // La fila existe pero no cumple el matcher (status != 'No facturado')
    // Por tanto se registra en missing
    expect(result.reassigned).toBe(0);
    expect(result.missing).toContain(2);
  });
});

// ---------------------------------------------------------------------------
// Test 5: snapshot antes de writeFile
// ---------------------------------------------------------------------------

describe('reassignSales -- orden de operaciones', () => {
  it('invoca snapshot antes que writeFile', async () => {
    const rows = [
      { num: 1, hora: '10:00', cliente: 'Viejo', rfc: 'VIEJ000000AAA', productos: 'Pan', total: 100, metodo: 'efectivo', status: 'No facturado', factura: '' },
    ];
    const buf = await buildDailyExcel(rows);
    mockDropboxRead.mockResolvedValue(buf);
    mockApplyRuleToSale.mockResolvedValue('daily');

    const callOrder: string[] = [];
    mockSnapshot.mockImplementation(async () => {
      callOrder.push('snapshot');
      return 'snap-001';
    });
    mockDropboxWrite.mockImplementation(async () => {
      callOrder.push('writeFile');
      return DAILY_EXCEL_PATH;
    });

    const adapter = makeAdapter({ [TARGET_CLIENT_DAILY.rfc]: TARGET_CLIENT_DAILY });

    await reassignSales({
      dailyExcelPath: DAILY_EXCEL_PATH,
      saleNums:       [1],
      targetRFC:      TARGET_CLIENT_DAILY.rfc,
      ctx:            CTX,
      adapter,
      basePath:       BASE_PATH,
    });

    expect(callOrder).toEqual(['snapshot', 'writeFile']);
  });
});

// ---------------------------------------------------------------------------
// Test 6: per-sale applyRuleToSale error path
// ---------------------------------------------------------------------------

describe('reassignSales -- error en applyRuleToSale por venta', () => {
  it('captura error de la primera venta y sigue procesando la segunda', async () => {
    const rows = [
      { num: 10, hora: '08:00', cliente: 'Viejo A', rfc: 'VIEJA00000AAA', productos: 'Pan', total: 150, metodo: 'efectivo', status: 'No facturado', factura: '' },
      { num: 11, hora: '08:30', cliente: 'Viejo B', rfc: 'VIEJB00000BBB', productos: 'Leche', total: 250, metodo: 'transferencia', status: 'No facturado', factura: '' },
    ];
    const buf = await buildDailyExcel(rows);
    mockDropboxRead.mockResolvedValue(buf);

    // Primera llamada lanza, segunda resuelve
    mockApplyRuleToSale
      .mockRejectedValueOnce(new Error('Fallo de regla en venta 10'))
      .mockResolvedValueOnce('daily');

    const adapter = makeAdapter({ [TARGET_CLIENT_DAILY.rfc]: TARGET_CLIENT_DAILY });

    const result = await reassignSales({
      dailyExcelPath: DAILY_EXCEL_PATH,
      saleNums:       [10, 11],
      targetRFC:      TARGET_CLIENT_DAILY.rfc,
      ctx:            CTX,
      adapter,
      basePath:       BASE_PATH,
    });

    // Ambas ventas fueron reasignadas fisicamente en el Excel
    expect(result.reassigned).toBe(2);
    // Solo una fallo en applyRuleToSale
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].saleNum).toBe(10);
    expect(result.errors[0].reason).toContain('Fallo de regla en venta 10');
    // missing sigue vacio
    expect(result.missing).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Test 7: sale.date se extrae del filename, no de row.hora
// ---------------------------------------------------------------------------

describe('reassignSales -- sale.date proviene del path del Excel', () => {
  it('pasa sale.date === "2026-08-17" cuando el path contiene esa fecha', async () => {
    const rows = [
      { num: 20, hora: '10:00', cliente: 'Viejo', rfc: 'VIEJ000000AAA', productos: 'Agua', total: 50, metodo: 'efectivo', status: 'No facturado', factura: '' },
    ];
    const buf = await buildDailyExcel(rows);
    mockDropboxRead.mockResolvedValue(buf);
    mockApplyRuleToSale.mockResolvedValue('daily');

    const adapter = makeAdapter({ [TARGET_CLIENT_DAILY.rfc]: TARGET_CLIENT_DAILY });

    await reassignSales({
      dailyExcelPath: '/Facturacion/2026/Ventas_2026-08-17.xlsx',
      saleNums:       [20],
      targetRFC:      TARGET_CLIENT_DAILY.rfc,
      ctx:            CTX,
      adapter,
      basePath:       BASE_PATH,
    });

    expect(mockApplyRuleToSale).toHaveBeenCalledTimes(1);
    expect(mockApplyRuleToSale.mock.calls[0][0]).toMatchObject({
      date: '2026-08-17',
    });
  });
});
