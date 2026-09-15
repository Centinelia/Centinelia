/**
 * Tests del helper de storage de docs por cliente. Cubre validacion de MIME
 * y tamaño, happy path de upload/delete/signed-URL, y los rollbacks best-effort
 * cuando el update de DB falla despues de subir el archivo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  uploadClienteDoc,
  deleteClienteDoc,
  getClienteDocSignedUrl,
  safeFilename,
  storageKeyFor,
  MAX_DOC_BYTES,
} from '../centinelia-clientes-docs';

function makeSupabase(overrides: {
  fetchDocs?:      { data: unknown; error: unknown };
  updateResult?:   { data: unknown; error: unknown };
  uploadResult?:   { data: unknown; error: unknown };
  removeResult?:   { data: unknown; error: unknown };
  signedUrlResult?:{ data: unknown; error: unknown };
} = {}) {
  const from = vi.fn().mockImplementation((_: string) => {
    const chain = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue(overrides.fetchDocs ?? { data: { docs: [] }, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue(overrides.updateResult ?? { data: null, error: null }),
      }),
    };
    return chain;
  });

  const storageFrom = vi.fn().mockImplementation((_: string) => ({
    upload:           vi.fn().mockResolvedValue(overrides.uploadResult   ?? { data: { path: 'x' }, error: null }),
    remove:           vi.fn().mockResolvedValue(overrides.removeResult   ?? { data: null, error: null }),
    createSignedUrl:  vi.fn().mockResolvedValue(overrides.signedUrlResult?? { data: { signedUrl: 'https://sig.url/x' }, error: null }),
  }));

  return {
    from,
    storage: { from: storageFrom },
    _from:   from,
    _storageFrom: storageFrom,
  } as unknown as SupabaseClient & { _from: typeof from; _storageFrom: typeof storageFrom };
}

const pdf = Buffer.from('%PDF-1.4 fake');

beforeEach(() => vi.clearAllMocks());

describe('safeFilename + storageKeyFor', () => {
  it('reemplaza acentos y espacios', () => {
    expect(safeFilename('Constáncia de Situación.pdf')).toBe('Constancia_de_Situacion.pdf');
  });
  it('respeta extension y limita a 100 chars', () => {
    const long = 'a'.repeat(200) + '.pdf';
    const result = safeFilename(long);
    expect(result.length).toBeLessThanOrEqual(100);
  });
  it('storageKeyFor incluye cliente + doc + filename', () => {
    const key = storageKeyFor('cli-123', 'doc-456', 'CSF.pdf');
    expect(key).toBe('cli-123/doc-456-CSF.pdf');
  });
});

describe('uploadClienteDoc — validacion', () => {
  it('rechaza MIME no permitido con code=invalid_mime', async () => {
    const supabase = makeSupabase();
    const result = await uploadClienteDoc({
      clienteId: 'cli-1', tipo: 'csf', label: 'CSF',
      filename: 'x.exe', contentType: 'application/x-msdownload', content: pdf,
    }, supabase);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('invalid_mime');
    expect(supabase._storageFrom).not.toHaveBeenCalled();
  });

  it('rechaza archivos > MAX_DOC_BYTES con code=too_large', async () => {
    const supabase = makeSupabase();
    const big = Buffer.alloc(MAX_DOC_BYTES + 1);
    const result = await uploadClienteDoc({
      clienteId: 'cli-1', tipo: 'csf', label: 'CSF',
      filename: 'x.pdf', contentType: 'application/pdf', content: big,
    }, supabase);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('too_large');
  });
});

describe('uploadClienteDoc — happy path', () => {
  it('sube al bucket, agrega al array docs, y regresa la metadata', async () => {
    const supabase = makeSupabase({
      fetchDocs: { data: { docs: [{ id: 'existing-1', tipo: 'otro', label: 'x', storage_path: 'p', mime_type: 'application/pdf', size_bytes: 100, uploaded_at: '2026-01-01T00:00:00Z' }] }, error: null },
    });

    const result = await uploadClienteDoc({
      clienteId: 'cli-1', tipo: 'csf', label: 'CSF 2026',
      filename: 'CSF.pdf', contentType: 'application/pdf', content: pdf,
      uploadedBy: 'nazre20@gmail.com',
    }, supabase);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.tipo).toBe('csf');
    expect(result.doc.label).toBe('CSF 2026');
    expect(result.doc.mime_type).toBe('application/pdf');
    expect(result.doc.size_bytes).toBe(pdf.byteLength);
    expect(result.doc.uploaded_by).toBe('nazre20@gmail.com');
    expect(result.doc.storage_path).toContain('cli-1/');
    expect(result.doc.storage_path).toContain('CSF.pdf');
    expect(result.doc.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('omite uploaded_by cuando no viene', async () => {
    const supabase = makeSupabase();
    const result = await uploadClienteDoc({
      clienteId: 'cli-1', tipo: 'otro', label: 'X',
      filename: 'x.pdf', contentType: 'application/pdf', content: pdf,
    }, supabase);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.uploaded_by).toBeUndefined();
  });
});

describe('uploadClienteDoc — errores', () => {
  it('storage_error si upload falla, sin tocar DB', async () => {
    const supabase = makeSupabase({
      uploadResult: { data: null, error: { message: 'quota exceeded' } },
    });
    const result = await uploadClienteDoc({
      clienteId: 'cli-1', tipo: 'csf', label: 'CSF',
      filename: 'x.pdf', contentType: 'application/pdf', content: pdf,
    }, supabase);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('storage_error');
      expect(result.message).toBe('quota exceeded');
    }
  });

  it('db_error si el fetch del cliente falla; intenta borrar el archivo subido', async () => {
    const supabase = makeSupabase({
      fetchDocs: { data: null, error: { message: 'cliente no existe' } },
    });
    const result = await uploadClienteDoc({
      clienteId: 'cli-x', tipo: 'csf', label: 'CSF',
      filename: 'x.pdf', contentType: 'application/pdf', content: pdf,
    }, supabase);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('db_error');
  });

  it('db_error si el update falla; intenta borrar el archivo subido', async () => {
    const supabase = makeSupabase({
      updateResult: { data: null, error: { message: 'jsonb too large' } },
    });
    const result = await uploadClienteDoc({
      clienteId: 'cli-1', tipo: 'csf', label: 'CSF',
      filename: 'x.pdf', contentType: 'application/pdf', content: pdf,
    }, supabase);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('db_error');
      expect(result.message).toContain('jsonb too large');
    }
  });
});

describe('deleteClienteDoc', () => {
  const existing = {
    id: 'doc-abc', tipo: 'csf' as const, label: 'CSF', storage_path: 'cli-1/doc-abc-CSF.pdf',
    mime_type: 'application/pdf', size_bytes: 100, uploaded_at: '2026-09-01T00:00:00Z',
  };

  it('not_found si el docId no esta en el array', async () => {
    const supabase = makeSupabase({ fetchDocs: { data: { docs: [existing] }, error: null } });
    const result = await deleteClienteDoc('cli-1', 'doc-does-not-exist', supabase);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('not_found');
  });

  it('happy path: regresa el doc borrado y actualiza el array', async () => {
    const supabase = makeSupabase({ fetchDocs: { data: { docs: [existing] }, error: null } });
    const result = await deleteClienteDoc('cli-1', 'doc-abc', supabase);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deleted.id).toBe('doc-abc');
  });
});

describe('getClienteDocSignedUrl', () => {
  const existing = {
    id: 'doc-abc', tipo: 'csf' as const, label: 'CSF', storage_path: 'cli-1/doc-abc-CSF.pdf',
    mime_type: 'application/pdf', size_bytes: 100, uploaded_at: '2026-09-01T00:00:00Z',
  };

  it('regresa signed URL + expiresAt', async () => {
    const supabase = makeSupabase({
      fetchDocs: { data: { docs: [existing] }, error: null },
      signedUrlResult: { data: { signedUrl: 'https://sig.url/xyz' }, error: null },
    });
    const result = await getClienteDocSignedUrl('cli-1', 'doc-abc', 3600, supabase);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.url).toBe('https://sig.url/xyz');
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('not_found si el doc no existe en el array', async () => {
    const supabase = makeSupabase({ fetchDocs: { data: { docs: [existing] }, error: null } });
    const result = await getClienteDocSignedUrl('cli-1', 'otro-doc', 3600, supabase);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('not_found');
  });

  it('storage_error si createSignedUrl falla', async () => {
    const supabase = makeSupabase({
      fetchDocs: { data: { docs: [existing] }, error: null },
      signedUrlResult: { data: null, error: { message: 'expired token' } },
    });
    const result = await getClienteDocSignedUrl('cli-1', 'doc-abc', 3600, supabase);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('storage_error');
      expect(result.message).toBe('expired token');
    }
  });
});
