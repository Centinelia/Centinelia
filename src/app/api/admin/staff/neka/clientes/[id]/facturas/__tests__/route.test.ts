/**
 * Tests de los 4 endpoints de facturas por cliente:
 *   GET  /api/admin/staff/neka/clientes/[id]/facturas               (listar)
 *   POST /api/admin/staff/neka/clientes/[id]/facturas               (subir XML+PDF + registrar)
 *   POST /api/admin/staff/neka/clientes/[id]/facturas/[bId]/marcar-pagada
 *   POST /api/admin/staff/neka/clientes/[id]/facturas/[bId]/rep     (subir REP XML+PDF)
 *
 * Cubre auth gate (401), validaciones (400), happy paths (200), mapeo de
 * errores del helper a HTTP.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

const {
  mockIsAdmin,
  mockRegistrar,
  mockUpload,
  mockMarcarPagada,
  mockRegistrarRep,
  mockList,
  mockSingle,
} = vi.hoisted(() => ({
  mockIsAdmin:       vi.fn(),
  mockRegistrar:     vi.fn(),
  mockUpload:        vi.fn(),
  mockMarcarPagada:  vi.fn(),
  mockRegistrarRep:  vi.fn(),
  mockList:          vi.fn(),
  mockSingle:        vi.fn(),
}));

vi.mock('@/lib/admin/auth', () => ({
  isAdmin: (...args: unknown[]) => mockIsAdmin(...args),
}));

vi.mock('@/lib/billing/centinelia-facturas', async () => {
  const actual = await vi.importActual<typeof import('@/lib/billing/centinelia-facturas')>(
    '@/lib/billing/centinelia-facturas',
  );
  return {
    ...actual,
    registrarCfdiEmitido: (...args: unknown[]) => mockRegistrar(...args),
    uploadFacturaFiles:   (...args: unknown[]) => mockUpload(...args),
    marcarFacturaPagada:  (...args: unknown[]) => mockMarcarPagada(...args),
    registrarRepEmitido:  (...args: unknown[]) => mockRegistrarRep(...args),
  };
});

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order:  vi.fn().mockImplementation(() => mockList()),
          single: vi.fn().mockImplementation(() => mockSingle()),
        }),
      }),
    }),
  }),
}));

import { GET, POST as POST_facturas } from '../route';
import { POST as POST_marcarPagada }  from '../[billingId]/marcar-pagada/route';
import { POST as POST_rep }           from '../[billingId]/rep/route';

const tortilleriaXml = readFileSync(
  join(__dirname, '..', '..', '..', '..', '..', '..', '..', '..', '..', 'lib', 'billing', '__tests__', 'fixtures', 'tortilleria-2026-09-21.xml'),
  'utf-8',
);

function xmlFile(): File {
  return new File([tortilleriaXml], 'factura.xml', { type: 'application/xml' });
}
function pdfFile(bytes = 200): File {
  return new File([new Uint8Array(bytes)], 'factura.pdf', { type: 'application/pdf' });
}

/** XML minimo de REP (tipo P) para tests. Pasa el parser sin ser un REP real. */
const repXmlContent = `<?xml version="1.0" encoding="utf-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="4.0" Fecha="2026-10-06T10:00:00" TipoDeComprobante="P" FormaPago="03" SubTotal="0" Total="0" Moneda="XXX" LugarExpedicion="64989" Exportacion="01">
  <cfdi:Emisor Rfc="AAMN951208I25" Nombre="NAZRE" RegimenFiscal="612"/>
  <cfdi:Receptor Rfc="TEN010518AL3" Nombre="TORTILLAS" DomicilioFiscalReceptor="66470" RegimenFiscalReceptor="601" UsoCFDI="CP01"/>
  <cfdi:Impuestos TotalImpuestosTrasladados="0.00"><cfdi:Traslados/></cfdi:Impuestos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital Version="1.1" UUID="REP-UUID-TEST-0000" FechaTimbrado="2026-10-06T10:01:00" RfcProvCertif="SAT970701NN3" SelloCFD="x" NoCertificadoSAT="x" SelloSAT="x"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

function repXmlFile(): File {
  return new File([repXmlContent], 'rep.xml', { type: 'application/xml' });
}

function makeFormRequest(fields: Record<string, string | File>, path = 'facturas'): NextRequest {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return new NextRequest(`http://localhost/api/admin/staff/neka/clientes/cli-1/${path}`, {
    method: 'POST',
    body:   form as unknown as BodyInit,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsAdmin.mockResolvedValue(true);
});

