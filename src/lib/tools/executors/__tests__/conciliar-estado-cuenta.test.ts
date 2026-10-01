// Unit tests del handler conciliar_estado_cuenta.
// Mockea Supabase + consumeAiOp + generateExcel para probar orquestación
// sin tocar DB real. El motor subyacente (parsers/reconciler) tiene su
// propia batería en src/lib/bank/__tests__.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/ai/ops-guard', () => ({
  consumeAiOp: vi.fn(() => Promise.resolve({ ok: true, used: 1, limit: 1000 })),
  refundOps:   vi.fn(() => Promise.resolve({ ok: true })),
}));

vi.mock('@/lib/documents/excel', () => ({
  generateExcel: vi.fn(() => Promise.resolve(Buffer.from('xlsx-stub'))),
}));

import { runConciliarEstadoCuenta } from '../conciliar-estado-cuenta';
import { consumeAiOp } from '@/lib/ai/ops-guard';

const BBVA_CSV = `FECHA,DESCRIPCIÓN,CARGO,ABONO,SALDO,REFERENCIA
15/09/2026,SPEI RECIBIDO OXXO FACT F-100,,15000.00,15000.00,0012345678
16/09/2026,COMISION,250.00,,14750.00,
17/09/2026,SPEI RECIBIDO TORTAS LUPITA,,8500.00,23250.00,
`;

interface MakeSupabaseOpts {
  orgRow?: { id: string; bank_reconciliation_enabled: boolean } | null;
  downloadBlob?: { arrayBuffer: () => Promise<ArrayBuffer> } | null;
  downloadError?: { message: string } | null;
  cfdiRows?: Array<Record<string, unknown>>;
  uploadError?: { message: string } | null;
  insertedBatchId?: string | null;
  insertError?: { message: string } | null;
}

