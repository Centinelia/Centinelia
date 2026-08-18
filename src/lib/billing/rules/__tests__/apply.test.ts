/**
 * apply.test.ts -- Tests para applyRuleToSale
 *
 * Casos cubiertos:
 * 1. Sin regla para el RFC -> retorna 'daily', sin side effects
 * 2. Regla con frequency='weekly' -> retorna 'weekly', appendRow a Pendientes.xlsx
 * 3. Regla con frequency='monthly' -> retorna 'monthly', appendRow a Pendientes.xlsx
 * 4. Pendientes.xlsx no existe -> crea archivo nuevo (still appends)
 * 5. snapshot se llama antes de writeFile
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// ---------------------------------------------------------------------------
// Shared mock refs via vi.hoisted
// ---------------------------------------------------------------------------

const {
  mockSupabaseFrom,
  mockDropboxRead,
  mockDropboxWrite,
  mockSnapshot,
} = vi.hoisted(() => ({
  mockSupabaseFrom: vi.fn(),
  mockDropboxRead:  vi.fn(),
  mockDropboxWrite: vi.fn(),
  mockSnapshot:     vi.fn(),
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

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { applyRuleToSale } from '../apply';
import type { OrgCtx } from '../../matching/client';
import { ExcelWorkbook } from '../../excel/workbook';
import { PendingClientSchema } from '../../excel/schemas';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CTX: OrgCtx = {
  portalEmail:   'empresa@example.com',
  integrationId: 'integ-001',
};

/** Venta de prueba estandar */
const SALE = {
  rfc:       'MASC850101ABC',
  date:      '2026-08-17',
  productos: '5 kg tortilla',
  total:     150,
  metodo:    'efectivo',
  ventaNum:  1,
};

const BASE_PATH = '/Facturacion/2026';

/**
 * Helper: configura supabase para retornar una fila de regla (o null).
 */
function mockRuleRow(rule: object | null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: rule, error: null });
  const eq2 = vi.fn().mockReturnValue({ maybeSingle });
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
  const select = vi.fn().mockReturnValue({ eq: eq1 });
  mockSupabaseFrom.mockReturnValue({ select });
}

/**
 * Helper: construye un Buffer de un Pendientes.xlsx vacio para mockDropboxRead.
 */
async function emptyPendingBuffer(): Promise<Buffer> {
  const wb = ExcelWorkbook.empty(PendingClientSchema);
  return wb.toBuffer();
}

// ---------------------------------------------------------------------------
// beforeEach: reset mocks
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockDropboxWrite.mockResolvedValue('/some/path/Pendientes.xlsx');
  mockSnapshot.mockResolvedValue('snapshot-key-001');
});

// ---------------------------------------------------------------------------
// Test 1: sin regla -> 'daily', sin side effects
// ---------------------------------------------------------------------------

