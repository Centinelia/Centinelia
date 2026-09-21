/**
 * callback-store unit tests — mock Supabase
 *
 * La tabla landing_callback_requests no esta aplicada en la DB todavia
 * (migration 202609171400 pendiente de aplicar). Por eso los tests usan
 * mock del cliente admin en lugar de tocar la DB real.
 *
 * Cuando la migration se aplique en dev, cambiar a smoke integration:
 *   1. Agregar assertNotProdOrAllowed() en beforeAll
 *   2. Quitar el vi.mock de @/lib/supabase/admin
 *   3. Mover el archivo a supabase/__tests__/ si se quiere seguir el patron
 *      de los smoke existentes.
 *
 * Ref: constraint "no tests a clientes" — usa datos de prueba sinteticos.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------- mock del cliente admin ----------
const mockSingle  = vi.fn();
const mockSelect  = vi.fn();
const mockInsert  = vi.fn();
const mockUpdate  = vi.fn();
const mockEq      = vi.fn();
const mockRpc     = vi.fn();
const mockFrom    = vi.fn();

// Cadena fluida: from().insert/update/select().eq().single()
function buildChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, unknown> = {
    single: mockSingle,
    eq:     mockEq,
    ...overrides,
  };
  // eq retorna chain para poder seguir encadenando
  mockEq.mockReturnValue(chain);
  return chain;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: mockFrom,
    rpc:  mockRpc,
  })),
}));

import {
  createRequest,
  setOtpHash,
  incrementOtpAttempts,
  markOtpVerified,
  setVapiCall,
  getById,
} from '../callback-store';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('callback-store', () => {
  it('createRequest inserta la fila y devuelve el id', async () => {
    const fakeId = 'uuid-test-1';
    mockSingle.mockResolvedValue({ data: { id: fakeId }, error: null });
    const insertChain = buildChain({ select: vi.fn().mockReturnValue(buildChain()) });
    mockInsert.mockReturnValue(insertChain);
    mockFrom.mockReturnValue({ insert: mockInsert });

    const result = await createRequest({
      phone:     '8112345678',
      industry:  'tortilleria_abarrotes',
      ip:        '127.0.0.1',
      userAgent: 'test',
    });

    expect(result).toEqual({ id: fakeId });
    expect(mockFrom).toHaveBeenCalledWith('landing_callback_requests');
  });

  it('createRequest lanza si Supabase devuelve error', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'DB error' } });
    const insertChain = buildChain({ select: vi.fn().mockReturnValue(buildChain()) });
    mockInsert.mockReturnValue(insertChain);
    mockFrom.mockReturnValue({ insert: mockInsert });

    await expect(
      createRequest({ phone: '8112345679', industry: 'otro', ip: null, userAgent: null }),
    ).rejects.toThrow('createRequest fallo: DB error');
  });

  it('setOtpHash actualiza hash y expiracion', async () => {
    mockEq.mockResolvedValue({ error: null });
    const updateChain = { eq: mockEq };
    mockUpdate.mockReturnValue(updateChain);
    mockFrom.mockReturnValue({ update: mockUpdate });

    await expect(
      setOtpHash('uuid-test-2', 'hashed-otp', new Date(Date.now() + 300_000)),
    ).resolves.toBeUndefined();
  });

  it('setOtpHash lanza si hay error', async () => {
    mockEq.mockResolvedValue({ error: { message: 'update failed' } });
    const updateChain = { eq: mockEq };
    mockUpdate.mockReturnValue(updateChain);
    mockFrom.mockReturnValue({ update: mockUpdate });

    await expect(
      setOtpHash('uuid-test-2', 'hashed-otp', new Date()),
    ).rejects.toThrow('setOtpHash fallo: update failed');
  });

  it('incrementOtpAttempts llama al rpc y devuelve el nuevo valor', async () => {
    mockRpc.mockResolvedValue({ data: 1, error: null });

    const count = await incrementOtpAttempts('uuid-test-3');

    expect(mockRpc).toHaveBeenCalledWith('increment_otp_attempts', { req_id: 'uuid-test-3' });
    expect(count).toBe(1);
  });

  it('incrementOtpAttempts lanza si rpc falla', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'rpc error' } });

    await expect(incrementOtpAttempts('uuid-test-3')).rejects.toThrow(
      'incrementOtpAttempts fallo: rpc error',
    );
  });

  it('markOtpVerified actualiza otp_verified_at', async () => {
    mockEq.mockResolvedValue({ error: null });
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({ update: mockUpdate });

    await expect(markOtpVerified('uuid-test-4')).resolves.toBeUndefined();
  });

  it('setVapiCall guarda vapi_call_id y call_status', async () => {
    mockEq.mockResolvedValue({ error: null });
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({ update: mockUpdate });

    await expect(
      setVapiCall('uuid-test-5', 'vapi-call-abc', 'dialing'),
    ).resolves.toBeUndefined();
  });

  it('getById retorna la fila si existe', async () => {
    const fakeRow = {
      id:              'uuid-test-6',
      phone:           '8112345678',
      industry:        'otro',
      ip:              null,
      user_agent:      null,
      consent_at:      new Date().toISOString(),
      otp_hash:        null,
      otp_expires_at:  null,
      otp_attempts:    0,
      otp_verified_at: null,
      vapi_call_id:    null,
      call_status:     null,
      call_started_at: null,
      call_ended_at:   null,
      created_at:      new Date().toISOString(),
      updated_at:      new Date().toISOString(),
    };
    mockSingle.mockResolvedValue({ data: fakeRow, error: null });
    mockEq.mockReturnValue({ single: mockSingle });
    const selectChain = { eq: mockEq };
    mockSelect.mockReturnValue(selectChain);
    mockFrom.mockReturnValue({ select: mockSelect });

    const result = await getById('uuid-test-6');

    expect(result?.phone).toBe('8112345678');
    expect(result?.otp_verified_at).toBeNull();
  });

  it('getById retorna null si hay error', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'not found' } });
    mockEq.mockReturnValue({ single: mockSingle });
    const selectChain = { eq: mockEq };
    mockSelect.mockReturnValue(selectChain);
    mockFrom.mockReturnValue({ select: mockSelect });

    const result = await getById('uuid-inexistente');
    expect(result).toBeNull();
  });
});
