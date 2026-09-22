/**
 * Tests del cron route neka-rep-reminders. Cubre auth gate + delegacion.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockRun } = vi.hoisted(() => ({ mockRun: vi.fn() }));

vi.mock('@/lib/ops/neka-rep-reminders', () => ({
  runRepReminders: (...args: unknown[]) => mockRun(...args),
}));

vi.mock('@/lib/invoicing/facturama/centinelia-preset', () => ({
  isFacturamaSandbox: () => true,
}));

import { GET } from '../route';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = 'test-secret';
});

describe('GET /api/cron/neka-rep-reminders', () => {
  it('401 sin authorization', async () => {
    const res = await GET(new NextRequest('http://localhost/x'));
    expect(res.status).toBe(401);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('200 con secret correcto delega al helper', async () => {
    mockRun.mockResolvedValueOnce({ ok: true, procesados: 2, enviados: 2, errores: 0 });
    const req = new NextRequest('http://localhost/x', { headers: { authorization: 'Bearer test-secret' } });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enviados).toBe(2);
  });

  it('500 si helper falla', async () => {
    mockRun.mockResolvedValueOnce({ ok: false, error: 'x' });
    const req = new NextRequest('http://localhost/x', { headers: { authorization: 'Bearer test-secret' } });
    const res = await GET(req);
    expect(res.status).toBe(500);
  });
});
