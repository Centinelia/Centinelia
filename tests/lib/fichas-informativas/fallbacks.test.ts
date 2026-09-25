/**
 * Tests unitarios para src/lib/fichas-informativas/fallbacks.ts.
 * Mockea el cliente Supabase admin — no requiere DB real.
 *
 * Cubre:
 *   1. tsvectorFallback con query vacía retorna [] sin llamar Supabase.
 *   2. tsvectorFallback con query válida mapea resultados correctamente
 *      (incluyendo titulo de la relacion fichas_informativas).
 *   3. tsvectorFallback con error de Supabase retorna [] + console.warn.
 *   4. tsvectorFallback con excepción del client retorna [] + console.warn.
 *   5. updatedAtFallback con org sin fichas retorna [].
 *   6. updatedAtFallback con fichas y chunks retorna primer chunk de cada ficha.
 *   7. updatedAtFallback con fichas sin chunks retorna [] (skipping fichas vacías).
 *   8. updatedAtFallback con error retorna [] + console.warn.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock del módulo supabase/admin ANTES de importar el módulo bajo test.
const mockFrom = vi.fn();
const mockRpc = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: mockFrom,
    rpc: mockRpc,
  }),
}));

// Importar DESPUÉS del mock.
import {
  tsvectorFallback,
  updatedAtFallback,
  type FallbackFichaChunk,
} from '@/lib/fichas-informativas/fallbacks';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Configura el mock del RPC tsvector_search_fichas_chunks para tsvectorFallback.
 * La función ahora llama directamente a supabase.rpc() en lugar de encadenar
 * .from().select().eq().textSearch().limit().
 */
function mockTsvectorRpc(result: { data: unknown; error: unknown }) {
  mockRpc.mockResolvedValue(result);
  return { mockRpc };
}

/**
 * Construye una cadena de mocks para updatedAtFallback:
 * from().select().eq().order().limit()
 */
function mockUpdatedAtChain(result: { data: unknown; error: unknown }) {
  const limitFn = vi.fn().mockResolvedValue(result);
  const orderFn = vi.fn().mockReturnValue({ limit: limitFn });
  const eqFn = vi.fn().mockReturnValue({ order: orderFn });
  const selectFn = vi.fn().mockReturnValue({ eq: eqFn });
  mockFrom.mockReturnValue({ select: selectFn });
  return { selectFn, eqFn, orderFn, limitFn };
}

// ─── tsvectorFallback ─────────────────────────────────────────────────────────

