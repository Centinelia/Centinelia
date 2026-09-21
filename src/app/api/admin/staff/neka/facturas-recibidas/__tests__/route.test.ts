/**
 * Tests de los 4 endpoints de facturas recibidas:
 *   GET    /api/admin/staff/neka/facturas-recibidas
 *   POST   /api/admin/staff/neka/facturas-recibidas
 *   PATCH  /api/admin/staff/neka/facturas-recibidas/[id]
 *   DELETE /api/admin/staff/neka/facturas-recibidas/[id]
 *   GET    /api/admin/staff/neka/facturas-recibidas/[id]/url
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

const {
  mockIsAdmin,
  mockCreate,
  mockUpload,
  mockUpdate,
  mockDelete,
  mockList,
  mockSingle,
} = vi.hoisted(() => ({
  mockIsAdmin: vi.fn(),
  mockCreate:  vi.fn(),
  mockUpload:  vi.fn(),
  mockUpdate:  vi.fn(),
  mockDelete:  vi.fn(),
  mockList:    vi.fn(),
  mockSingle:  vi.fn(),
}));

vi.mock('@/lib/admin/auth', () => ({
  isAdmin: (...args: unknown[]) => mockIsAdmin(...args),
}));

vi.mock('@/lib/billing/centinelia-facturas-recibidas', async () => {
  const actual = await vi.importActual<typeof import('@/lib/billing/centinelia-facturas-recibidas')>(
    '@/lib/billing/centinelia-facturas-recibidas',
  );
  return {
    ...actual,
    createFacturaRecibida: (...args: unknown[]) => mockCreate(...args),
    uploadRecibidaFiles:   (...args: unknown[]) => mockUpload(...args),
    updateFacturaRecibida: (...args: unknown[]) => mockUpdate(...args),
    deleteFacturaRecibida: (...args: unknown[]) => mockDelete(...args),
  };
});

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq:    vi.fn().mockReturnThis(),
        gte:   vi.fn().mockReturnThis(),
        lte:   vi.fn().mockReturnThis(),
        order: vi.fn().mockImplementation(() => mockList()),
        single: vi.fn().mockImplementation(() => mockSingle()),
      }),
    }),
    storage: {
      from: vi.fn().mockReturnValue({
        createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://sig/x' }, error: null }),
      }),
    },
  }),
}));

import { GET, POST } from '../route';
import { PATCH, DELETE } from '../[id]/route';
import { GET as URL_GET } from '../[id]/url/route';

const tortilleriaXml = readFileSync(
  join(__dirname, '..', '..', '..', '..', '..', '..', '..', 'lib', 'billing', '__tests__', 'fixtures', 'tortilleria-2026-09-21.xml'),
  'utf-8',
);

function xmlFile(): File {
  return new File([tortilleriaXml], 'gasto.xml', { type: 'application/xml' });
}
function pdfFile(): File {
  return new File([new Uint8Array(200)], 'gasto.pdf', { type: 'application/pdf' });
}

function makeFormRequest(fields: Record<string, string | File>): NextRequest {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return new NextRequest('http://localhost/api/admin/staff/neka/facturas-recibidas', {
    method: 'POST',
    body:   form as unknown as BodyInit,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsAdmin.mockResolvedValue(true);
});

describe('GET /facturas-recibidas', () => {
  it('401 sin admin', async () => {
    mockIsAdmin.mockResolvedValueOnce(false);
    const res = await GET(new NextRequest('http://localhost/x'));
    expect(res.status).toBe(401);
  });

  it('200 con array facturas', async () => {
    mockList.mockResolvedValueOnce({ data: [{ id: 'rec-1', rfc_emisor: 'X' }], error: null });
    const res = await GET(new NextRequest('http://localhost/x'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.facturas)).toBe(true);
  });

  it('200 con todos los filtros combinados (deducible+from+to+rfc)', async () => {
    mockList.mockResolvedValueOnce({ data: [], error: null });
    const url = 'http://localhost/x?deducible=true&from=2026-01-01&to=2026-12-31&rfc=aamn951208i25';
    const res = await GET(new NextRequest(url));
    expect(res.status).toBe(200);
    expect(mockList).toHaveBeenCalledTimes(1);
  });

  it('500 si el query falla', async () => {
    mockList.mockResolvedValueOnce({ data: null, error: { message: 'db down' } });
    const res = await GET(new NextRequest('http://localhost/x'));
    expect(res.status).toBe(500);
  });
});

describe('POST /facturas-recibidas', () => {
  it('401 sin admin', async () => {
    mockIsAdmin.mockResolvedValueOnce(false);
    const res = await POST(makeFormRequest({ xml: xmlFile(), pdf: pdfFile() }));
    expect(res.status).toBe(401);
  });

  it('400 sin xml', async () => {
    const res = await POST(makeFormRequest({ pdf: pdfFile() }));
    expect(res.status).toBe(400);
  });

  it('400 sin pdf', async () => {
    const res = await POST(makeFormRequest({ xml: xmlFile() }));
    expect(res.status).toBe(400);
  });

  it('400 si create regresa xml_invalido', async () => {
    mockCreate.mockResolvedValueOnce({ ok: false, code: 'xml_invalido', message: 'malformed' });
    const res = await POST(makeFormRequest({ xml: xmlFile(), pdf: pdfFile() }));
    expect(res.status).toBe(400);
  });

  it('200 happy path: crea + sube', async () => {
    mockCreate.mockResolvedValueOnce({ ok: true, factura: { id: 'rec-1', rfc_emisor: 'AAMN951208I25' } });
    mockUpload.mockResolvedValueOnce({ ok: true, xmlPath: 'recibidas/rec-1/factura.xml', pdfPath: 'recibidas/rec-1/factura.pdf' });
    const res = await POST(makeFormRequest({ xml: xmlFile(), pdf: pdfFile(), categoriaGasto: 'hosting', deducible: 'true' }));
    expect(res.status).toBe(200);
    expect(mockCreate).toHaveBeenCalled();
    expect(mockUpload).toHaveBeenCalled();
  });
});

describe('PATCH /facturas-recibidas/[id]', () => {
  it('401 sin admin', async () => {
    mockIsAdmin.mockResolvedValueOnce(false);
    const req = new NextRequest('http://localhost/x', { method: 'PATCH', body: JSON.stringify({}) });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'rec-1' }) });
    expect(res.status).toBe(401);
  });

  it('404 cuando not_found', async () => {
    mockUpdate.mockResolvedValueOnce({ ok: false, code: 'not_found', message: 'x' });
    const req = new NextRequest('http://localhost/x', { method: 'PATCH', body: JSON.stringify({ categoriaGasto: 'renta' }) });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'rec-x' }) });
    expect(res.status).toBe(404);
  });

  it('200 con factura actualizada', async () => {
    mockUpdate.mockResolvedValueOnce({ ok: true, factura: { id: 'rec-1', categoria_gasto: 'renta' } });
    const req = new NextRequest('http://localhost/x', { method: 'PATCH', body: JSON.stringify({ categoriaGasto: 'renta' }) });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'rec-1' }) });
    expect(res.status).toBe(200);
  });
});

describe('DELETE /facturas-recibidas/[id]', () => {
  it('200 borra', async () => {
    mockDelete.mockResolvedValueOnce({ ok: true, deletedId: 'rec-1' });
    const req = new NextRequest('http://localhost/x', { method: 'DELETE' });
    const res = await DELETE(req, { params: Promise.resolve({ id: 'rec-1' }) });
    expect(res.status).toBe(200);
  });

  it('404 not found', async () => {
    mockDelete.mockResolvedValueOnce({ ok: false, code: 'not_found', message: 'x' });
    const req = new NextRequest('http://localhost/x', { method: 'DELETE' });
    const res = await DELETE(req, { params: Promise.resolve({ id: 'rec-x' }) });
    expect(res.status).toBe(404);
  });
});

describe('GET /facturas-recibidas/[id]/url', () => {
  it('400 sin kind valido', async () => {
    const res = await URL_GET(new NextRequest('http://localhost/x?kind=zzz'), { params: Promise.resolve({ id: 'rec-1' }) });
    expect(res.status).toBe(400);
  });

  it('404 si el row no existe', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'no row' } });
    const res = await URL_GET(new NextRequest('http://localhost/x?kind=xml'), { params: Promise.resolve({ id: 'rec-x' }) });
    expect(res.status).toBe(404);
  });

  it('200 con url firmada', async () => {
    mockSingle.mockResolvedValueOnce({ data: { xml_storage_path: 'recibidas/rec-1/factura.xml' }, error: null });
    const res = await URL_GET(new NextRequest('http://localhost/x?kind=xml'), { params: Promise.resolve({ id: 'rec-1' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe('https://sig/x');
  });
});
