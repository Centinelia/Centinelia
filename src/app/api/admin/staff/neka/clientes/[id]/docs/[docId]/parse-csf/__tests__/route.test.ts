/**
 * Tests del endpoint POST /parse-csf. Cubre auth, validaciones (tipo=csf,
 * mime=pdf), fallback cuando el parser no detecta nada, y happy path.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockIsAdmin, mockParseCsfPdf, mockSupabaseFrom, mockStorageFrom } = vi.hoisted(() => ({
  mockIsAdmin:      vi.fn(),
  mockParseCsfPdf:  vi.fn(),
  mockSupabaseFrom: vi.fn(),
  mockStorageFrom:  vi.fn(),
}));

vi.mock('@/lib/admin/auth', () => ({
  isAdmin: (...args: unknown[]) => mockIsAdmin(...args),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from:    mockSupabaseFrom,
    storage: { from: mockStorageFrom },
  }),
}));

vi.mock('@/lib/billing/csf-parser', () => ({
  parseCsfPdf: (...args: unknown[]) => mockParseCsfPdf(...args),
}));

import { POST } from '../route';

function installSupabase(fetchResult: { data: unknown; error: unknown }) {
  mockSupabaseFrom.mockImplementation(() => ({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(fetchResult),
      }),
    }),
  }));
}

function installStorage(dlResult: { data: unknown; error: unknown }) {
  mockStorageFrom.mockImplementation(() => ({
    download: vi.fn().mockResolvedValue(dlResult),
  }));
}

const csfDoc = {
  id: 'doc-csf-1', tipo: 'csf' as const, label: 'CSF',
  storage_path: 'cli-1/doc-csf-1-x.pdf', mime_type: 'application/pdf',
  size_bytes: 500, uploaded_at: '2026-09-15T00:00:00Z',
};

function makeReq(): NextRequest {
  return new NextRequest('http://localhost/x', { method: 'POST' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsAdmin.mockResolvedValue(true);
  installStorage({ data: new Blob([new Uint8Array([1, 2, 3])]), error: null });
});

describe('POST /parse-csf', () => {
  it('401 sin admin', async () => {
    mockIsAdmin.mockResolvedValueOnce(false);
    installSupabase({ data: { docs: [csfDoc] }, error: null });
    const res = await POST(makeReq(), { params: Promise.resolve({ id: 'cli-1', docId: 'doc-csf-1' }) });
    expect(res.status).toBe(401);
  });

  it('404 cuando el cliente no existe', async () => {
    installSupabase({ data: null, error: { message: 'no rows' } });
    const res = await POST(makeReq(), { params: Promise.resolve({ id: 'cli-x', docId: 'doc-csf-1' }) });
    expect(res.status).toBe(404);
  });

  it('404 cuando el docId no esta en el array', async () => {
    installSupabase({ data: { docs: [] }, error: null });
    const res = await POST(makeReq(), { params: Promise.resolve({ id: 'cli-1', docId: 'doc-inexistente' }) });
    expect(res.status).toBe(404);
  });

  it('400 cuando el doc no es tipo csf', async () => {
    installSupabase({ data: { docs: [{ ...csfDoc, tipo: 'contrato' }] }, error: null });
    const res = await POST(makeReq(), { params: Promise.resolve({ id: 'cli-1', docId: 'doc-csf-1' }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('wrong_tipo');
  });

  it('400 cuando el doc no es PDF', async () => {
    installSupabase({ data: { docs: [{ ...csfDoc, mime_type: 'image/jpeg' }] }, error: null });
    const res = await POST(makeReq(), { params: Promise.resolve({ id: 'cli-1', docId: 'doc-csf-1' }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('wrong_mime');
  });

  it('422 cuando el parser regresa null (PDF escaneado o corrupto)', async () => {
    installSupabase({ data: { docs: [csfDoc] }, error: null });
    mockParseCsfPdf.mockResolvedValueOnce(null);
    const res = await POST(makeReq(), { params: Promise.resolve({ id: 'cli-1', docId: 'doc-csf-1' }) });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe('parse_failed');
  });

  it('500 cuando storage.download falla', async () => {
    installSupabase({ data: { docs: [csfDoc] }, error: null });
    installStorage({ data: null, error: { message: 'expired' } });
    const res = await POST(makeReq(), { params: Promise.resolve({ id: 'cli-1', docId: 'doc-csf-1' }) });
    expect(res.status).toBe(500);
  });

  it('200 con extracted cuando todo va bien', async () => {
    installSupabase({ data: { docs: [csfDoc] }, error: null });
    mockParseCsfPdf.mockResolvedValueOnce({
      rfc: 'TEN010518AL3', razon_social: 'X', regimen_fiscal: '601',
      regimen_label: 'General', cp: '66470', raw_text_length: 500,
      parsed_at: '2026-09-15T00:00:00Z',
    });
    const res = await POST(makeReq(), { params: Promise.resolve({ id: 'cli-1', docId: 'doc-csf-1' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.extracted.rfc).toBe('TEN010518AL3');
    expect(body.extracted.regimen_fiscal).toBe('601');
  });
});
