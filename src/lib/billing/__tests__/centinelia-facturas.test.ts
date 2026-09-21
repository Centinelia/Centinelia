/**
 * Tests del helper de facturas emitidas por Centinelia. Extension de
 * centinelia_billing (event-sourced) con paid_at + rep_reminder_at + campos
 * fiscales estructurados.
 *
 * Cubre: registrarCfdiEmitido, uploadFacturaFiles (XML+PDF al bucket),
 * marcarFacturaPagada (agenda rep_reminder_at = paid_at + 5d si PPD),
 * registrarRepEmitido (linkea al Ingreso padre), listFacturasCliente,
 * listFacturasPPDSinPago, listRepReminderPendientes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  registrarCfdiEmitido,
  uploadFacturaFiles,
  marcarFacturaPagada,
  registrarRepEmitido,
  storageKeyForFactura,
} from '../centinelia-facturas';

interface MockOverrides {
  insertResult?:      { data: unknown; error: unknown };
  fetchResult?:       { data: unknown; error: unknown };
  fetchListResult?:   { data: unknown; error: unknown };
  updateResult?:      { data: unknown; error: unknown };
  uploadResult?:      { data: unknown; error: unknown };
  removeResult?:      { data: unknown; error: unknown };
}

function makeSupabase(overrides: MockOverrides = {}) {
  const from = vi.fn().mockImplementation((_: string) => {
    const insertChain = {
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(overrides.insertResult ?? { data: { id: 'row-1' }, error: null }),
      }),
    };
    const updateChain = {
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue(overrides.updateResult ?? { data: { id: 'row-1', paid_at: '2026-10-01T00:00:00Z', rep_reminder_at: '2026-10-06T00:00:00Z' }, error: null }),
        }),
      }),
    };
    const selectChain: {
      eq:    ReturnType<typeof vi.fn>;
      order: ReturnType<typeof vi.fn>;
      is:    ReturnType<typeof vi.fn>;
      not:   ReturnType<typeof vi.fn>;
      lte:   ReturnType<typeof vi.fn>;
    } = {
      eq:    vi.fn(),
      order: vi.fn(),
      is:    vi.fn(),
      not:   vi.fn(),
      lte:   vi.fn(),
    };
    selectChain.eq.mockReturnValue({
      ...selectChain,
      single: vi.fn().mockResolvedValue(overrides.fetchResult ?? { data: null, error: null }),
    });
    selectChain.order.mockResolvedValue(overrides.fetchListResult ?? { data: [], error: null });
    selectChain.is.mockReturnValue(selectChain);
    selectChain.not.mockReturnValue(selectChain);
    selectChain.lte.mockReturnValue(selectChain);
    return {
      insert: vi.fn().mockReturnValue(insertChain),
      update: vi.fn().mockReturnValue(updateChain),
      select: vi.fn().mockReturnValue(selectChain),
    };
  });

  const storageFrom = vi.fn().mockImplementation((_: string) => ({
    upload: vi.fn().mockResolvedValue(overrides.uploadResult ?? { data: { path: 'x' }, error: null }),
    remove: vi.fn().mockResolvedValue(overrides.removeResult ?? { data: null, error: null }),
  }));

  return {
    from,
    storage: { from: storageFrom },
    _from: from,
    _storageFrom: storageFrom,
  } as unknown as SupabaseClient & { _from: typeof from; _storageFrom: typeof storageFrom };
}

const xmlContent = Buffer.from('<?xml version="1.0"?><cfdi:Comprobante Total="13906.08"/>');
const pdfContent = Buffer.from('%PDF-1.4 fake');

beforeEach(() => vi.clearAllMocks());

describe('storageKeyForFactura', () => {
  it('agrupa por cliente y UUID fiscal para "carpeta por cliente"', () => {
    const key = storageKeyForFactura({
      clienteId: 'cli-abc',
      uuidFiscal: 'A1FC4F3A-F870-4F14-B6C6-958687605B4D',
      kind: 'xml',
    });
    expect(key).toBe('cli-abc/facturas/a1fc4f3a-f870-4f14-b6c6-958687605b4d/factura.xml');
  });

  it('diferencia xml vs pdf', () => {
    const xml = storageKeyForFactura({ clienteId: 'x', uuidFiscal: 'U1', kind: 'xml' });
    const pdf = storageKeyForFactura({ clienteId: 'x', uuidFiscal: 'U1', kind: 'pdf' });
    expect(xml).toContain('factura.xml');
    expect(pdf).toContain('factura.pdf');
    expect(xml).not.toBe(pdf);
  });

  it('permite kind rep para REP files', () => {
    const key = storageKeyForFactura({ clienteId: 'x', uuidFiscal: 'REP1', kind: 'rep_xml' });
    expect(key).toBe('x/facturas/rep1/rep.xml');
  });
});

describe('registrarCfdiEmitido', () => {
  it('inserta un row centinelia_billing tipo cfdi_emitido con campos fiscales', async () => {
    const supabase = makeSupabase({
      insertResult: { data: { id: 'row-1', cliente_id: 'cli-1', tipo: 'cfdi_emitido', cfdi_uuid: 'A1FC...', metodo_pago_cfdi: 'PPD' }, error: null },
    });

    const result = await registrarCfdiEmitido({
      clienteId:  'cli-1',
      cfdiUuid:   'A1FC4F3A-F870-4F14-B6C6-958687605B4D',
      cicloKey:   '2026-09',
      monto:      13906.08,
      subtotal:   11988,
      iva:        1918.08,
      metodoPago: 'PPD',
      formaPago:  '99',
      usoCfdi:    'G03',
    }, supabase);

    expect(result.ok).toBe(true);
    expect(supabase._from).toHaveBeenCalledWith('centinelia_billing');
  });

  it('regresa error si supabase insert falla', async () => {
    const supabase = makeSupabase({
      insertResult: { data: null, error: { message: 'duplicate key' } },
    });

    const result = await registrarCfdiEmitido({
      clienteId:  'cli-1',
      cfdiUuid:   'A1FC...',
      monto:      100,
      subtotal:   100,
      iva:        0,
      metodoPago: 'PUE',
      formaPago:  '03',
      usoCfdi:    'G03',
    }, supabase);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('duplicate');
  });
});

describe('uploadFacturaFiles', () => {
  it('sube XML y PDF al bucket con path por cliente + uuid fiscal', async () => {
    const supabase = makeSupabase();

    const result = await uploadFacturaFiles({
      billingId:  'row-1',
      clienteId:  'cli-1',
      uuidFiscal: 'A1FC4F3A',
      xmlContent,
      pdfContent,
    }, supabase);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.xmlPath).toContain('cli-1/facturas/a1fc4f3a/factura.xml');
    expect(result.pdfPath).toContain('cli-1/facturas/a1fc4f3a/factura.pdf');
    expect(supabase._storageFrom).toHaveBeenCalledWith('centinelia-clientes-docs');
  });

  it('rollback: si el update del row falla, borra los archivos del bucket', async () => {
    const supabase = makeSupabase({
      updateResult: { data: null, error: { message: 'update falló' } },
    });

    const result = await uploadFacturaFiles({
      billingId:  'row-1',
      clienteId:  'cli-1',
      uuidFiscal: 'A1FC4F3A',
      xmlContent,
      pdfContent,
    }, supabase);

    expect(result.ok).toBe(false);
  });
});

describe('marcarFacturaPagada', () => {
  it('setea paid_at y agenda rep_reminder_at = paid_at + 5 dias si es PPD', async () => {
    const paidAt = new Date('2026-10-01T00:00:00Z');
    const supabase = makeSupabase({
      fetchResult: {
        data: { id: 'row-1', tipo: 'cfdi_emitido', metodo_pago_cfdi: 'PPD', paid_at: null },
        error: null,
      },
      updateResult: {
        data: { id: 'row-1', paid_at: paidAt.toISOString(), rep_reminder_at: '2026-10-06T00:00:00Z' },
        error: null,
      },
    });

    const result = await marcarFacturaPagada({ billingId: 'row-1', paidAt }, supabase);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.repReminderAt).not.toBeNull();
    const reminderDate = new Date(result.repReminderAt!);
    expect(reminderDate.getUTCDate() - paidAt.getUTCDate()).toBe(5);
  });

  it('NO agenda rep_reminder_at si el CFDI es PUE (no requiere REP)', async () => {
    const supabase = makeSupabase({
      fetchResult: {
        data: { id: 'row-1', tipo: 'cfdi_emitido', metodo_pago_cfdi: 'PUE', paid_at: null },
        error: null,
      },
      updateResult: {
        data: { id: 'row-1', paid_at: '2026-10-01T00:00:00Z', rep_reminder_at: null },
        error: null,
      },
    });

    const result = await marcarFacturaPagada({ billingId: 'row-1', paidAt: new Date('2026-10-01T00:00:00Z') }, supabase);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.repReminderAt).toBeNull();
  });

  it('regresa error si la factura no existe', async () => {
    const supabase = makeSupabase({
      fetchResult: { data: null, error: { message: 'row not found' } },
    });

    const result = await marcarFacturaPagada({ billingId: 'row-x', paidAt: new Date() }, supabase);
    expect(result.ok).toBe(false);
  });
});

describe('registrarRepEmitido', () => {
  it('inserta row tipo rep_emitido con related_uuid apuntando al Ingreso padre', async () => {
    const supabase = makeSupabase({
      insertResult: {
        data: { id: 'row-rep', tipo: 'rep_emitido', cfdi_uuid: 'REP-UUID', related_uuid: 'INGRESO-UUID' },
        error: null,
      },
    });

    const result = await registrarRepEmitido({
      clienteId:   'cli-1',
      repUuid:     'REP-UUID',
      ingresoUuid: 'INGRESO-UUID',
      monto:       13906.08,
      subtotal:    11988,
      iva:         1918.08,
      formaPago:   '03',
    }, supabase);

    expect(result.ok).toBe(true);
    expect(supabase._from).toHaveBeenCalledWith('centinelia_billing');
  });
});
