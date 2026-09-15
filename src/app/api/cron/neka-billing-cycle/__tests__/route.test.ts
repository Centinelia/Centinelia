/**
 * route.test.ts — GET /api/cron/neka-billing-cycle
 *
 * Cubre principalmente la rama NEKA_NOTIFY_ONLY: mientras Facturama API prod
 * no este contratado, el cron debe mandar un correo a Nazre y registrar el
 * evento notify_sent en vez de intentar timbrar. Verifica tambien la
 * idempotencia por ciclo y que el modo emit clasico siga intacto.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
  mockGetClientesPorFacturar,
  mockUpdateCliente,
  mockRecordBillingEvent,
  mockYaFacturadoEsteCiclo,
  mockYaNotificadoEsteCiclo,
  mockEmitirIngresoFacturama,
  mockNotifyNazreToInvoice,
  mockSupabaseFrom,
} = vi.hoisted(() => ({
  mockGetClientesPorFacturar: vi.fn(),
  mockUpdateCliente:          vi.fn(),
  mockRecordBillingEvent:     vi.fn(),
  mockYaFacturadoEsteCiclo:   vi.fn(),
  mockYaNotificadoEsteCiclo:  vi.fn(),
  mockEmitirIngresoFacturama: vi.fn(),
  mockNotifyNazreToInvoice:   vi.fn(),
  mockSupabaseFrom:           vi.fn(),
}));

vi.mock('@/lib/billing/centinelia-clientes', async () => {
  const actual = await vi.importActual<typeof import('@/lib/billing/centinelia-clientes')>(
    '@/lib/billing/centinelia-clientes',
  );
  return {
    ...actual,
    getClientesPorFacturar: (...args: unknown[]) => mockGetClientesPorFacturar(...args),
    updateCliente:          (...args: unknown[]) => mockUpdateCliente(...args),
  };
});

vi.mock('@/lib/billing/centinelia-billing', () => ({
  recordBillingEvent:    (...args: unknown[]) => mockRecordBillingEvent(...args),
  yaFacturadoEsteCiclo:  (...args: unknown[]) => mockYaFacturadoEsteCiclo(...args),
  yaNotificadoEsteCiclo: (...args: unknown[]) => mockYaNotificadoEsteCiclo(...args),
}));

vi.mock('@/lib/invoicing/facturama/emitir', () => ({
  emitirIngresoFacturama: (...args: unknown[]) => mockEmitirIngresoFacturama(...args),
}));

vi.mock('@/lib/invoicing/facturama/centinelia-preset', () => ({
  getCentineliaFiscalConfig: () => ({
    rfc:            'AAMN951208I25',
    regimenFiscal:  '612',
    razonSocial:    'NAZRE HASSAM MIGUEL ASSAD MORALES',
    lugarExpedicion:'64997',
    domicilioFiscal:'test',
    emailContacto:  'hola@centinelia.mx',
  }),
  getFacturamaCredentials: () => ({ usuario: 'test', password: 'test' }),
  isFacturamaSandbox:      () => true,
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: mockSupabaseFrom }),
}));

vi.mock('@/lib/ops/neka-cfdi-sender', () => ({
  nekaCfdiSender: { name: 'Neka', from: 'hola@centinelia.mx' },
}));

vi.mock('@/lib/ops/neka-notify-nazre', () => ({
  notifyNazreToInvoice: (...args: unknown[]) => mockNotifyNazreToInvoice(...args),
}));

import { GET } from '../route';
import { NextRequest } from 'next/server';

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/cron/neka-billing-cycle', {
    method:  'GET',
    headers: { authorization: 'Bearer test-secret' },
  });
}

function makeCliente(overrides: Record<string, unknown> = {}) {
  return {
    id:                        'cliente-1',
    rfc:                       'TEN010518AL3',
    razon_social:              'Tortilleria Estrella SA de CV',
    cp:                        '64000',
    regimen_fiscal:            '601',
    uso_cfdi_default:          'G03',
    correo_facturacion:        'nazre20@gmail.com',
    nombre_contacto:           'Beatriz',
    activo:                    true,
    conceptos: [
      { descripcion: 'Empleado digital Nia', valor_unitario: 10000, cantidad: 1, con_iva: true },
      { descripcion: 'Jornada mensual',      valor_unitario: 1988,  cantidad: 1, con_iva: true },
    ],
    periodicidad:              'monthly',
    fecha_proxima_facturacion: '2026-09-15',
    fecha_ultima_facturacion:  null,
    metodo_pago_default:       'PPD',
    forma_pago_default:        '99',
    stripe_customer_id:        null,
    notas:                     null,
    created_at:                '2026-08-01T00:00:00Z',
    updated_at:                '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

function installSupabaseMock() {
  mockSupabaseFrom.mockImplementation((table: string) => {
    if (table === 'centinelia_clientes') {
      // usado por update fecha_ultima_facturacion (chain update→eq)
      return {
        update: vi.fn().mockReturnThis(),
        eq:     vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    }
    return {};
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET                 = 'test-secret';
  process.env.NEKA_BILLING_CYCLE_ENABLED  = 'true';
  delete process.env.NEKA_NOTIFY_ONLY;
  mockYaFacturadoEsteCiclo.mockResolvedValue(null);
  mockYaNotificadoEsteCiclo.mockResolvedValue(false);
  mockUpdateCliente.mockResolvedValue({});
  mockRecordBillingEvent.mockResolvedValue({ id: 'evt-1' });
  installSupabaseMock();
});

afterEach(() => {
  delete process.env.NEKA_NOTIFY_ONLY;
});

describe('GET /api/cron/neka-billing-cycle', () => {
  it('devuelve 401 sin bearer valido', async () => {
    const req = new NextRequest('http://localhost/api/cron/neka-billing-cycle', {
      method: 'GET', headers: { authorization: 'Bearer wrong' },
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('regresa {skipped:disabled} si NEKA_BILLING_CYCLE_ENABLED != true', async () => {
    delete process.env.NEKA_BILLING_CYCLE_ENABLED;
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.skipped).toBe('disabled');
    expect(mockGetClientesPorFacturar).not.toHaveBeenCalled();
  });

  describe('modo NEKA_NOTIFY_ONLY=true', () => {
    beforeEach(() => {
      process.env.NEKA_NOTIFY_ONLY = 'true';
      mockNotifyNazreToInvoice.mockResolvedValue({ ok: true, to: 'nazre20@gmail.com' });
    });

    it('NO llama a Facturama y avisa a Nazre + registra notify_sent', async () => {
      mockGetClientesPorFacturar.mockResolvedValue([makeCliente()]);

      const res = await GET(makeRequest());
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.notifyOnly).toBe(true);
      expect(body.notificados).toBe(1);
      expect(body.emitidos).toBe(0);

      expect(mockEmitirIngresoFacturama).not.toHaveBeenCalled();

      expect(mockNotifyNazreToInvoice).toHaveBeenCalledTimes(1);
      const notifyArg = mockNotifyNazreToInvoice.mock.calls[0][0] as {
        cliente:  { rfc: string };
        cicloKey: string;
        cfdi:     { total: number; conceptos: unknown[] };
      };
      expect(notifyArg.cliente.rfc).toBe('TEN010518AL3');
      expect(notifyArg.cicloKey).toBe('2026-09');
      expect(notifyArg.cfdi.conceptos).toHaveLength(2);
      // 10000 + 1988 = 11988 subtotal; +16% IVA = 13906.08 total
      expect(notifyArg.cfdi.total).toBeCloseTo(13906.08, 2);

      expect(mockRecordBillingEvent).toHaveBeenCalledTimes(1);
      const evt = mockRecordBillingEvent.mock.calls[0][0] as { tipo: string; ciclo_key: string; meta: { reason: string } };
      expect(evt.tipo).toBe('notify_sent');
      expect(evt.ciclo_key).toBe('2026-09');
      expect(evt.meta.reason).toBe('NEKA_NOTIFY_ONLY');
    });

    it('avanza fecha_proxima_facturacion +1 mes tras notificar', async () => {
      mockGetClientesPorFacturar.mockResolvedValue([makeCliente({ fecha_proxima_facturacion: '2026-09-15' })]);

      await GET(makeRequest());

      expect(mockUpdateCliente).toHaveBeenCalledTimes(1);
      const patch = mockUpdateCliente.mock.calls[0][1] as { fecha_proxima_facturacion: string };
      expect(patch.fecha_proxima_facturacion).toBe('2026-10-15');
    });

    it('idempotente: si ya hay notify_sent para el ciclo, salta y suma skippedYaNotificados', async () => {
      mockGetClientesPorFacturar.mockResolvedValue([makeCliente()]);
      mockYaNotificadoEsteCiclo.mockResolvedValueOnce(true);

      const res = await GET(makeRequest());
      const body = await res.json();

      expect(body.skippedYaNotificados).toBe(1);
      expect(body.notificados).toBe(0);
      expect(mockNotifyNazreToInvoice).not.toHaveBeenCalled();
      expect(mockRecordBillingEvent).not.toHaveBeenCalled();
    });

    it('salta clientes que ya tienen cfdi_emitido en este ciclo (mismo guard que emit mode)', async () => {
      mockGetClientesPorFacturar.mockResolvedValue([makeCliente()]);
      mockYaFacturadoEsteCiclo.mockResolvedValueOnce({ id: 'existing-cfdi' });

      const res = await GET(makeRequest());
      const body = await res.json();

      expect(body.skippedYaFacturados).toBe(1);
      expect(body.notificados).toBe(0);
      expect(mockNotifyNazreToInvoice).not.toHaveBeenCalled();
    });

    it('si notify falla, se registra error y NO avanza fecha ni graba notify_sent', async () => {
      mockGetClientesPorFacturar.mockResolvedValue([makeCliente()]);
      mockNotifyNazreToInvoice.mockResolvedValueOnce({ ok: false, to: 'x', error: 'resend down' });

      const res = await GET(makeRequest());
      const body = await res.json();

      expect(body.notificados).toBe(0);
      expect(body.errores).toHaveLength(1);
      expect(body.errores[0].error).toContain('resend down');
      expect(mockRecordBillingEvent).not.toHaveBeenCalled();
      expect(mockUpdateCliente).not.toHaveBeenCalled();
    });
  });

  describe('modo emit clasico (NEKA_NOTIFY_ONLY unset)', () => {
    beforeEach(() => {
      mockEmitirIngresoFacturama.mockResolvedValue({
        ok:              true,
        uuid:            'uuid-test-1',
        fechaTimbrado:   '2026-09-15T15:00:00Z',
        certificadoSat:  'cert-sat',
        emailSent:       true,
        storagePaths:    { xml: 'xml/path', pdf: 'pdf/path', qr: 'qr/path' },
      });
    });

    it('llama a Facturama y NO llama a notify', async () => {
      mockGetClientesPorFacturar.mockResolvedValue([makeCliente()]);

      const res = await GET(makeRequest());
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.notifyOnly).toBe(false);
      expect(body.emitidos).toBe(1);
      expect(body.notificados).toBe(0);

      expect(mockEmitirIngresoFacturama).toHaveBeenCalledTimes(1);
      expect(mockNotifyNazreToInvoice).not.toHaveBeenCalled();

      // Registra cfdi_emitido, no notify_sent
      const evt = mockRecordBillingEvent.mock.calls[0][0] as { tipo: string };
      expect(evt.tipo).toBe('cfdi_emitido');
    });
  });
});
