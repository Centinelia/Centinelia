/**
 * Unit tests para src/lib/feature-flags/agent-missions.ts
 *
 * Cubre:
 * - isFeatureEnabled: default OFF, coercion boolean/string, todos los flags
 * - isFeatureEnabledForPortal: async wrapper, Supabase mock, falla silenciosa
 * - setFeatureFlag: idempotencia, merge seguro, falla si Supabase falla
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks Supabase ANTES de importar ────────────────────────────────────────

const mockMaybeSingle = vi.fn();
const mockEq          = vi.fn();
const mockSelect      = vi.fn();
const mockUpdate      = vi.fn();
const mockFrom        = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: mockFrom,
  }),
}));

import {
  isFeatureEnabled,
  isFeatureEnabledForPortal,
  setFeatureFlag,
  type FeatureFlag,
} from '@/lib/feature-flags/agent-missions';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Configura el mock para un SELECT .select().eq().maybeSingle() */
function mockSelectChain(result: { data: unknown; error: unknown }) {
  mockMaybeSingle.mockResolvedValueOnce(result);
  mockEq.mockReturnValue({ maybeSingle: mockMaybeSingle });
  mockSelect.mockReturnValue({ eq: mockEq });
  mockFrom.mockReturnValue({ select: mockSelect });
}

/** Configura el mock para un UPDATE .update().eq() */
function mockUpdateChain(result: { error: unknown }) {
  const eqFn = vi.fn().mockResolvedValueOnce(result);
  mockUpdate.mockReturnValue({ eq: eqFn });
  mockFrom.mockReturnValue({ select: mockSelect, update: mockUpdate });
}

/** Configura SELECT seguido de UPDATE para setFeatureFlag */
function mockReadThenWrite(
  readResult: { data: unknown; error: unknown },
  writeResult: { error: unknown },
) {
  // Primera llamada from() = SELECT, segunda = UPDATE
  const selectEqFn  = vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValueOnce(readResult) });
  const selectChain = { eq: selectEqFn };
  const selectFn    = vi.fn().mockReturnValue(selectChain);

  const updateEqFn  = vi.fn().mockResolvedValueOnce(writeResult);
  // Reinicializar mockUpdate para que esta llamada sea registrable
  mockUpdate.mockReturnValue({ eq: updateEqFn });

  mockFrom
    .mockReturnValueOnce({ select: selectFn })
    .mockReturnValueOnce({ update: mockUpdate });

  return { updateFn: mockUpdate, updateEqFn };
}

// ─── Tests: isFeatureEnabled (sync) ─────────────────────────────────────────

describe('isFeatureEnabled (sync)', () => {
  const allFlags: FeatureFlag[] = [
    'agent_missions_enabled',
    'retrieval_v2_enabled',
    'rerank_enabled',
  ];

  it('retorna false cuando features es null', () => {
    expect(isFeatureEnabled({ features: null }, 'agent_missions_enabled')).toBe(false);
  });

  it('retorna false cuando features es undefined', () => {
    expect(isFeatureEnabled({}, 'agent_missions_enabled')).toBe(false);
  });

  it('retorna false cuando el flag no existe en features', () => {
    expect(isFeatureEnabled({ features: {} }, 'agent_missions_enabled')).toBe(false);
  });

  it('retorna false cuando el flag es false (boolean)', () => {
    expect(isFeatureEnabled({ features: { agent_missions_enabled: false } }, 'agent_missions_enabled')).toBe(false);
  });

  it('retorna false cuando el flag es "false" (string)', () => {
    expect(isFeatureEnabled({ features: { agent_missions_enabled: 'false' } }, 'agent_missions_enabled')).toBe(false);
  });

  it('retorna false cuando el flag es 0', () => {
    expect(isFeatureEnabled({ features: { agent_missions_enabled: 0 } }, 'agent_missions_enabled')).toBe(false);
  });

  it('retorna true cuando el flag es true (boolean)', () => {
    expect(isFeatureEnabled({ features: { agent_missions_enabled: true } }, 'agent_missions_enabled')).toBe(true);
  });

  it('retorna true cuando el flag es "true" (string — coercion defensiva Supabase jsonb)', () => {
    expect(isFeatureEnabled({ features: { agent_missions_enabled: 'true' } }, 'agent_missions_enabled')).toBe(true);
  });

  allFlags.forEach((flag) => {
    it(`retorna true para flag=${flag} con valor true`, () => {
      expect(isFeatureEnabled({ features: { [flag]: true } }, flag)).toBe(true);
    });

    it(`retorna false para flag=${flag} sin valor (default OFF)`, () => {
      expect(isFeatureEnabled({ features: {} }, flag)).toBe(false);
    });
  });

  it('no afecta otros flags cuando uno es true', () => {
    const org = {
      features: {
        agent_missions_enabled: true,
        retrieval_v2_enabled:   false,
        rerank_enabled:         false,
      },
    };
    expect(isFeatureEnabled(org, 'agent_missions_enabled')).toBe(true);
    expect(isFeatureEnabled(org, 'retrieval_v2_enabled')).toBe(false);
    expect(isFeatureEnabled(org, 'rerank_enabled')).toBe(false);
  });
});

