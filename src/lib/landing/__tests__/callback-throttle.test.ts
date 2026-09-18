/**
 * callback-throttle unit tests — mock Supabase
 *
 * La tabla landing_callback_requests no esta aplicada en la DB todavia
 * (migration 202609171400 pendiente de aplicar). Tests usan mock del
 * cliente admin para verificar la logica de rate limit sin tocar DB real.
 *
 * Cuando la migration se aplique en dev/staging, los tests de integracion
 * reales van en supabase/__tests__/ siguiendo el patron de los smoke existentes
 * (con assertNotProdOrAllowed).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock del cliente admin — se inyecta antes de importar el modulo bajo test
const mockGte    = vi.fn();
const mockEq     = vi.fn();
const mockSelect = vi.fn();
const mockFrom   = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

import { checkThrottle } from '../callback-throttle';

// Helper para configurar el chain de select-count
function setupCountChain(count: number) {
  // Cadena: .from().select('id', { count:'exact', head:true }).eq().gte()
  mockGte.mockResolvedValue({ count, error: null });
  mockEq.mockReturnValue({ gte: mockGte });
  mockSelect.mockReturnValue({ eq: mockEq, gte: mockGte });
  mockFrom.mockReturnValue({ select: mockSelect });
}

// Helper para configurar dos llamadas distintas al chain (IP check + phone check)
function setupTwoCountCalls(ipCount: number, phoneCount: number) {
  let callIndex = 0;
  mockGte.mockImplementation(() => {
    callIndex++;
    // Primera llamada = IP window, segunda = phone window
    const count = callIndex === 1 ? ipCount : phoneCount;
    return Promise.resolve({ count, error: null });
  });
  mockEq.mockReturnValue({ gte: mockGte });
  mockSelect.mockReturnValue({ eq: mockEq, gte: mockGte });
  mockFrom.mockReturnValue({ select: mockSelect });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('checkThrottle', () => {
  it('permite el primer intento (IP y telefono sin historial)', async () => {
    setupTwoCountCalls(0, 0);

    const res = await checkThrottle({ ip: '10.0.0.100', phone: '8110000001' });

    expect(res.allowed).toBe(true);
    expect(res.reason).toBeUndefined();
  });

  it('bloquea cuando la IP supera el limite (3/10min)', async () => {
    // IP ya tiene 3 solicitudes — la 4ta debe bloquearse
    setupTwoCountCalls(3, 0);

    const res = await checkThrottle({ ip: '10.0.0.101', phone: '8199999999' });

    expect(res.allowed).toBe(false);
    expect(res.reason).toBe('ip_rate_limit');
  });

  it('permite exactamente IP_MAX - 1 solicitudes por IP', async () => {
    // 2 solicitudes = bajo el limite de 3
    setupTwoCountCalls(2, 0);

    const res = await checkThrottle({ ip: '10.0.0.102', phone: '8110000003' });

    expect(res.allowed).toBe(true);
  });

  it('bloquea cuando el telefono supera el limite (2/1h)', async () => {
    // IP ok, pero el telefono ya tiene 2 solicitudes
    setupTwoCountCalls(0, 2);

    const res = await checkThrottle({ ip: '10.0.0.250', phone: '8110000010' });

    expect(res.allowed).toBe(false);
    expect(res.reason).toBe('phone_rate_limit');
  });

  it('ip_rate_limit tiene precedencia sobre phone_rate_limit', async () => {
    // Ambos superados — debe retornar ip_rate_limit (se evalua primero)
    setupTwoCountCalls(3, 2);

    const res = await checkThrottle({ ip: '10.0.0.200', phone: '8110000020' });

    expect(res.allowed).toBe(false);
    expect(res.reason).toBe('ip_rate_limit');
  });

  it('omite el check de IP cuando ip es null y solo evalua telefono', async () => {
    // Sin IP: solo se hace 1 llamada al chain (phone check)
    mockGte.mockResolvedValue({ count: 0, error: null });
    mockEq.mockReturnValue({ gte: mockGte });
    mockSelect.mockReturnValue({ eq: mockEq, gte: mockGte });
    mockFrom.mockReturnValue({ select: mockSelect });

    const res = await checkThrottle({ ip: null, phone: '8110000030' });

    expect(res.allowed).toBe(true);
    // Solo una llamada a .from() — el check de IP se omitio
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it('bloquea telefono aunque ip sea null', async () => {
    mockGte.mockResolvedValue({ count: 2, error: null });
    mockEq.mockReturnValue({ gte: mockGte });
    mockSelect.mockReturnValue({ eq: mockEq, gte: mockGte });
    mockFrom.mockReturnValue({ select: mockSelect });

    const res = await checkThrottle({ ip: null, phone: '8110000040' });

    expect(res.allowed).toBe(false);
    expect(res.reason).toBe('phone_rate_limit');
  });
});