describe('GET /clientes/[id]/facturas', () => {
  it('401 sin admin', async () => {
    mockIsAdmin.mockResolvedValueOnce(false);
    const res = await GET(new NextRequest('http://localhost/x'), { params: Promise.resolve({ id: 'cli-1' }) });
    expect(res.status).toBe(401);
  });

  it('200 con array de facturas del cliente', async () => {
    mockList.mockResolvedValueOnce({ data: [{ id: 'row-1', tipo: 'cfdi_emitido' }], error: null });
    const res = await GET(new NextRequest('http://localhost/x'), { params: Promise.resolve({ id: 'cli-1' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.facturas)).toBe(true);
  });
});

describe('POST /clientes/[id]/facturas — subir XML+PDF', () => {
  it('401 sin admin', async () => {
    mockIsAdmin.mockResolvedValueOnce(false);
    const res = await POST_facturas(makeFormRequest({ xml: xmlFile(), pdf: pdfFile() }), { params: Promise.resolve({ id: 'cli-1' }) });
    expect(res.status).toBe(401);
  });

  it('400 sin xml', async () => {
    const res = await POST_facturas(makeFormRequest({ pdf: pdfFile() }), { params: Promise.resolve({ id: 'cli-1' }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('xml');
  });

  it('400 sin pdf', async () => {
    const res = await POST_facturas(makeFormRequest({ xml: xmlFile() }), { params: Promise.resolve({ id: 'cli-1' }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('pdf');
  });

  it('200 parsea XML, registra, sube, devuelve la factura', async () => {
    mockRegistrar.mockResolvedValueOnce({
      ok: true,
      factura: { id: 'row-1', cliente_id: 'cli-1', cfdi_uuid: 'A1FC4F3A-F870-4F14-B6C6-958687605B4D', metodo_pago_cfdi: 'PPD' },
    });
    mockUpload.mockResolvedValueOnce({
      ok: true,
      xmlPath: 'cli-1/facturas/a1fc4f3a-.../factura.xml',
      pdfPath: 'cli-1/facturas/a1fc4f3a-.../factura.pdf',
    });

    const res = await POST_facturas(makeFormRequest({ xml: xmlFile(), pdf: pdfFile(500) }), { params: Promise.resolve({ id: 'cli-1' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.factura.cfdi_uuid).toBe('A1FC4F3A-F870-4F14-B6C6-958687605B4D');
    expect(mockRegistrar).toHaveBeenCalled();
    expect(mockUpload).toHaveBeenCalled();
  });

  it('500 si registrar falla', async () => {
    mockRegistrar.mockResolvedValueOnce({ ok: false, code: 'insert_failed', message: 'dup' });
    const res = await POST_facturas(makeFormRequest({ xml: xmlFile(), pdf: pdfFile() }), { params: Promise.resolve({ id: 'cli-1' }) });
    expect(res.status).toBe(500);
  });
});

describe('POST /marcar-pagada', () => {
  it('401 sin admin', async () => {
    mockIsAdmin.mockResolvedValueOnce(false);
    const req = new NextRequest('http://localhost/x', { method: 'POST', body: JSON.stringify({}) });
    const res = await POST_marcarPagada(req, { params: Promise.resolve({ id: 'cli-1', billingId: 'b-1' }) });
    expect(res.status).toBe(401);
  });

  it('200 con repReminderAt cuando PPD', async () => {
    mockMarcarPagada.mockResolvedValueOnce({ ok: true, billingId: 'b-1', repReminderAt: '2026-10-06T00:00:00Z' });
    const req = new NextRequest('http://localhost/x', { method: 'POST', body: JSON.stringify({ paidAt: '2026-10-01T00:00:00Z' }) });
    const res = await POST_marcarPagada(req, { params: Promise.resolve({ id: 'cli-1', billingId: 'b-1' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.repReminderAt).toBe('2026-10-06T00:00:00Z');
  });

  it('404 cuando not_found', async () => {
    mockMarcarPagada.mockResolvedValueOnce({ ok: false, code: 'not_found', message: 'x' });
    const req = new NextRequest('http://localhost/x', { method: 'POST', body: JSON.stringify({}) });
    const res = await POST_marcarPagada(req, { params: Promise.resolve({ id: 'cli-1', billingId: 'b-1' }) });
    expect(res.status).toBe(404);
  });
});

describe('POST /rep — subir REP contra factura padre', () => {
  it('401 sin admin', async () => {
    mockIsAdmin.mockResolvedValueOnce(false);
    const res = await POST_rep(makeFormRequest({ xml: repXmlFile(), pdf: pdfFile() }, 'facturas/b-1/rep'), { params: Promise.resolve({ id: 'cli-1', billingId: 'b-1' }) });
    expect(res.status).toBe(401);
  });

  it('400 si el XML no es tipo P', async () => {
    const res = await POST_rep(makeFormRequest({ xml: xmlFile(), pdf: pdfFile() }, 'facturas/b-1/rep'), { params: Promise.resolve({ id: 'cli-1', billingId: 'b-1' }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('tipo Pago');
  });

  it('404 si el billingId del padre no existe', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'no row' } });
    const res = await POST_rep(makeFormRequest({ xml: repXmlFile(), pdf: pdfFile() }, 'facturas/b-1/rep'), { params: Promise.resolve({ id: 'cli-1', billingId: 'b-1' }) });
    expect(res.status).toBe(404);
  });

  it('400 si el padre no es cfdi_emitido', async () => {
    mockSingle.mockResolvedValueOnce({ data: { id: 'b-1', cfdi_uuid: 'X', tipo: 'rep_emitido' }, error: null });
    const res = await POST_rep(makeFormRequest({ xml: repXmlFile(), pdf: pdfFile() }, 'facturas/b-1/rep'), { params: Promise.resolve({ id: 'cli-1', billingId: 'b-1' }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('cfdi_emitido');
  });

  it('200 happy path: registra rep con ingresoUuid extraído del padre', async () => {
    mockSingle.mockResolvedValueOnce({
      data: { id: 'b-1', cfdi_uuid: 'A1FC4F3A-F870-4F14-B6C6-958687605B4D', tipo: 'cfdi_emitido' },
      error: null,
    });
    mockRegistrarRep.mockResolvedValueOnce({
      ok: true,
      factura: { id: 'row-rep', cliente_id: 'cli-1', cfdi_uuid: 'REP-UUID-TEST-0000', related_uuid: 'A1FC4F3A-F870-4F14-B6C6-958687605B4D', metodo_pago_cfdi: null },
    });
    mockUpload.mockResolvedValueOnce({
      ok: true, xmlPath: 'cli-1/facturas/rep-uuid-test-0000/rep.xml', pdfPath: 'cli-1/facturas/rep-uuid-test-0000/rep.pdf',
    });

    const res = await POST_rep(makeFormRequest({ xml: repXmlFile(), pdf: pdfFile() }, 'facturas/b-1/rep'), { params: Promise.resolve({ id: 'cli-1', billingId: 'b-1' }) });
    expect(res.status).toBe(200);
    const arg = mockRegistrarRep.mock.calls[0][0] as { ingresoUuid: string; repUuid: string; clienteId: string };
    expect(arg.ingresoUuid).toBe('A1FC4F3A-F870-4F14-B6C6-958687605B4D');
    expect(arg.clienteId).toBe('cli-1');
    expect(mockUpload).toHaveBeenCalled();
  });
});
