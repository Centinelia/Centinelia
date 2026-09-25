/**
 * Unit tests para src/lib/tags/whitelist.ts.
 * Mockea el cliente Supabase — no requiere DB real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock del módulo supabase/admin ANTES de importar el módulo bajo test.
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockUpsert = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: mockFrom,
  }),
}));

// Importar DESPUÉS del mock para que el módulo reciba el mock.
import {
  getEffectiveWhitelist,
  addTagToRoleForOrg,
  getAllRoles,
  invalidateWhitelistCache,
} from '@/lib/tags/whitelist';

// Helper para construir respuestas de Supabase encadenables.
function buildChain(returnValue: { data: unknown; error: null | Error }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockResolvedValue(returnValue),
  };
  // Las llamadas encadenadas al final devuelven la promesa.
  // Para select().eq().eq() necesitamos que el ultimo eq() resuelva.
  // Simulamos: from() devuelve un objeto con select() que devuelve un chain.
  return chain;
}

// Resetear mocks y cache antes de cada test.
beforeEach(() => {
  vi.clearAllMocks();
  invalidateWhitelistCache(); // vaciar cache entre tests
});

// Configuración por defecto de from(): retorna un objeto con métodos encadenables.
function setupFromMock(
  defaultData: Record<string, unknown>[] = [],
  additionsData: Record<string, unknown>[] = [],
) {
  let callCount = 0;
  mockFrom.mockImplementation((table: string) => {
    if (table === 'role_default_tag_whitelist') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: defaultData, error: null }),
        }),
      };
    }
    if (table === 'org_role_tag_additions') {
      callCount++;
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: additionsData, error: null }),
          }),
        }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      };
    }
    return {
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    };
  });
}

describe('getEffectiveWhitelist', () => {
  it('retorna la unión de default + additions', async () => {
    setupFromMock(
      [{ tag_slug: 'contabilidad' }, { tag_slug: 'ventas' }],
      [{ tag_slug: 'rh' }],
    );

    const result = await getEffectiveWhitelist('cliente@empresa.com', 'nala');

    expect(result).toContain('contabilidad');
    expect(result).toContain('ventas');
    expect(result).toContain('rh');
    expect(result).toHaveLength(3);
  });

  it('retorna solo defaults cuando no hay additions', async () => {
    setupFromMock([{ tag_slug: 'cobranza' }, { tag_slug: 'fiscal' }], []);

    const result = await getEffectiveWhitelist('cliente@empresa.com', 'nala');

    expect(result.sort()).toEqual(['cobranza', 'fiscal']);
  });

  it('cache hit no re-consulta Supabase', async () => {
    setupFromMock([{ tag_slug: 'ventas' }], []);

    // Primera llamada: llena el cache.
    await getEffectiveWhitelist('cliente@empresa.com', 'nia');
    const callsBefore = mockFrom.mock.calls.length;

    // Segunda llamada: debe usar el cache.
    await getEffectiveWhitelist('cliente@empresa.com', 'nia');
    const callsAfter = mockFrom.mock.calls.length;

    expect(callsAfter).toBe(callsBefore); // no nuevas llamadas
  });

  it('después de invalidateWhitelistCache re-consulta Supabase', async () => {
    setupFromMock([{ tag_slug: 'ventas' }], []);

    await getEffectiveWhitelist('cliente@empresa.com', 'nia');
    const callsBefore = mockFrom.mock.calls.length;

    invalidateWhitelistCache('cliente@empresa.com', 'nia');

    await getEffectiveWhitelist('cliente@empresa.com', 'nia');
    const callsAfter = mockFrom.mock.calls.length;

    expect(callsAfter).toBeGreaterThan(callsBefore);
  });

  it('lanza error si Supabase falla en defaults', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'role_default_tag_whitelist') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: new Error('DB error') }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      };
    });

    await expect(getEffectiveWhitelist('cliente@empresa.com', 'nala')).rejects.toThrow('DB error');
  });
});

describe('addTagToRoleForOrg', () => {
  it('llama upsert con los parámetros correctos', async () => {
    const mockUpsertFn = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'org_role_tag_additions') {
        return { upsert: mockUpsertFn };
      }
      return {};
    });

    await addTagToRoleForOrg('cliente@empresa.com', 'nala', 'rh', 'admin@centinelia.mx');

    expect(mockUpsertFn).toHaveBeenCalledWith({
      portal_email: 'cliente@empresa.com',
      role: 'nala',
      tag_slug: 'rh',
      added_by: 'admin@centinelia.mx',
    });
  });

  it('es idempotente: upsert doble no lanza error', async () => {
    const mockUpsertFn = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'org_role_tag_additions') {
        return { upsert: mockUpsertFn };
      }
      return {};
    });

    await expect(
      addTagToRoleForOrg('cliente@empresa.com', 'nala', 'rh', 'admin@centinelia.mx'),
    ).resolves.not.toThrow();

    await expect(
      addTagToRoleForOrg('cliente@empresa.com', 'nala', 'rh', 'admin@centinelia.mx'),
    ).resolves.not.toThrow();

    expect(mockUpsertFn).toHaveBeenCalledTimes(2);
  });

  it('lanza error si Supabase falla', async () => {
    mockFrom.mockImplementation(() => ({
      upsert: vi.fn().mockResolvedValue({ error: new Error('upsert failed') }),
    }));

    await expect(
      addTagToRoleForOrg('cliente@empresa.com', 'nala', 'rh', 'admin@centinelia.mx'),
    ).rejects.toThrow('upsert failed');
  });
});

describe('getAllRoles', () => {
  it('retorna lista de roles únicos del schema', async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockResolvedValue({
        data: [
          { role: 'nala' },
          { role: 'nia' },
          { role: 'nala' }, // duplicado intencional
          { role: 'nash' },
        ],
        error: null,
      }),
    }));

    const roles = await getAllRoles();

    expect(roles).toContain('nala');
    expect(roles).toContain('nia');
    expect(roles).toContain('nash');
    // No duplicados
    expect(roles.filter((r) => r === 'nala')).toHaveLength(1);
  });

  it('lanza error si Supabase falla', async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockResolvedValue({ data: null, error: new Error('select failed') }),
    }));

    await expect(getAllRoles()).rejects.toThrow('select failed');
  });
});

describe('flujo integrado addTagToRoleForOrg + cache invalidation', () => {
  it('addTagToRoleForOrg invalida cache y el siguiente getEffectiveWhitelist refleja el tag nuevo', async () => {
    // 1ra llamada: llena cache con defaults para 'nala'
    setupFromMock(
      [{ tag_slug: 'contabilidad' }, { tag_slug: 'cobranza' }],
      [],
    );
    const first = await getEffectiveWhitelist('test@example.com', 'nala');
    expect(first.sort()).toEqual(['cobranza', 'contabilidad']);

    // Registrar llamadas a mockFrom hasta ahora
    const callsBefore = mockFrom.mock.calls.length;

    // addTagToRoleForOrg hace upsert + invalida cache
    mockFrom.mockImplementation((table: string) => {
      if (table === 'org_role_tag_additions') {
        return { upsert: vi.fn().mockResolvedValue({ error: null }) };
      }
      return {};
    });
    await addTagToRoleForOrg('test@example.com', 'nala', 'rh', 'user@test');

    // 3ra llamada: cache invalidado, debe re-consultar Supabase e incluir 'rh'
    setupFromMock(
      [{ tag_slug: 'contabilidad' }, { tag_slug: 'cobranza' }],
      [{ tag_slug: 'rh' }],
    );
    const second = await getEffectiveWhitelist('test@example.com', 'nala');
    expect(second.sort()).toEqual(['cobranza', 'contabilidad', 'rh']);

    // Confirma que hubo nuevas llamadas a Supabase (no devolvio cache stale)
    const callsAfter = mockFrom.mock.calls.length;
    expect(callsAfter).toBeGreaterThan(callsBefore);
  });
});

describe('invalidateWhitelistCache', () => {
  it('sin argumentos limpia todo el cache', async () => {
    setupFromMock([{ tag_slug: 'ventas' }], []);

    // Poblar el cache con dos entradas distintas.
    await getEffectiveWhitelist('cliente1@empresa.com', 'nala');
    await getEffectiveWhitelist('cliente2@empresa.com', 'nia');

    const callsBefore = mockFrom.mock.calls.length;

    // Invalidar todo.
    invalidateWhitelistCache();

    // Ambas consultas deben re-ejecutarse.
    await getEffectiveWhitelist('cliente1@empresa.com', 'nala');
    await getEffectiveWhitelist('cliente2@empresa.com', 'nia');

    expect(mockFrom.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('con argumentos solo limpia esa entrada de cache', async () => {
    setupFromMock([{ tag_slug: 'ventas' }], []);

    // Poblar cache con dos entradas.
    await getEffectiveWhitelist('cliente1@empresa.com', 'nala');
    await getEffectiveWhitelist('cliente2@empresa.com', 'nia');

    const callsBefore = mockFrom.mock.calls.length;

    // Invalidar solo cliente1/nala.
    invalidateWhitelistCache('cliente1@empresa.com', 'nala');

    // cliente1/nala debe re-consultar; cliente2/nia sigue cacheada.
    await getEffectiveWhitelist('cliente1@empresa.com', 'nala');
    const callsAfterInvalidated = mockFrom.mock.calls.length;

    await getEffectiveWhitelist('cliente2@empresa.com', 'nia');
    const callsAfterCached = mockFrom.mock.calls.length;

    expect(callsAfterInvalidated).toBeGreaterThan(callsBefore);
    expect(callsAfterCached).toBe(callsAfterInvalidated); // nia sigue cacheada
  });
});
