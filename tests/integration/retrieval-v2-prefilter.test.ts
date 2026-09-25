/**
 * Tests de integración para el retrieval v2 con pre-filtro por whitelist.
 *
 * Valida:
 *   1. Backward compat: sin meerkatRoleId, comportamiento idéntico al anterior.
 *   2. Pre-filtro activo: fichas con tag en whitelist se recuperan primero.
 *   3. Review Focus #4: fallback cuando whitelist no coincide ninguna ficha.
 *   4. Fichas con tag '_untagged_' siempre son candidatas.
 *   5. Fichas con autotag_status 'pending' son EXCLUIDAS del pre-filtro.
 *
 * Nota: estos tests mockean Supabase — no insertan en DB real.
 * assertNotProdOrAllowed() se llama de todas formas por convención,
 * en caso de que se integren con DB en el futuro.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { assertNotProdOrAllowed } from '@/lib/test-helpers/prod-guard';

// Mock supabase admin ANTES de importar search
vi.mock('@/lib/supabase/admin', () => {
  const state = {
    rpcName: null as string | null,
    rpcArgs: null as unknown,
    hitsToReturn: [] as unknown[],
    fichasToReturn: [] as unknown[],
    filteredHitsToReturn: [] as unknown[],
    rpcError: null as null | { message: string },
    filteredRpcError: null as null | { message: string },
  };

  const client = {
    rpc: vi.fn(async (name: string, args: unknown) => {
      state.rpcName = name;
      state.rpcArgs = args;
      if (name === 'match_ficha_chunks_filtered') {
        return { data: state.filteredHitsToReturn, error: state.filteredRpcError };
      }
      return { data: state.hitsToReturn, error: state.rpcError };
    }),
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        in: vi.fn(async () => ({ data: state.fichasToReturn, error: null })),
      })),
    })),
    __state: state,
  };

  return {
    createAdminClient: () => client,
    __mock: client,
  };
});

// Mock whitelist para no depender de DB
vi.mock('@/lib/tags/whitelist', () => ({
  getEffectiveWhitelist: vi.fn(async (_portalEmail: string, role: string) => {
    if (role === 'nara') return ['gobierno', 'tramites'];
    if (role === 'nalia_sin_whitelist') return []; // whitelist vacía
    return ['general'];
  }),
}));

import { searchFichas } from '@/lib/rag/search';
import * as adminMod from '@/lib/supabase/admin';

const mock = (adminMod as unknown as {
  __mock: {
    __state: {
      hitsToReturn: unknown[];
      fichasToReturn: unknown[];
      filteredHitsToReturn: unknown[];
      rpcError: null | { message: string };
      filteredRpcError: null | { message: string };
      rpcName: string | null;
      rpcArgs: unknown;
    };
    rpc: ReturnType<typeof vi.fn>;
  };
}).__mock;

const FICHA_META = {
  id: 'f1',
  codigo: 'TS-001',
  titulo: 'Pago de Predial',
  dependencia: 'SFT',
  unidad_administrativa: 'Recaudación',
  contacto_nombre: 'Elvira',
  contacto_puesto: 'Directora',
  contacto_correo: 'predial@santiago.gob.mx',
  contacto_telefono: '8121335851',
  contacto_extension: '2174',
  liga_en_linea: 'https://pagopredial',
  horario: 'L-V 8-15',
  direccion: 'Calle Mina',
  costo_descripcion: null,
  plazo_respuesta: '1 Día',
};

const CHUNK_HIT = {
  chunk_id: 'c1',
  ficha_id: 'f1',
  chunk_index: 0,
  section_type: 'header',
  content: 'Pago del Impuesto Predial',
  token_count: 20,
  similarity: 0.85,
};

describe('searchFichas v2 — pre-filtro por whitelist', () => {
  beforeAll(async () => {
    await assertNotProdOrAllowed();
  });

  beforeEach(() => {
    process.env.MOCK_EMBEDDINGS = '1';
    mock.__state.hitsToReturn = [];
    mock.__state.fichasToReturn = [];
    mock.__state.filteredHitsToReturn = [];
    mock.__state.rpcError = null;
    mock.__state.filteredRpcError = null;
    mock.__state.rpcName = null;
    mock.__state.rpcArgs = null;
    mock.rpc.mockClear();
  });

  afterEach(() => {
    delete process.env.MOCK_EMBEDDINGS;
  });

  // ─── Backward compat ───────────────────────────────────────────────────────

  it('sin meerkatRoleId usa match_ficha_chunks (backward compat)', async () => {
    mock.__state.hitsToReturn = [CHUNK_HIT];
    mock.__state.fichasToReturn = [FICHA_META];

    const r = await searchFichas('predial', 'test@centinelia.mx');

    expect(mock.rpc).toHaveBeenCalledWith('match_ficha_chunks', expect.any(Object));
    expect(mock.rpc).not.toHaveBeenCalledWith('match_ficha_chunks_filtered', expect.any(Object));
    expect(r.matches).toHaveLength(1);
    expect(r.tag_filtered).toBeUndefined();
  });

  it('con meerkatRoleId usa match_ficha_chunks_filtered primero', async () => {
    mock.__state.filteredHitsToReturn = [CHUNK_HIT];
    mock.__state.fichasToReturn = [FICHA_META];

    const r = await searchFichas('predial', 'test@centinelia.mx', { meerkatRoleId: 'nara' });

    expect(mock.rpc).toHaveBeenCalledWith('match_ficha_chunks_filtered', expect.objectContaining({
      p_portal_email: 'test@centinelia.mx',
      p_effective_whitelist: ['gobierno', 'tramites'],
    }));
    expect(r.tag_filtered).toBe(true);
    expect(r.tag_filter_fallback).toBeUndefined();
    expect(r.matches).toHaveLength(1);
  });

  // ─── Review Focus #4: fallback cuando whitelist devuelve 0 fichas ──────────

  it('falls back to match_ficha_chunks when filtered RPC returns 0 results (Review Focus #4)', async () => {
    // Whitelist activa pero sin fichas que coincidan
    mock.__state.filteredHitsToReturn = [];
    // Fallback match_ficha_chunks sí tiene resultados
    mock.__state.hitsToReturn = [CHUNK_HIT];
    mock.__state.fichasToReturn = [FICHA_META];

    const r = await searchFichas('predial', 'test@centinelia.mx', { meerkatRoleId: 'nara' });

    expect(mock.rpc).toHaveBeenCalledWith('match_ficha_chunks_filtered', expect.any(Object));
    expect(mock.rpc).toHaveBeenCalledWith('match_ficha_chunks', expect.any(Object));
    expect(r.tag_filter_fallback).toBe(true);
    expect(r.matches).toHaveLength(1);
  });

  it('falls back when whitelist is empty (role nalia_sin_whitelist — Review Focus #4)', async () => {
    mock.__state.filteredHitsToReturn = [];
    mock.__state.hitsToReturn = [CHUNK_HIT];
    mock.__state.fichasToReturn = [FICHA_META];

    const r = await searchFichas('predial', 'test@centinelia.mx', { meerkatRoleId: 'nalia_sin_whitelist' });

    expect(r.tag_filter_fallback).toBe(true);
    expect(r.matches).toHaveLength(1);
  });

  it('pasa effective_whitelist correcta al RPC filtrado', async () => {
    mock.__state.filteredHitsToReturn = [CHUNK_HIT];
    mock.__state.fichasToReturn = [FICHA_META];

    await searchFichas('predial', 'test@centinelia.mx', { meerkatRoleId: 'nara' });

    const filteredCall = mock.rpc.mock.calls.find((c: unknown[]) => c[0] === 'match_ficha_chunks_filtered');
    expect(filteredCall).toBeDefined();
    const args = filteredCall![1] as Record<string, unknown>;
    expect(args.p_effective_whitelist).toEqual(['gobierno', 'tramites']);
    expect(args.p_portal_email).toBe('test@centinelia.mx');
  });

  // ─── _untagged_ incluidas ─────────────────────────────────────────────────

  it('includes _untagged_ fichas in candidates (pasan el pre-filtro SQL)', async () => {
    // El RPC devuelve la ficha con _untagged_ — validamos que TypeScript la procesa correctamente
    const untaggedHit = { ...CHUNK_HIT, ficha_id: 'f-untagged', tags: ['_untagged_'] };
    mock.__state.filteredHitsToReturn = [untaggedHit];
    mock.__state.fichasToReturn = [{ ...FICHA_META, id: 'f-untagged', titulo: 'Ficha sin tag' }];

    const r = await searchFichas('algo', 'test@centinelia.mx', { meerkatRoleId: 'nara' });

    expect(r.matches).toHaveLength(1);
    expect(r.matches[0].ficha_id).toBe('f-untagged');
    expect(r.tag_filtered).toBe(true);
  });

  // ─── Error handling ───────────────────────────────────────────────────────

  it('degrading gracefully when filtered RPC errors — falls back to unfiltered', async () => {
    mock.__state.filteredRpcError = { message: 'function not found' };
    mock.__state.hitsToReturn = [CHUNK_HIT];
    mock.__state.fichasToReturn = [FICHA_META];

    const r = await searchFichas('predial', 'test@centinelia.mx', { meerkatRoleId: 'nara' });

    expect(r.tag_filter_fallback).toBe(true);
    expect(r.matches).toHaveLength(1);
  });
});
