/**
 * Tests del cron route neka-cobros-semanal. Cubre auth gate (401 sin CRON_SECRET)
 * y delegacion al helper.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockRun, mockSandbox } = vi.hoisted(() => ({
  mockRun: vi.fn(),
  mockSandbox: vi.fn().mockReturnValue(true),
}));

vi.mock('@/lib/ops/neka-cobros-semanal', () => ({
  runCobrosSemanal: (...args: unknown[]) => mockRun(...args),
}));

vi.mock('@/lib/invoicing/facturama/centinelia-preset', () => ({
  isFacturamaSandbox: () => mockSandbox(),
}));

import { GET } from '../route';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = 'test-secret';
});

describe('GET /api/cron/neka-cobros-semanal', () => {
  it('401 sin authorization header', async () => {
    const req = new NextRequest('http://localhost/x');
    const res = await GET(req);
    expect(res.status).toBe(401);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('401 con secret incorrecto', async () => {
    const req = new NextRequest('http://localhost/x', { headers: { authorization: 'Bearer wrong' } });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('200 con secret correcto y delega al helper con testMode', async () => {
    mockRun.mockResolvedValueOnce({ ok: true, pendientes: 3, sent: true });
    const req = new NextRequest('http://localhost/x', { headers: { authorization: 'Bearer test-secret' } });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pendientes).toBe(3);
    expect(mockRun).toHaveBeenCalledWith({ testMode: true });
  });

  it('500 si el helper falla', async () => {
    mockRun.mockResolvedValueOnce({ ok: false, error: 'db down', pendientes: 0 });
    const req = new NextRequest('http://localhost/x', { headers: { authorization: 'Bearer test-secret' } });
    const res = await GET(req);
    expect(res.status).toBe(500);
  });
});
