/**
 * neka-notify-nazre.test.ts — helper que Neka usa en modo NEKA_NOTIFY_ONLY
 * para avisarle a Nazre que toca facturar manual mientras no se pague
 * Facturama API prod.
 *
 * Cubre: composicion HTML (datos criticos presentes), env var precedence
 * (NEKA_NOTIFY_TO > NAZRE_ADMIN_EMAIL > fallback), URL sandbox vs prod,
 * error path (sendViaTitan ok:false y throw), formato de moneda MXN.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockSendViaTitan } = vi.hoisted(() => ({ mockSendViaTitan: vi.fn() }));

vi.mock('@/lib/email/titan-smtp', () => ({
  sendViaTitan: (...args: unknown[]) => mockSendViaTitan(...args),
}));

import { notifyNazreToInvoice } from '../neka-notify-nazre';
import type { CfdiInput } from '@/lib/invoicing/provider';
import type { CentineliaCliente } from '@/lib/billing/centinelia-clientes';

function makeCliente(overrides: Partial<CentineliaCliente> = {}): CentineliaCliente {
  return {
    id:                        'cliente-1',
    rfc:                       'TEN010518AL3',
    razon_social:              'Tortilleria Estrella SA de CV',
    cp:                        '64000',
    regimen_fiscal:            '601',
    uso_cfdi_default:          'G03',
    correo_facturacion:        'cliente@example.mx',
    nombre_contacto:           'Beatriz',
    activo:                    true,
    conceptos: [
      { descripcion: 'Empleado digital Nia', valor_unitario: 10000, cantidad: 1, con_iva: true },
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

function makeCfdi(overrides: Partial<CfdiInput> = {}): CfdiInput {
  return {
    emisor:          { rfc: 'AAMN951208I25', regimenFiscal: '612', nombre: 'NAZRE' },
    receptor:        { rfc: 'TEN010518AL3', nombre: 'Tortilleria Estrella SA de CV', usoCfdi: 'G03', regimenFiscal: '601', domicilioFiscal: '64000' },
    lugarExpedicion: '64997',
    formaPago:       '99',
    metodoPago:      'PPD',
    moneda:          'MXN',
    conceptos: [
      { claveProdServ: '81112501', claveUnidad: 'E48', cantidad: 1, descripcion: 'Empleado digital Nia', valorUnitario: 10000, importe: 10000, iva: 1600 },
      { claveProdServ: '81112501', claveUnidad: 'E48', cantidad: 1, descripcion: 'Jornada mensual', valorUnitario: 1988, importe: 1988, iva: 318.08 },
    ],
    subtotal: 11988,
    iva:      1918.08,
    total:    13906.08,
    csd:            { cerPem: '', keyPem: '', noCertificado: '' },
    pacCredentials: { usuario: 'x', password: 'y' },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSendViaTitan.mockResolvedValue({ ok: true, savedToSent: false });
  delete process.env.NEKA_NOTIFY_TO;
  delete process.env.NAZRE_ADMIN_EMAIL;
  delete process.env.NEXT_PUBLIC_APP_URL;
});

afterEach(() => {
  delete process.env.NEKA_NOTIFY_TO;
  delete process.env.NAZRE_ADMIN_EMAIL;
});

describe('notifyNazreToInvoice — happy path', () => {
  it('regresa ok:true y llama sendViaTitan una vez', async () => {
    const result = await notifyNazreToInvoice({
      cliente:  makeCliente(),
      cfdi:     makeCfdi(),
      cicloKey: '2026-09',
      testMode: true,
    });

    expect(result.ok).toBe(true);
    expect(mockSendViaTitan).toHaveBeenCalledTimes(1);
  });

  it('el subject nombra al cliente y al ciclo', async () => {
    await notifyNazreToInvoice({
      cliente:  makeCliente(),
      cfdi:     makeCfdi(),
      cicloKey: '2026-09',
      testMode: true,
    });

    const arg = mockSendViaTitan.mock.calls[0][0] as { subject: string };
    expect(arg.subject).toContain('Tortilleria Estrella');
    expect(arg.subject).toContain('2026-09');
    expect(arg.subject).toContain('[Neka]');
  });

  it('el HTML incluye RFC, razon social, uso CFDI, metodo pago, ciclo, y total con formato MXN', async () => {
    await notifyNazreToInvoice({
      cliente:  makeCliente(),
      cfdi:     makeCfdi(),
      cicloKey: '2026-09',
      testMode: true,
    });

    const html = (mockSendViaTitan.mock.calls[0][0] as { html: string }).html;
    expect(html).toContain('TEN010518AL3');
    expect(html).toContain('Tortilleria Estrella SA de CV');
    expect(html).toContain('G03');
    expect(html).toContain('PPD');
    expect(html).toContain('2026-09');
    expect(html).toContain('13,906.08');
    expect(html).toContain('11,988.00');  // subtotal
    expect(html).toContain('1,918.08');   // IVA
  });

  it('el HTML lista cada concepto por descripcion', async () => {
    await notifyNazreToInvoice({
      cliente:  makeCliente(),
      cfdi:     makeCfdi(),
      cicloKey: '2026-09',
      testMode: true,
    });

    const html = (mockSendViaTitan.mock.calls[0][0] as { html: string }).html;
    expect(html).toContain('Empleado digital Nia');
    expect(html).toContain('Jornada mensual');
  });
});

describe('notifyNazreToInvoice — env var precedence', () => {
  it('usa NEKA_NOTIFY_TO cuando esta seteado', async () => {
    process.env.NEKA_NOTIFY_TO   = 'ops@centinelia.mx';
    process.env.NAZRE_ADMIN_EMAIL = 'admin@centinelia.mx';

    const result = await notifyNazreToInvoice({
      cliente:  makeCliente(),
      cfdi:     makeCfdi(),
      cicloKey: '2026-09',
      testMode: true,
    });

    expect(result.to).toBe('ops@centinelia.mx');
    expect((mockSendViaTitan.mock.calls[0][0] as { to: string }).to).toBe('ops@centinelia.mx');
  });

  it('cae a NAZRE_ADMIN_EMAIL si NEKA_NOTIFY_TO no esta', async () => {
    process.env.NAZRE_ADMIN_EMAIL = 'admin@centinelia.mx';

    const result = await notifyNazreToInvoice({
      cliente:  makeCliente(),
      cfdi:     makeCfdi(),
      cicloKey: '2026-09',
      testMode: true,
    });

    expect(result.to).toBe('admin@centinelia.mx');
  });

  it('cae al hardcode nazre20@gmail.com si ninguna env esta', async () => {
    const result = await notifyNazreToInvoice({
      cliente:  makeCliente(),
      cfdi:     makeCfdi(),
      cicloKey: '2026-09',
      testMode: true,
    });

    expect(result.to).toBe('nazre20@gmail.com');
  });
});

describe('notifyNazreToInvoice — URL sandbox vs prod', () => {
  it('linkea portal sandbox cuando testMode=true', async () => {
    await notifyNazreToInvoice({
      cliente:  makeCliente(),
      cfdi:     makeCfdi(),
      cicloKey: '2026-09',
      testMode: true,
    });

    const html = (mockSendViaTitan.mock.calls[0][0] as { html: string }).html;
    expect(html).toContain('apisandbox.facturama.mx');
    expect(html).toContain('SANDBOX');
    expect(html).not.toContain('app.facturama.mx"');
  });

  it('linkea portal prod cuando testMode=false', async () => {
    await notifyNazreToInvoice({
      cliente:  makeCliente(),
      cfdi:     makeCfdi(),
      cicloKey: '2026-09',
      testMode: false,
    });

    const html = (mockSendViaTitan.mock.calls[0][0] as { html: string }).html;
    expect(html).toContain('app.facturama.mx');
    expect(html).toContain('PROD');
    expect(html).not.toContain('apisandbox.facturama.mx');
  });
});

describe('notifyNazreToInvoice — error path', () => {
  it('regresa ok:false cuando sendViaTitan regresa ok:false', async () => {
    mockSendViaTitan.mockResolvedValueOnce({ ok: false, savedToSent: false, error: 'SMTP timeout' });

    const result = await notifyNazreToInvoice({
      cliente:  makeCliente(),
      cfdi:     makeCfdi(),
      cicloKey: '2026-09',
      testMode: true,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('SMTP timeout');
  });

  it('regresa ok:false cuando sendViaTitan lanza', async () => {
    mockSendViaTitan.mockRejectedValueOnce(new Error('Resend 429 rate limit'));

    const result = await notifyNazreToInvoice({
      cliente:  makeCliente(),
      cfdi:     makeCfdi(),
      cicloKey: '2026-09',
      testMode: true,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Resend 429 rate limit');
  });
});