describe('tsvectorFallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna [] sin llamar Supabase cuando query es vacía', async () => {
    const result = await tsvectorFallback('org@test.com', '   ', 15);
    expect(result).toEqual([]);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('retorna [] sin llamar Supabase cuando query es string vacío', async () => {
    const result = await tsvectorFallback('org@test.com', '', 15);
    expect(result).toEqual([]);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('llama al RPC con los parámetros correctos', async () => {
    mockTsvectorRpc({ data: [], error: null });

    await tsvectorFallback('org@test.com', 'impuesto predial', 10);

    expect(mockRpc).toHaveBeenCalledWith('tsvector_search_fichas_chunks', {
      p_portal_email: 'org@test.com',
      p_query:        'impuesto predial',
      p_limit:        10,
    });
  });

  it('mapea resultados correctamente incluyendo titulo de la relacion', async () => {
    // El RPC devuelve filas planas (no relaciones anidadas) con rank incluido
    const dbRows = [
      {
        id:       'chunk-1',
        content:  'Texto sobre impuesto predial',
        ficha_id: 'ficha-1',
        titulo:   'Predial municipal',
        rank:     0.85,
      },
      {
        id:       'chunk-2',
        content:  'Texto sobre licencias de construcción',
        ficha_id: 'ficha-2',
        titulo:   'Licencias',
        rank:     0.60,
      },
    ];

    mockTsvectorRpc({ data: dbRows, error: null });

    const result = await tsvectorFallback('org@test.com', 'impuesto predial', 15);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual<FallbackFichaChunk>({
      id:       'chunk-1',
      content:  'Texto sobre impuesto predial',
      ficha_id: 'ficha-1',
      titulo:   'Predial municipal',
    });
    expect(result[1]).toEqual<FallbackFichaChunk>({
      id:       'chunk-2',
      content:  'Texto sobre licencias de construcción',
      ficha_id: 'ficha-2',
      titulo:   'Licencias',
    });
  });

  it('maneja titulo undefined cuando el RPC devuelve null', async () => {
    const dbRows = [
      {
        id:       'chunk-3',
        content:  'Contenido sin titulo',
        ficha_id: 'ficha-3',
        titulo:   null,
        rank:     0.40,
      },
    ];

    mockTsvectorRpc({ data: dbRows, error: null });

    const result = await tsvectorFallback('org@test.com', 'consulta', 15);

    expect(result).toHaveLength(1);
    expect(result[0].titulo).toBeUndefined();
  });

  it('retorna [] y emite console.warn cuando Supabase devuelve error', async () => {
    mockTsvectorRpc({ data: null, error: { message: 'text search config not found' } });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await tsvectorFallback('org@test.com', 'predial', 15);

    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      '[retrieval] tsvector_fallback query error:',
      expect.objectContaining({ query: 'predial' }),
    );
    warnSpy.mockRestore();
  });

  it('retorna [] y emite console.warn cuando el client lanza excepción', async () => {
    mockRpc.mockImplementation(() => {
      throw new Error('connection refused');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await tsvectorFallback('org@test.com', 'predial', 15);

    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      '[retrieval] tsvector_fallback exception:',
      expect.objectContaining({ query: 'predial', error: 'connection refused' }),
    );
    warnSpy.mockRestore();
  });
});

// ─── updatedAtFallback ────────────────────────────────────────────────────────

describe('updatedAtFallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna [] cuando el org no tiene fichas', async () => {
    mockUpdatedAtChain({ data: [], error: null });

    const result = await updatedAtFallback('org@test.com', 5);
    expect(result).toEqual([]);
  });

  it('retorna el primer chunk de cada ficha ordenado por updated_at', async () => {
    const dbRows = [
      {
        id: 'ficha-a',
        titulo: 'Ficha reciente',
        fichas_informativas_chunks: [
          { id: 'chunk-a1', content: 'Contenido chunk A1', ficha_id: 'ficha-a' },
          { id: 'chunk-a2', content: 'Contenido chunk A2', ficha_id: 'ficha-a' },
        ],
      },
      {
        id: 'ficha-b',
        titulo: 'Ficha antigua',
        fichas_informativas_chunks: [
          { id: 'chunk-b1', content: 'Contenido chunk B1', ficha_id: 'ficha-b' },
        ],
      },
    ];

    mockUpdatedAtChain({ data: dbRows, error: null });

    const result = await updatedAtFallback('org@test.com', 5);

    expect(result).toHaveLength(2);
    // Solo primer chunk de cada ficha
    expect(result[0]).toEqual<FallbackFichaChunk>({
      id:       'chunk-a1',
      content:  'Contenido chunk A1',
      ficha_id: 'ficha-a',
      titulo:   'Ficha reciente',
    });
    expect(result[1]).toEqual<FallbackFichaChunk>({
      id:       'chunk-b1',
      content:  'Contenido chunk B1',
      ficha_id: 'ficha-b',
      titulo:   'Ficha antigua',
    });
  });

  it('skips fichas sin chunks y retorna [] si ninguna tiene chunks', async () => {
    const dbRows = [
      {
        id: 'ficha-sin-chunks',
        titulo: 'Ficha sin contenido',
        fichas_informativas_chunks: [],
      },
      {
        id: 'ficha-null-chunks',
        titulo: 'Ficha null',
        fichas_informativas_chunks: null,
      },
    ];

    mockUpdatedAtChain({ data: dbRows, error: null });

    const result = await updatedAtFallback('org@test.com', 5);
    expect(result).toEqual([]);
  });

  it('skips fichas sin chunks y devuelve solo las que tienen', async () => {
    const dbRows = [
      {
        id: 'ficha-con-chunks',
        titulo: 'Tiene contenido',
        fichas_informativas_chunks: [
          { id: 'chunk-c1', content: 'Texto C1', ficha_id: 'ficha-con-chunks' },
        ],
      },
      {
        id: 'ficha-vacia',
        titulo: 'Sin contenido',
        fichas_informativas_chunks: [],
      },
    ];

    mockUpdatedAtChain({ data: dbRows, error: null });

    const result = await updatedAtFallback('org@test.com', 5);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('chunk-c1');
  });

  it('retorna [] y emite console.warn cuando Supabase devuelve error', async () => {
    mockUpdatedAtChain({ data: null, error: { message: 'query timeout' } });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await updatedAtFallback('org@test.com', 5);

    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      '[retrieval] updated_at_fallback query error:',
      expect.objectContaining({ error: 'query timeout' }),
    );
    warnSpy.mockRestore();
  });
});
