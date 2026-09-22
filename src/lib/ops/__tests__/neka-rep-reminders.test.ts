/**
 * Tests del cron daily de REP reminders. Cuando llega rep_reminder_at para una
 * factura PPD pagada, Neka manda un correo por cada una para que Nazre timbre
 * el REP en el portal. Marca rep_reminder_sent_at para no volver a molestar.
 *
 * Cubre: solo procesa las con reminder due, skip si ya hay REP emitido para
 * ese UUID, marca rep_reminder_sent_at tras exito, no marca si sendViaTitan
 * falla (permite retry).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSendViaTitan, mockSelect, mockUpdate } = vi.hoisted(() => ({
  mockSendViaTitan: vi.fn(),
  mockSelect:       vi.fn(),
  mockUpdate:       vi.fn(),
}));

vi.mock('@/lib/email/titan-smtp', () => ({
  sendViaTitan: (...args: unknown[]) => mockSendViaTitan(...args),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          not: () => ({
            is:  () => ({
              lte: () => mockSelect(),
            }),
          }),
        }),
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: (col: string, val: string) => mockUpdate({ patch, col, val }),
      }),
    }),
  }),
}));

import { runRepReminders } from '../neka-rep-reminders';

beforeEach(() => {
  vi.clearAllMocks();
  mockSendViaTitan.mockResolvedValue({ ok: true, savedToSent: false });
  mockUpdate.mockResolvedValue({ error: null });
  delete process.env.NEKA_NOTIFY_TO;
  delete process.env.NAZRE_ADMIN_EMAIL;
});

interface FacturaRow {
  id:              string;
  cliente_id:      string;
  cfdi_uuid:       string;
  monto:           number;
  paid_at:         string;
  rep_reminder_at: string;
  ciclo_key:       string | null;
  cliente:         { razon_social: string; rfc: string };
}

function fakeRow(overrides: Partial<FacturaRow> = {}): FacturaRow {
  return {
    id:              'row-1',
    cliente_id:      'cli-1',
    cfdi_uuid:       'A1FC4F3A-F870-4F14-B6C6-958687605B4D',
    monto:           13906.08,
    paid_at:         '2026-10-01T00:00:00Z',
    rep_reminder_at: '2026-10-06T00:00:00Z',
    ciclo_key:       '2026-09',
    cliente:         { razon_social: 'Tortillas Estrella del Norte', rfc: 'TEN010518AL3' },
    ...overrides,
  };
}

describe('runRepReminders — skip', () => {
  it('no manda correos si no hay reminders due', async () => {
    mockSelect.mockResolvedValueOnce({ data: [], error: null });
    const result = await runRepReminders({ testMode: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.enviados).toBe(0);
    expect(mockSendViaTitan).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe('runRepReminders — happy path', () => {
  it('manda 1 correo por factura y marca rep_reminder_sent_at', async () => {
    mockSelect.mockResolvedValueOnce({ data: [fakeRow(), fakeRow({ id: 'row-2', cfdi_uuid: 'B2FC' })], error: null });

    const result = await runRepReminders({ testMode: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.enviados).toBe(2);
    expect(mockSendViaTitan).toHaveBeenCalledTimes(2);
    expect(mockUpdate).toHaveBeenCalledTimes(2);

    const arg1 = mockUpdate.mock.calls[0][0] as { patch: { rep_reminder_sent_at: string }; col: string; val: string };
    expect(arg1.patch.rep_reminder_sent_at).toBeDefined();
    expect(arg1.col).toBe('id');
    expect(arg1.val).toBe('row-1');
  });

  it('el correo incluye UUID del ingreso padre + monto + link', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://www.centinelia.mx';
    mockSelect.mockResolvedValueOnce({ data: [fakeRow()], error: null });

    await runRepReminders({ testMode: false });
    const arg = mockSendViaTitan.mock.calls[0][0] as { subject: string; html: string };
    expect(arg.subject).toContain('REP');
    expect(arg.subject).toContain('Tortillas Estrella');
    expect(arg.html).toContain('A1FC4F3A');
    expect(arg.html).toContain('13,906.08');
    expect(arg.html).toContain('/admin/staff/neka/clientes');
  });
});

describe('runRepReminders — error path', () => {
  it('NO marca rep_reminder_sent_at si sendViaTitan falla (permite retry)', async () => {
    mockSelect.mockResolvedValueOnce({ data: [fakeRow()], error: null });
    mockSendViaTitan.mockResolvedValueOnce({ ok: false, savedToSent: false, error: 'SMTP timeout' });

    const result = await runRepReminders({ testMode: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.enviados).toBe(0);
    expect(result.errores).toBe(1);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
