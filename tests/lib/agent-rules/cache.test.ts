/**
 * Unit tests para src/lib/agent-rules/cache.ts.
 * Mockea getRulesForAgent del service para no tocar DB.
 *
 * Cubre:
 * - Cache hit no re-query
 * - Cache miss llama service
 * - Invalidación por portal_email borra solo las keys de ese portal
 * - Invalidación total borra todo
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock del service ANTES de importar el módulo bajo test
vi.mock('@/lib/agent-rules/service', () => ({
  getRulesForAgent: vi.fn(),
}));

import { getCachedRulesForAgent, invalidateRulesCache } from '@/lib/agent-rules/cache';
import { getRulesForAgent } from '@/lib/agent-rules/service';

const mockGetRules = vi.mocked(getRulesForAgent);

const PORTAL_A = 'empresa-a@test.com';
const PORTAL_B = 'empresa-b@test.com';

const RULES_A = [
  {
    id: 'r1', portal_email: PORTAL_A, regla: 'Regla 1 de A',
    detalles: null, applies_to: [], active: true,
    created_at: '2026-09-24T12:00:00Z', updated_at: '2026-09-24T12:00:00Z', created_by: null,
  },
];
const RULES_B = [
  {
    id: 'r2', portal_email: PORTAL_B, regla: 'Regla 1 de B',
    detalles: null, applies_to: [], active: true,
    created_at: '2026-09-24T12:00:00Z', updated_at: '2026-09-24T12:00:00Z', created_by: null,
  },
];

describe('agent-rules cache', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Limpiar cache entre tests
    await invalidateRulesCache();
  });

  it('getCachedRulesForAgent llama al service en el primer request', async () => {
    mockGetRules.mockResolvedValue(RULES_A);

    const result = await getCachedRulesForAgent(PORTAL_A, 'nala');

    expect(mockGetRules).toHaveBeenCalledOnce();
    expect(mockGetRules).toHaveBeenCalledWith(PORTAL_A, 'nala');
    expect(result).toEqual(RULES_A);
  });

  it('getCachedRulesForAgent NO llama al service en el segundo request (cache hit)', async () => {
    mockGetRules.mockResolvedValue(RULES_A);

    await getCachedRulesForAgent(PORTAL_A, 'nala');
    await getCachedRulesForAgent(PORTAL_A, 'nala');

    expect(mockGetRules).toHaveBeenCalledOnce();
  });

  it('getCachedRulesForAgent llama al service para distintos (portal, role) pairs', async () => {
    mockGetRules.mockResolvedValueOnce(RULES_A).mockResolvedValueOnce(RULES_B);

    await getCachedRulesForAgent(PORTAL_A, 'nala');
    await getCachedRulesForAgent(PORTAL_B, 'nia');

    expect(mockGetRules).toHaveBeenCalledTimes(2);
  });

  it('invalidateRulesCache(portalEmail) borra solo las keys de ese portal', async () => {
    mockGetRules.mockResolvedValue(RULES_A);
    await getCachedRulesForAgent(PORTAL_A, 'nala');
    await getCachedRulesForAgent(PORTAL_A, 'nia');

    mockGetRules.mockResolvedValue(RULES_B);
    await getCachedRulesForAgent(PORTAL_B, 'noah');

    // Invalidar solo portal A
    await invalidateRulesCache(PORTAL_A);

    // Portal B sigue cacheado — no llama al service
    const callCountBefore = mockGetRules.mock.calls.length;
    await getCachedRulesForAgent(PORTAL_B, 'noah');
    expect(mockGetRules.mock.calls.length).toBe(callCountBefore); // sin nueva llamada

    // Portal A fue invalidado — llama al service
    mockGetRules.mockResolvedValue(RULES_A);
    await getCachedRulesForAgent(PORTAL_A, 'nala');
    expect(mockGetRules.mock.calls.length).toBe(callCountBefore + 1);
  });

  it('invalidateRulesCache() sin args borra todo el cache', async () => {
    mockGetRules.mockResolvedValue(RULES_A);
    await getCachedRulesForAgent(PORTAL_A, 'nala');
    await getCachedRulesForAgent(PORTAL_B, 'nia');

    await invalidateRulesCache();

    // Ambos portales deben re-llamar al service
    const callsAfterInvalidate = mockGetRules.mock.calls.length;
    mockGetRules.mockResolvedValue([]);
    await getCachedRulesForAgent(PORTAL_A, 'nala');
    await getCachedRulesForAgent(PORTAL_B, 'nia');

    expect(mockGetRules.mock.calls.length).toBe(callsAfterInvalidate + 2);
  });

  it('cache miss refetch devuelve el resultado actualizado del service', async () => {
    const original = [...RULES_A];
    const updated  = [{ ...RULES_A[0], regla: 'Regla actualizada' }];

    mockGetRules.mockResolvedValueOnce(original);
    const first = await getCachedRulesForAgent(PORTAL_A, 'nala');
    expect(first[0].regla).toBe('Regla 1 de A');

    await invalidateRulesCache(PORTAL_A);

    mockGetRules.mockResolvedValueOnce(updated);
    const second = await getCachedRulesForAgent(PORTAL_A, 'nala');
    expect(second[0].regla).toBe('Regla actualizada');
  });
});