// ─── Tests: isFeatureEnabledForPortal (async) ────────────────────────────────

describe('isFeatureEnabledForPortal (async)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna false cuando portalEmail esta vacio', async () => {
    expect(await isFeatureEnabledForPortal('', 'agent_missions_enabled')).toBe(false);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('retorna false cuando portalEmail es solo espacios', async () => {
    expect(await isFeatureEnabledForPortal('   ', 'agent_missions_enabled')).toBe(false);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('retorna false cuando Supabase devuelve error (falla silenciosa)', async () => {
    mockSelectChain({ data: null, error: { message: 'connection error' } });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result  = await isFeatureEnabledForPortal('test@example.com', 'agent_missions_enabled');
    expect(result).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('retorna false cuando el org no existe (data null)', async () => {
    mockSelectChain({ data: null, error: null });

    expect(await isFeatureEnabledForPortal('test@example.com', 'agent_missions_enabled')).toBe(false);
  });

  it('retorna false cuando el flag es false en features del org', async () => {
    mockSelectChain({
      data:  { features: { agent_missions_enabled: false } },
      error: null,
    });

    expect(await isFeatureEnabledForPortal('test@example.com', 'agent_missions_enabled')).toBe(false);
  });

  it('retorna true cuando el flag es true en features del org', async () => {
    mockSelectChain({
      data:  { features: { agent_missions_enabled: true } },
      error: null,
    });

    expect(await isFeatureEnabledForPortal('test@example.com', 'agent_missions_enabled')).toBe(true);
  });

  it('retorna true con coercion string "true"', async () => {
    mockSelectChain({
      data:  { features: { retrieval_v2_enabled: 'true' } },
      error: null,
    });

    expect(await isFeatureEnabledForPortal('test@example.com', 'retrieval_v2_enabled')).toBe(true);
  });

  it('retorna false cuando features es null en el org', async () => {
    mockSelectChain({ data: { features: null }, error: null });

    expect(await isFeatureEnabledForPortal('test@example.com', 'rerank_enabled')).toBe(false);
  });
});

// ─── Tests: setFeatureFlag (async) ───────────────────────────────────────────

describe('setFeatureFlag (async)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lanza cuando portalEmail esta vacio', async () => {
    await expect(setFeatureFlag('', 'agent_missions_enabled', true)).rejects.toThrow(
      'portalEmail es requerido',
    );
  });

  it('activa un flag cuando enabled=true (merge sobre features existentes)', async () => {
    const { updateEqFn } = mockReadThenWrite(
      { data: { features: { retrieval_v2_enabled: false } }, error: null },
      { error: null },
    );

    await setFeatureFlag('client@example.com', 'agent_missions_enabled', true);

    expect(mockUpdate).toHaveBeenCalledWith({
      features: {
        retrieval_v2_enabled:  false,
        agent_missions_enabled: true,
      },
    });
    expect(updateEqFn).toHaveBeenCalledWith('portal_email', 'client@example.com');
  });

  it('desactiva un flag cuando enabled=false (merge preserva otros)', async () => {
    const { updateEqFn } = mockReadThenWrite(
      {
        data:  { features: { agent_missions_enabled: true, retrieval_v2_enabled: true } },
        error: null,
      },
      { error: null },
    );

    await setFeatureFlag('client@example.com', 'agent_missions_enabled', false);

    expect(mockUpdate).toHaveBeenCalledWith({
      features: {
        agent_missions_enabled: false,
        retrieval_v2_enabled:   true,
      },
    });
    expect(updateEqFn).toHaveBeenCalledWith('portal_email', 'client@example.com');
  });

  it('es idempotente: escribir el mismo valor dos veces no lanza', async () => {
    // Primera llamada
    mockReadThenWrite(
      { data: { features: { agent_missions_enabled: true } }, error: null },
      { error: null },
    );

    await expect(
      setFeatureFlag('client@example.com', 'agent_missions_enabled', true),
    ).resolves.toBeUndefined();
  });

  it('crea features desde cero cuando el org no tiene features aun', async () => {
    mockReadThenWrite(
      { data: { features: null }, error: null },
      { error: null },
    );

    await setFeatureFlag('new@example.com', 'rerank_enabled', true);

    expect(mockUpdate).toHaveBeenCalledWith({
      features: { rerank_enabled: true },
    });
  });

  it('lanza cuando Supabase falla al leer el org', async () => {
    const selectEqFn  = vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValueOnce({ data: null, error: { message: 'read error' } }),
    });
    mockFrom.mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: selectEqFn }) });

    await expect(
      setFeatureFlag('client@example.com', 'agent_missions_enabled', true),
    ).rejects.toThrow('Error al leer org');
  });

  it('lanza cuando Supabase falla al escribir el update', async () => {
    mockReadThenWrite(
      { data: { features: {} }, error: null },
      { error: { message: 'write error' } },
    );

    await expect(
      setFeatureFlag('client@example.com', 'agent_missions_enabled', true),
    ).rejects.toThrow('Error al actualizar org');
  });
});
