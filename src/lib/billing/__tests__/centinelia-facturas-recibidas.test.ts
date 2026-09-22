/**
 * Tests del helper de facturas recibidas (proveedor a Centinelia, gastos
 * deducibles). Tabla centinelia_facturas_recibidas + archivos en bucket
 * centinelia-clientes-docs bajo prefix "recibidas/{id}/".
 *
 * Cubre: createFacturaRecibida (parsea XML, INSERT), storageKeyForRecibida
 * (path convention), uploadRecibidaFiles (XML+PDF + rollback), update
 * (categoria/deducible/notas), delete.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  createFacturaRecibida,
  uploadRecibidaFiles,
  updateFacturaRecibida,
  deleteFacturaRecibida,
  storageKeyForRecibida,
} from '../centinelia-facturas-recibidas';

const tortilleriaXml = readFileSync(
  join(__dirname, 'fixtures', 'tortilleria-2026-09-21.xml'),
  'utf-8',
);

interface MockOverrides {
  insertResult?: { data: unknown; error: unknown };
  fetchResult?:  { data: unknown; error: unknown };
  updateResult?: { data: unknown; error: unknown };
  deleteResult?: { data: unknown; error: unknown };
  uploadResult?: { data: unknown; error: unknown };
  removeResult?: { data: unknown; error: unknown };
}

function makeSupabase(overrides: MockOverrides = {}) {
  const from = vi.fn().mockImplementation((_: string) => {
    const insertChain = {
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(overrides.insertResult ?? { data: { id: 'rec-1' }, error: null }),
      }),
    };
    const updateChain = {
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue(overrides.updateResult ?? { data: { id: 'rec-1', categoria_gasto: 'renta' }, error: null }),
        }),
      }),
    };
    const deleteChain = {
      eq: vi.fn().mockResolvedValue(overrides.deleteResult ?? { data: null, error: null }),
    };
    const selectChain = {
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(overrides.fetchResult ?? { data: null, error: null }),
      }),
    };
    return {
      insert: vi.fn().mockReturnValue(insertChain),
      update: vi.fn().mockReturnValue(updateChain),
      delete: vi.fn().mockReturnValue(deleteChain),
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

const pdfContent = Buffer.from('%PDF-1.4 fake');

beforeEach(() => vi.clearAllMocks());

describe('storageKeyForRecibida', () => {
  it('agrupa bajo prefix recibidas/{id}/', () => {
    expect(storageKeyForRecibida({ facturaId: 'abc-123', kind: 'xml' })).toBe('recibidas/abc-123/factura.xml');
    expect(storageKeyForRecibida({ facturaId: 'abc-123', kind: 'pdf' })).toBe('recibidas/abc-123/factura.pdf');
  });
});

describe('createFacturaRecibida', () => {
  it('parsea el XML y arma el row con RFC emisor, montos, UUID', async () => {
    const supabase = makeSupabase({
      insertResult: { data: { id: 'rec-1', rfc_emisor: 'AAMN951208I25', uuid_fiscal: 'A1FC4F3A-F870-4F14-B6C6-958687605B4D' }, error: null },
    });

    const result = await createFacturaRecibida({
      xmlContent: tortilleriaXml,
      uploadedBy: 'nazre20@gmail.com',
    }, supabase);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.factura.id).toBe('rec-1');
    expect(supabase._from).toHaveBeenCalledWith('centinelia_facturas_recibidas');
  });

  it('regresa error si el XML es invalido', async () => {
    const result = await createFacturaRecibida({
      xmlContent: '<foo/>',
      uploadedBy: 'x',
    }, makeSupabase());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('xml_invalido');
  });

  it('permite categoria y deducible en el input', async () => {
    const supabase = makeSupabase({
      insertResult: { data: { id: 'rec-1', categoria_gasto: 'renta', deducible: true }, error: null },
    });

    const result = await createFacturaRecibida({
      xmlContent: tortilleriaXml,
      uploadedBy: 'nazre20@gmail.com',
      categoriaGasto: 'renta',
      deducible: false,
    }, supabase);

    expect(result.ok).toBe(true);
  });
});

describe('uploadRecibidaFiles', () => {
  it('sube XML y PDF a paths bajo recibidas/{id}/', async () => {
    const supabase = makeSupabase();

    const result = await uploadRecibidaFiles({
      facturaId:  'rec-1',
      xmlContent: Buffer.from('<?xml version="1.0"?>'),
      pdfContent,
    }, supabase);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.xmlPath).toBe('recibidas/rec-1/factura.xml');
    expect(result.pdfPath).toBe('recibidas/rec-1/factura.pdf');
  });

  it('rollback si el update falla', async () => {
    const supabase = makeSupabase({
      updateResult: { data: null, error: { message: 'update falló' } },
    });

    const result = await uploadRecibidaFiles({
      facturaId:  'rec-1',
      xmlContent: Buffer.from('<?xml version="1.0"?>'),
      pdfContent,
    }, supabase);

    expect(result.ok).toBe(false);
  });
});

describe('updateFacturaRecibida', () => {
  it('actualiza categoria_gasto, deducible y notas', async () => {
    const supabase = makeSupabase({
      updateResult: { data: { id: 'rec-1', categoria_gasto: 'hosting', deducible: true, notas: 'servidor centinelia' }, error: null },
    });

    const result = await updateFacturaRecibida('rec-1', {
      categoriaGasto: 'hosting',
      deducible:      true,
      notas:          'servidor centinelia',
    }, supabase);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.factura.categoria_gasto).toBe('hosting');
  });
});

describe('deleteFacturaRecibida', () => {
  it('borra el row + intenta borrar archivos del bucket (best effort)', async () => {
    const supabase = makeSupabase({
      fetchResult: { data: { id: 'rec-1', xml_storage_path: 'recibidas/rec-1/factura.xml', pdf_storage_path: 'recibidas/rec-1/factura.pdf' }, error: null },
    });

    const result = await deleteFacturaRecibida('rec-1', supabase);

    expect(result.ok).toBe(true);
    expect(supabase._storageFrom).toHaveBeenCalledWith('centinelia-clientes-docs');
  });

  it('regresa not_found si el row no existe', async () => {
    const supabase = makeSupabase({
      fetchResult: { data: null, error: { message: 'no row' } },
    });

    const result = await deleteFacturaRecibida('rec-x', supabase);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('not_found');
  });
});
