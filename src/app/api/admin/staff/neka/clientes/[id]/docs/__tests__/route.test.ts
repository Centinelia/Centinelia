/**
 * Tests para los 3 endpoints de docs por cliente:
 *   POST   /api/admin/staff/neka/clientes/[id]/docs
 *   DELETE /api/admin/staff/neka/clientes/[id]/docs/[docId]
 *   GET    /api/admin/staff/neka/clientes/[id]/docs/[docId]/url
 *
 * Cubre auth gate (401), validaciones de POST (file/tipo/label), y el
 * mapeo de codigos de error del helper a status HTTP (400 vs 404 vs 500).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockIsAdmin,
  mockUploadClienteDoc,
  mockDeleteClienteDoc,
  mockGetClienteDocSignedUrl,
} = vi.hoisted(() => ({
  mockIsAdmin:                vi.fn(),
  mockUploadClienteDoc:       vi.fn(),
  mockDeleteClienteDoc:       vi.fn(),
  mockGetClienteDocSignedUrl: vi.fn(),
}));

vi.mock('@/lib/admin/auth', () => ({
  isAdmin: (...args: unknown[]) => mockIsAdmin(...args),
}));

vi.mock('@/lib/billing/centinelia-clientes-docs', async () => {
  const actual = await vi.importActual<typeof import('@/lib/billing/centinelia-clientes-docs')>(
    '@/lib/billing/centinelia-clientes-docs',
  );
  return {
    ...actual,
    uploadClienteDoc:       (...args: unknown[]) => mockUploadClienteDoc(...args),
    deleteClienteDoc:       (...args: unknown[]) => mockDeleteClienteDoc(...args),
    getClienteDocSignedUrl: (...args: unknown[]) => mockGetClienteDocSignedUrl(...args),
  };
});

import { POST } from '../route';
import { DELETE } from '../[docId]/route';
import { GET }    from '../[docId]/url/route';

function makeFormRequest(fields: Record<string, string | File>): NextRequest {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return new NextRequest('http://localhost/api/admin/staff/neka/clientes/cli-1/docs', {
    method: 'POST',
    body:   form as unknown as BodyInit,
  });
}

function pdfFile(bytes = 100): File {
  return new File([new Uint8Array(bytes)], 'CSF.pdf', { type: 'application/pdf' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsAdmin.mockResolvedValue(true);
});

describe('POST /clientes/[id]/docs — auth', () => {
  it('401 sin cookie admin', async () => {
    mockIsAdmin.mockResolvedValueOnce(false);
    const res = await POST(makeFormRequest({ file: pdfFile(), tipo: 'csf', label: 'X' }), { params: Promise.resolve({ id: 'cli-1' }) });
    expect(res.status).toBe(401);
  });
});

describe('POST — validaciones', () => {
  it('400 sin file', async () => {
    const res = await POST(makeFormRequest({ tipo: 'csf', label: 'X' }), { params: Promise.resolve({ id: 'cli-1' }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('file');
  });

  it('400 con tipo invalido', async () => {
    const res = await POST(makeFormRequest({ file: pdfFile(), tipo: 'invento', label: 'X' }), { params: Promise.resolve({ id: 'cli-1' }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('tipo');
  });

  it('400 sin label', async () => {
    const res = await POST(makeFormRequest({ file: pdfFile(), tipo: 'csf', label: '' }), { params: Promise.resolve({ id: 'cli-1' }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('label');
  });

  it('400 con label demasiado largo', async () => {
    const res = await POST(makeFormRequest({ file: pdfFile(), tipo: 'csf', label: 'a'.repeat(200) }), { params: Promise.resolve({ id: 'cli-1' }) });
    expect(res.status).toBe(400);
  });
});

describe('POST — happy path + mapeo de errores', () => {
  it('200 con doc creado + llama al helper con args correctos', async () => {
    mockUploadClienteDoc.mockResolvedValueOnce({
      ok:  true,
      doc: {
        id: 'doc-new', tipo: 'csf', label: 'CSF 2026',
        storage_path: 'cli-1/doc-new-CSF.pdf', mime_type: 'application/pdf',
        size_bytes: 100, uploaded_at: '2026-09-15T00:00:00Z',
      },
    });

    const res = await POST(makeFormRequest({ file: pdfFile(500), tipo: 'csf', label: 'CSF 2026' }), { params: Promise.resolve({ id: 'cli-1' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.doc.id).toBe('doc-new');

    const arg = mockUploadClienteDoc.mock.calls[0][0] as { clienteId: string; tipo: string; label: string };
    expect(arg.clienteId).toBe('cli-1');
    expect(arg.tipo).toBe('csf');
    expect(arg.label).toBe('CSF 2026');
  });

  it('400 cuando helper regresa invalid_mime', async () => {
    mockUploadClienteDoc.mockResolvedValueOnce({ ok: false, code: 'invalid_mime', message: 'nope' });
    const res = await POST(makeFormRequest({ file: pdfFile(), tipo: 'csf', label: 'X' }), { params: Promise.resolve({ id: 'cli-1' }) });
    expect(res.status).toBe(400);
  });

  it('400 cuando helper regresa too_large', async () => {
    mockUploadClienteDoc.mockResolvedValueOnce({ ok: false, code: 'too_large', message: 'big' });
    const res = await POST(makeFormRequest({ file: pdfFile(), tipo: 'csf', label: 'X' }), { params: Promise.resolve({ id: 'cli-1' }) });
    expect(res.status).toBe(400);
  });

  it('500 cuando helper regresa storage_error', async () => {
    mockUploadClienteDoc.mockResolvedValueOnce({ ok: false, code: 'storage_error', message: 'quota' });
    const res = await POST(makeFormRequest({ file: pdfFile(), tipo: 'csf', label: 'X' }), { params: Promise.resolve({ id: 'cli-1' }) });
    expect(res.status).toBe(500);
  });
});

describe('DELETE /clientes/[id]/docs/[docId]', () => {
  it('401 sin admin', async () => {
    mockIsAdmin.mockResolvedValueOnce(false);
    const res = await DELETE(new NextRequest('http://localhost/x', { method: 'DELETE' }), { params: Promise.resolve({ id: 'cli-1', docId: 'd-1' }) });
    expect(res.status).toBe(401);
  });

  it('404 cuando helper regresa not_found', async () => {
    mockDeleteClienteDoc.mockResolvedValueOnce({ ok: false, code: 'not_found', message: 'x' });
    const res = await DELETE(new NextRequest('http://localhost/x', { method: 'DELETE' }), { params: Promise.resolve({ id: 'cli-1', docId: 'd-1' }) });
    expect(res.status).toBe(404);
  });

  it('200 y regresa el doc borrado', async () => {
    mockDeleteClienteDoc.mockResolvedValueOnce({
      ok: true,
      deleted: { id: 'd-1', tipo: 'csf', label: 'X', storage_path: 'p', mime_type: 'application/pdf', size_bytes: 1, uploaded_at: 'z' },
    });
    const res = await DELETE(new NextRequest('http://localhost/x', { method: 'DELETE' }), { params: Promise.resolve({ id: 'cli-1', docId: 'd-1' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted.id).toBe('d-1');
  });
});

describe('GET signed URL', () => {
  it('401 sin admin', async () => {
    mockIsAdmin.mockResolvedValueOnce(false);
    const res = await GET(new NextRequest('http://localhost/x'), { params: Promise.resolve({ id: 'cli-1', docId: 'd-1' }) });
    expect(res.status).toBe(401);
  });

  it('200 con url + expiresAt', async () => {
    mockGetClienteDocSignedUrl.mockResolvedValueOnce({ ok: true, url: 'https://sig/x', expiresAt: '2026-09-15T01:00:00Z' });
    const res = await GET(new NextRequest('http://localhost/x'), { params: Promise.resolve({ id: 'cli-1', docId: 'd-1' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe('https://sig/x');
  });

  it('respeta query param ttl (clamp 60-3600)', async () => {
    mockGetClienteDocSignedUrl.mockResolvedValueOnce({ ok: true, url: 'u', expiresAt: 'e' });
    await GET(new NextRequest('http://localhost/x?ttl=120'), { params: Promise.resolve({ id: 'cli-1', docId: 'd-1' }) });
    expect(mockGetClienteDocSignedUrl.mock.calls[0][2]).toBe(120);
  });

  it('clamp ttl arriba de 3600 a 3600', async () => {
    mockGetClienteDocSignedUrl.mockResolvedValueOnce({ ok: true, url: 'u', expiresAt: 'e' });
    await GET(new NextRequest('http://localhost/x?ttl=99999'), { params: Promise.resolve({ id: 'cli-1', docId: 'd-1' }) });
    expect(mockGetClienteDocSignedUrl.mock.calls[0][2]).toBe(3600);
  });

  it('404 cuando helper regresa not_found', async () => {
    mockGetClienteDocSignedUrl.mockResolvedValueOnce({ ok: false, code: 'not_found', message: 'no' });
    const res = await GET(new NextRequest('http://localhost/x'), { params: Promise.resolve({ id: 'cli-1', docId: 'd-1' }) });
    expect(res.status).toBe(404);
  });
});