describe('applyRuleToSale -- sin regla', () => {
  it('retorna daily cuando no existe regla para el RFC', async () => {
    mockRuleRow(null);

    const decision = await applyRuleToSale(SALE, CTX, BASE_PATH);

    expect(decision).toBe('daily');
  });

  it('no escribe en Dropbox cuando retorna daily', async () => {
    mockRuleRow(null);

    await applyRuleToSale(SALE, CTX, BASE_PATH);

    expect(mockDropboxWrite).not.toHaveBeenCalled();
    expect(mockSnapshot).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Test 2: regla weekly -> 'weekly' + appendRow
// ---------------------------------------------------------------------------

describe('applyRuleToSale -- frequency=weekly', () => {
  it('retorna weekly cuando la regla dice weekly', async () => {
    mockRuleRow({ rfc: SALE.rfc, frequency: 'weekly', payment_method: null });
    mockDropboxRead.mockRejectedValue(new Error('File not found')); // archivo no existe

    const decision = await applyRuleToSale(SALE, CTX, BASE_PATH);

    expect(decision).toBe('weekly');
  });

  it('escribe en Dropbox cuando retorna weekly', async () => {
    mockRuleRow({ rfc: SALE.rfc, frequency: 'weekly', payment_method: null });
    mockDropboxRead.mockRejectedValue(new Error('File not found'));

    await applyRuleToSale(SALE, CTX, BASE_PATH);

    expect(mockDropboxWrite).toHaveBeenCalledTimes(1);
  });

  it('escribe en la ruta correcta del Pendientes (Clientes_Periodicos/<RFC>/Pendientes.xlsx)', async () => {
    mockRuleRow({ rfc: SALE.rfc, frequency: 'weekly', payment_method: null });
    mockDropboxRead.mockRejectedValue(new Error('File not found'));

    await applyRuleToSale(SALE, CTX, BASE_PATH);

    const writtenPath: string = (mockDropboxWrite as Mock).mock.calls[0][0];
    expect(writtenPath).toContain('Clientes_Periodicos');
    expect(writtenPath).toContain(SALE.rfc);
    expect(writtenPath).toContain('Pendientes.xlsx');
  });
});

// ---------------------------------------------------------------------------
// Test 3: regla monthly -> 'monthly' + appendRow
// ---------------------------------------------------------------------------

describe('applyRuleToSale -- frequency=monthly', () => {
  it('retorna monthly cuando la regla dice monthly', async () => {
    mockRuleRow({ rfc: SALE.rfc, frequency: 'monthly', payment_method: null });
    mockDropboxRead.mockRejectedValue(new Error('File not found'));

    const decision = await applyRuleToSale(SALE, CTX, BASE_PATH);

    expect(decision).toBe('monthly');
  });

  it('escribe en Dropbox cuando retorna monthly', async () => {
    mockRuleRow({ rfc: SALE.rfc, frequency: 'monthly', payment_method: null });
    mockDropboxRead.mockRejectedValue(new Error('File not found'));

    await applyRuleToSale(SALE, CTX, BASE_PATH);

    expect(mockDropboxWrite).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Test 4: Pendientes.xlsx no existe -> crea nuevo y append
// ---------------------------------------------------------------------------

describe('applyRuleToSale -- Pendientes.xlsx no existe', () => {
  it('crea archivo nuevo cuando Dropbox lanza error al leer', async () => {
    mockRuleRow({ rfc: SALE.rfc, frequency: 'weekly', payment_method: null });
    // Simular archivo inexistente
    mockDropboxRead.mockRejectedValue(new Error('not_found'));

    const decision = await applyRuleToSale(SALE, CTX, BASE_PATH);

    expect(decision).toBe('weekly');
    // Se debe haber escrito el archivo nuevo
    expect(mockDropboxWrite).toHaveBeenCalledTimes(1);
  });

  it('escribe correctamente cuando el archivo existe', async () => {
    mockRuleRow({ rfc: SALE.rfc, frequency: 'monthly', payment_method: null });
    const existingBuf = await emptyPendingBuffer();
    mockDropboxRead.mockResolvedValue(existingBuf);

    const decision = await applyRuleToSale(SALE, CTX, BASE_PATH);

    expect(decision).toBe('monthly');
    expect(mockDropboxWrite).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Test 5: snapshot se llama ANTES de writeFile
// ---------------------------------------------------------------------------

describe('applyRuleToSale -- orden de operaciones', () => {
  it('invoca snapshot antes que writeFile', async () => {
    mockRuleRow({ rfc: SALE.rfc, frequency: 'weekly', payment_method: null });
    mockDropboxRead.mockRejectedValue(new Error('File not found'));

    const callOrder: string[] = [];
    mockSnapshot.mockImplementation(async () => {
      callOrder.push('snapshot');
      return 'snap-001';
    });
    mockDropboxWrite.mockImplementation(async () => {
      callOrder.push('writeFile');
      return '/path/Pendientes.xlsx';
    });

    await applyRuleToSale(SALE, CTX, BASE_PATH);

    expect(callOrder).toEqual(['snapshot', 'writeFile']);
  });
});

// ---------------------------------------------------------------------------
// Test 6: no_rule (frequency desconocida) -> 'no_rule'
// ---------------------------------------------------------------------------

describe('applyRuleToSale -- frequency desconocida', () => {
  it('retorna no_rule cuando frequency no es weekly ni monthly', async () => {
    mockRuleRow({ rfc: SALE.rfc, frequency: 'special', payment_method: null });

    const decision = await applyRuleToSale(SALE, CTX, BASE_PATH);

    expect(decision).toBe('no_rule');
    expect(mockDropboxWrite).not.toHaveBeenCalled();
  });
});
