/**
 * Tests del cron semanal de cobros. Lunes 9am MX: Neka manda un correo con
 * la lista de facturas emitidas PPD que aun no han sido marcadas como pagadas,
 * agrupadas por cliente, para que Nazre marque cuales ya cobraron y arranque
 * el schedule del REP.
 *
 * Cubre: query correcto (PPD sin paid_at ultimos 90d), agrupacion por cliente,
 * skip si no hay pendientes, formato HTML incluye RFC + UUID + monto + link,
 * error path de sendViaTitan.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSendViaTitan, mockSelect } = vi.hoisted(() => ({
  mockSendViaTitan: vi.fn(),
  mockSelect:       vi.fn(),
}));

vi.mock('@/lib/email/titan-smtp', () => ({
  sendViaTitan: (...args: unknown[]) => mockSendViaTitan(...args),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          is:  () => ({
            gte: () => ({
              order: () => mockSelect(),
            }),
          }),
        }),
      }),
    }),
  }),
}));

import { runCobrosSemanal } from '../neka-cobros-semanal';

beforeEach(() => {
  vi.clearAllMocks();
  mockSendViaTitan.mockResolvedValue({ ok: true, savedToSent: false });
  delete process.env.NEKA_NOTIFY_TO;
  delete process.env.NAZRE_ADMIN_EMAIL;
});

interface FacturaRow {
  id:               string;
  cliente_id:       string;
  cfdi_uuid:        string;
  monto:            number;
  created_at:       string;
  ciclo_key:        string | null;
  cliente:          { razon_social: string; rfc: string };
}

function fakeRow(overrides: Partial<FacturaRow> = {}): FacturaRow {
  return {
    id:         'row-1',
    cliente_id: 'cli-1',
    cfdi_uuid:  'A1FC4F3A-F870-4F14-B6C6-958687605B4D',
    monto:      13906.08,
    created_at: '2026-09-21T12:44:32Z',
    ciclo_key:  '2026-09',
    cliente:    { razon_social: 'Tortillas Estrella del Norte', rfc: 'TEN010518AL3' },
    ...overrides,
  };
}

describe('runCobrosSemanal — skip', () => {
  it('no manda correo si no hay PPDs pendientes', async () => {
    mockSelect.mockResolvedValueOnce({ data: [], error: null });
    const result = await runCobrosSemanal({ testMode: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pendientes).toBe(0);
    expect(mockSendViaTitan).not.toHaveBeenCalled();
  });

  it('no manda correo si el query falla', async () => {
    mockSelect.mockResolvedValueOnce({ data: null, error: { message: 'db down' } });
    const result = await runCobrosSemanal({ testMode: true });
    expect(result.ok).toBe(false);
    expect(mockSendViaTitan).not.toHaveBeenCalled();
  });
});

describe('runCobrosSemanal — happy path', () => {
  it('manda un correo con la lista agrupada por cliente', async () => {
    mockSelect.mockResolvedValueOnce({
      data: [
        fakeRow(),
        fakeRow({ id: 'row-2', cfdi_uuid: 'B2FC-UUID', monto: 5000, ciclo_key: '2026-08' }),
        fakeRow({ id: 'row-3', cliente_id: 'cli-2', cfdi_uuid: 'C3FC', monto: 2000,
                  cliente: { razon_social: 'AC Proyectos', rfc: 'ACP123456789' } }),
      ],
      error: null,
    });

    const result = await runCobrosSemanal({ testMode: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pendientes).toBe(3);
    expect(mockSendViaTitan).toHaveBeenCalledTimes(1);

    const arg = mockSendViaTitan.mock.calls[0][0] as { subject: string; html: string; to: string };
    expect(arg.subject).toContain('[Neka]');
    expect(arg.subject.toLowerCase()).toContain('cobros');
    expect(arg.html).toContain('TEN010518AL3');
    expect(arg.html).toContain('ACP123456789');
    expect(arg.html).toContain('Tortillas Estrella del Norte');
    expect(arg.html).toContain('AC Proyectos');
    expect(arg.html).toContain('A1FC4F3A');
    expect(arg.html).toContain('13,906.08');
    expect(arg.html).toContain('5,000.00');
    expect(arg.html).toContain('2,000.00');
  });

  it('el correo incluye el link para marcar cada factura como pagada', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://www.centinelia.mx';
    mockSelect.mockResolvedValueOnce({ data: [fakeRow()], error: null });

    await runCobrosSemanal({ testMode: false });
    const arg = mockSendViaTitan.mock.calls[0][0] as { html: string };
    expect(arg.html).toContain('/admin/staff/neka/clientes');
  });
});

describe('runCobrosSemanal — env precedence', () => {
  it('usa NEKA_NOTIFY_TO cuando esta seteado', async () => {
    process.env.NEKA_NOTIFY_TO = 'ops@centinelia.mx';
    mockSelect.mockResolvedValueOnce({ data: [fakeRow()], error: null });
    await runCobrosSemanal({ testMode: true });
    const arg = mockSendViaTitan.mock.calls[0][0] as { to: string };
    expect(arg.to).toBe('ops@centinelia.mx');
  });

  it('cae a NAZRE_ADMIN_EMAIL, luego hardcode', async () => {
    process.env.NAZRE_ADMIN_EMAIL = 'admin@centinelia.mx';
    mockSelect.mockResolvedValueOnce({ data: [fakeRow()], error: null });
    await runCobrosSemanal({ testMode: true });
    const arg = mockSendViaTitan.mock.calls[0][0] as { to: string };
    expect(arg.to).toBe('admin@centinelia.mx');
  });
});
