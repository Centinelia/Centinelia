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

const { mockSendViaTitan, mockPendientes, mockRepsEmitidos, mockUpdate } = vi.hoisted(() => ({
  mockSendViaTitan: vi.fn(),
  mockPendientes:   vi.fn(),
  mockRepsEmitidos: vi.fn(),
  mockUpdate:       vi.fn(),
}));

vi.mock('@/lib/email/titan-smtp', () => ({
  sendViaTitan: (...args: unknown[]) => mockSendViaTitan(...args),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (_table: string) => ({
      // dos variantes de select segun si viene lte (padres) o in (reps emitidos)
      select: (_cols: string) => ({
        eq: (_col: string, val: string) => {
          if (val === 'rep_emitido') {
            return { in: (_c: string, _vs: string[]) => mockRepsEmitidos() };
          }
          return {
            not: () => ({
              is:  () => ({
                lte: () => mockPendientes(),
              }),
            }),
          };
        },
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: (col: string, val: string) => {
          const chain = { patch, col, val };
          const resolveNow = () => mockUpdate(chain);
          const thenable = {
            then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve(resolveNow()).then(onFulfilled),
            is:  (_c: string, _v: string | null) => Promise.resolve(resolveNow()),
          };
          return thenable;
        },
      }),
    }),
  }),
}));

import { runRepReminders } from '../neka-rep-reminders';

beforeEach(() => {
  vi.clearAllMocks();
  mockSendViaTitan.mockResolvedValue({ ok: true, savedToSent: false });
  mockUpdate.mockReturnValue({ error: null });
  mockRepsEmitidos.mockResolvedValue({ data: [], error: null });
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
    mockPendientes.mockResolvedValueOnce({ data: [], error: null });
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
    mockPendientes.mockResolvedValueOnce({ data: [fakeRow(), fakeRow({ id: 'row-2', cfdi_uuid: 'B2FC' })], error: null });

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
    mockPendientes.mockResolvedValueOnce({ data: [fakeRow()], error: null });

    await runRepReminders({ testMode: false });
    const arg = mockSendViaTitan.mock.calls[0][0] as { subject: string; html: string };
    expect(arg.subject).toContain('REP');
    expect(arg.subject).toContain('Tortillas Estrella');
    expect(arg.html).toContain('A1FC4F3A');
    expect(arg.html).toContain('13,906.08');
    expect(arg.html).toContain('/admin/staff/neka/clientes');
  });
});

describe('runRepReminders — skip si ya hay REP emitido (regresion falso-positivo 2026-10-01)', () => {
  it('NO manda correo cuando ya existe rep_emitido con related_uuid = cfdi_uuid del padre', async () => {
    const row = fakeRow();
    mockPendientes.mockResolvedValueOnce({ data: [row], error: null });
    mockRepsEmitidos.mockResolvedValueOnce({
      data: [{ related_uuid: row.cfdi_uuid }],
      error: null,
    });

    const result = await runRepReminders({ testMode: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.enviados).toBe(0);
    expect(mockSendViaTitan).not.toHaveBeenCalled();
  });

  it('marca rep_reminder_sent_at silenciosamente al detectar REP ya emitido', async () => {
    const row = fakeRow();
    mockPendientes.mockResolvedValueOnce({ data: [row], error: null });
    mockRepsEmitidos.mockResolvedValueOnce({
      data: [{ related_uuid: row.cfdi_uuid }],
      error: null,
    });

    await runRepReminders({ testMode: true });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const call = mockUpdate.mock.calls[0][0] as { patch: { rep_reminder_sent_at: string }; col: string; val: string };
    expect(call.patch.rep_reminder_sent_at).toBeDefined();
    expect(call.val).toBe('row-1');
  });

  it('mezcla: 2 padres pendientes, uno ya tiene REP — solo manda correo al que no', async () => {
    const row1 = fakeRow({ id: 'con-rep', cfdi_uuid: 'AAAA-1' });
    const row2 = fakeRow({ id: 'sin-rep', cfdi_uuid: 'BBBB-2' });
    mockPendientes.mockResolvedValueOnce({ data: [row1, row2], error: null });
    mockRepsEmitidos.mockResolvedValueOnce({
      data: [{ related_uuid: 'AAAA-1' }],
      error: null,
    });

    const result = await runRepReminders({ testMode: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.enviados).toBe(1);
    expect(mockSendViaTitan).toHaveBeenCalledTimes(1);
    // mockUpdate llamado 2 veces: 1 silent-skip + 1 marca-tras-correo
    expect(mockUpdate).toHaveBeenCalledTimes(2);
  });
});

describe('runRepReminders — error path', () => {
  it('NO marca rep_reminder_sent_at si sendViaTitan falla (permite retry)', async () => {
    mockPendientes.mockResolvedValueOnce({ data: [fakeRow()], error: null });
    mockSendViaTitan.mockResolvedValueOnce({ ok: false, savedToSent: false, error: 'SMTP timeout' });

    const result = await runRepReminders({ testMode: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.enviados).toBe(0);
    expect(result.errores).toBe(1);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