function makeSupabase(opts: MakeSupabaseOpts = {}) {
  const {
    orgRow = { id: 'org-1', bank_reconciliation_enabled: true },
    downloadBlob = {
      arrayBuffer: () => Promise.resolve(new TextEncoder().encode(BBVA_CSV).buffer as ArrayBuffer),
    },
    downloadError = null,
    cfdiRows = [],
    uploadError = null,
    insertedBatchId = 'batch-1',
    insertError = null,
  } = opts;

  const storage = {
    from: vi.fn(() => storage),
    download: vi.fn(() => Promise.resolve({ data: downloadBlob, error: downloadError })),
    upload: vi.fn(() => Promise.resolve({ data: { path: 'uploaded' }, error: uploadError })),
  };

  const api: Record<string, unknown> = {};
  let currentTable = '';

  api.from = vi.fn((table: string) => {
    currentTable = table;
    return api;
  });
  api.select = vi.fn(() => api);
  api.eq = vi.fn(() => api);
  api.is = vi.fn(() => api);
  api.gte = vi.fn(() => api);
  api.lte = vi.fn(() => api);
  api.maybeSingle = vi.fn(() => {
    if (currentTable === 'organizations') return Promise.resolve({ data: orgRow, error: null });
    return Promise.resolve({ data: null, error: null });
  });
  api.insert = vi.fn(() => api);
  // El select-after-insert devuelve el batch. Lo diferenciamos por el estado:
  // tras `.insert()`, `.select('id').single()` devuelve insertedBatchId.
  let afterInsert = false;
  const origInsert = api.insert as ReturnType<typeof vi.fn>;
  origInsert.mockImplementation(() => {
    afterInsert = true;
    return api;
  });
  api.single = vi.fn(() => {
    if (afterInsert) {
      afterInsert = false;
      if (insertError) return Promise.resolve({ data: null, error: insertError });
      return Promise.resolve({ data: { id: insertedBatchId }, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  });
  // Terminal thenable: cuando el SELECT a centinelia_billing termina en `.lte()`
  // sin maybeSingle/single, el await consume `then`.
  (api as unknown as { then: unknown }).then = (resolve: (v: unknown) => void) => {
    if (currentTable === 'centinelia_billing') {
      resolve({ data: cfdiRows, error: null });
    } else {
      resolve({ data: null, error: null });
    }
  };

  return { ...api, storage } as unknown as Parameters<typeof runConciliarEstadoCuenta>[1]['supabase'];
}

function makeCtx(overrides: Partial<Parameters<typeof runConciliarEstadoCuenta>[1]> = {}) {
  return {
    agentId: 'agent-nalu',
    portalEmail: 'tortilleria@test.mx',
    supabase: makeSupabase(),
    channel: 'chat' as const,
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('runConciliarEstadoCuenta', () => {
  it('rechaza si no viene attachment_storage_path', async () => {
    const res = await runConciliarEstadoCuenta({}, makeCtx());
    expect(res.ok).toBe(false);
    expect(res.error).toContain('attachment_storage_path');
  });

  it('rechaza si la organización no existe', async () => {
    const res = await runConciliarEstadoCuenta(
      { attachment_storage_path: 'bank/x.csv' },
      makeCtx({ supabase: makeSupabase({ orgRow: null }) }),
    );
    expect(res.ok).toBe(false);
    expect(res.error).toContain('organización');
  });

  it('rechaza si el feature flag está apagado', async () => {
    const res = await runConciliarEstadoCuenta(
      { attachment_storage_path: 'bank/x.csv' },
      makeCtx({
        supabase: makeSupabase({
          orgRow: { id: 'org-1', bank_reconciliation_enabled: false },
        }),
      }),
    );
    expect(res.ok).toBe(false);
    expect(res.error).toContain('no está activa');
  });

  it('rechaza si no puede descargar el archivo', async () => {
    const res = await runConciliarEstadoCuenta(
      { attachment_storage_path: 'bank/missing.csv' },
      makeCtx({
        supabase: makeSupabase({
          downloadBlob: null,
          downloadError: { message: 'not found' },
        }),
      }),
    );
    expect(res.ok).toBe(false);
    expect(res.error).toContain('No pude descargar');
  });

  it('rechaza si el archivo no es formato reconocido', async () => {
    const res = await runConciliarEstadoCuenta(
      { attachment_storage_path: 'bank/basura.csv' },
      makeCtx({
        supabase: makeSupabase({
          downloadBlob: {
            arrayBuffer: () => Promise.resolve(new TextEncoder().encode('basura total\nsin header').buffer as ArrayBuffer),
          },
        }),
      }),
    );
    expect(res.ok).toBe(false);
    expect(res.error).toContain('No reconocí');
  });

  it('happy path: 2 txns, 1 CFDI que matchea → auto + batch creado + 1 op cobrada', async () => {
    const cfdiRows = [
      {
        uuid_fiscal: 'cfdi-uuid-100',
        folio: 'F-100',
        total: 15000,
        fecha_emision: '2026-09-15',
        metodo_pago_cfdi: 'PUE',
        cliente_rfc: 'OXX010101AAA',
        cliente_razon_social: 'OXXO SA',
      },
    ];
    const res = await runConciliarEstadoCuenta(
      { attachment_storage_path: 'bank/estado.csv' },
      makeCtx({ supabase: makeSupabase({ cfdiRows }) }),
    );
    expect(res.ok).toBe(true);
    expect(res.batch_id).toBe('batch-1');
    expect(res.totals?.auto).toBe(1);
    // 2 credits (15000 + 8500), 1 debit (250 filtrado). total procesados = 2
    expect(res.totals?.txns).toBe(2);
    expect(res.result_file_path).toContain('bank-reconciliations/');
    expect(res.message).toContain('match automático');
    expect(consumeAiOp).toHaveBeenCalledTimes(1);
    expect(consumeAiOp).toHaveBeenCalledWith(
      'agent-nalu',
      1,
      expect.objectContaining({
        reason: 'tool_execution',
        reference_id: 'batch-1',
      }),
    );
  });

  it('respeta bank_hint cuando se provee', async () => {
    const res = await runConciliarEstadoCuenta(
      { attachment_storage_path: 'bank/x.csv', bank_hint: 'bbva' },
      makeCtx({ supabase: makeSupabase({ cfdiRows: [] }) }),
    );
    expect(res.ok).toBe(true);
    expect(res.totals?.unmatched).toBeGreaterThan(0); // sin CFDIs
  });

  it('rechaza bank_hint inválido silenciosamente (auto-detect)', async () => {
    const res = await runConciliarEstadoCuenta(
      { attachment_storage_path: 'bank/x.csv', bank_hint: 'santander' as unknown },
      makeCtx({ supabase: makeSupabase({ cfdiRows: [] }) }),
    );
    // bank_hint inválido se ignora → autodetect → BBVA detectado
    expect(res.ok).toBe(true);
  });

  it('propaga error de upload', async () => {
    const res = await runConciliarEstadoCuenta(
      { attachment_storage_path: 'bank/x.csv' },
      makeCtx({
        supabase: makeSupabase({ uploadError: { message: 'bucket full' } }),
      }),
    );
    expect(res.ok).toBe(false);
    expect(res.error).toContain('bucket full');
  });

  it('propaga error del insert del batch', async () => {
    const res = await runConciliarEstadoCuenta(
      { attachment_storage_path: 'bank/x.csv' },
      makeCtx({
        supabase: makeSupabase({ insertError: { message: 'FK violation' } }),
      }),
    );
    expect(res.ok).toBe(false);
    expect(res.error).toContain('FK violation');
  });
});
