// Test de searchFichas usando cliente Supabase mockeado. Valida que:
//   1. Compone embedding + rpc + select en la secuencia correcta.
//   2. Agrupa chunks por ficha y dedupe.
//   3. Confidence se deriva del mejor score.
//   4. suggested_ficha lleva contactos de la ficha top.
//   5. topK respeta el default.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mockear supabase admin ANTES de importar search
vi.mock('@/lib/supabase/admin', () => {
  const state = { rpcArgs: null as unknown, hitsToReturn: [] as unknown[], fichasToReturn: [] as unknown[] };
  const client = {
    rpc: vi.fn(async (_name: string, args: unknown) => {
      state.rpcArgs = args;
      return { data: state.hitsToReturn, error: null };
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

import { searchFichas } from '../search';
import * as adminMod from '@/lib/supabase/admin';

const mock = (adminMod as unknown as { __mock: { __state: { hitsToReturn: unknown[]; fichasToReturn: unknown[]; rpcArgs: unknown }; rpc: ReturnType<typeof vi.fn> } }).__mock;

describe('searchFichas', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.MOCK_EMBEDDINGS = '1';
    mock.__state.hitsToReturn = [];
    mock.__state.fichasToReturn = [];
    mock.__state.rpcArgs = null;
    mock.rpc.mockClear();
  });
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('devuelve vacío si la query está vacía', async () => {
    const r = await searchFichas('   ', 'santiago-dev@centinelia.mx');
    expect(r.matches).toEqual([]);
    expect(r.suggested_ficha).toBeNull();
    expect(r.confidence).toBe('low');
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it('agrupa chunks por ficha y devuelve top-K deduplicado', async () => {
    mock.__state.hitsToReturn = [
      { chunk_id: 'c1', ficha_id: 'f1', chunk_index: 0, section_type: 'header',      content: 'Predial',     token_count: 20, similarity: 0.92 },
      { chunk_id: 'c2', ficha_id: 'f1', chunk_index: 3, section_type: 'requisitos',  content: 'Requisitos',  token_count: 40, similarity: 0.88 },
      { chunk_id: 'c3', ficha_id: 'f2', chunk_index: 0, section_type: 'header',      content: 'Multas',      token_count: 20, similarity: 0.65 },
    ];
    mock.__state.fichasToReturn = [
      { id: 'f1', codigo: 'TS-SFT-RIN-02', titulo: 'Pago del Impuesto Predial', dependencia: 'SFT', unidad_administrativa: 'Recaudación', contacto_nombre: 'Elvira', contacto_puesto: 'Directora', contacto_correo: 'predial@santiago.gob.mx', contacto_telefono: '8121335851', contacto_extension: '2174', liga_en_linea: 'https://pagopredial', horario: 'L-V 8-15', direccion: 'Calle Mina', costo_descripcion: null, plazo_respuesta: '1 Día' },
      { id: 'f2', codigo: 'TS-SFT-ING-01', titulo: 'Multas de Tránsito',        dependencia: 'SFT', unidad_administrativa: 'Ingresos',    contacto_nombre: 'Maria', contacto_puesto: 'Directora', contacto_correo: 'ingresos@santiago.gob.mx',  contacto_telefono: '8121335851', contacto_extension: '2142', liga_en_linea: 'https://pagotransito', horario: 'L-V 8-16', direccion: 'Calle Mina', costo_descripcion: 'Desde $207', plazo_respuesta: '10 Días' },
    ];

    const r = await searchFichas('cómo pago el predial', 'santiago-dev@centinelia.mx', { topK: 5 });
    expect(r.matches).toHaveLength(2);
    expect(r.matches[0].ficha_id).toBe('f1');
    expect(r.matches[0].chunks).toHaveLength(2);
    expect(r.matches[0].chunks[0].similarity).toBe(0.92);
    expect(r.suggested_ficha?.contacto_correo).toBe('predial@santiago.gob.mx');
    expect(r.suggested_ficha?.contacto_extension).toBe('2174');
    expect(r.confidence).toBe('high');
    expect(r.total_hits).toBe(3);
  });

  it('confidence = medium para similarity entre 0.4 y 0.7', async () => {
    mock.__state.hitsToReturn = [{ chunk_id: 'c1', ficha_id: 'f1', chunk_index: 0, section_type: 'x', content: 'y', token_count: 1, similarity: 0.55 }];
    mock.__state.fichasToReturn = [{ id: 'f1', codigo: 'X', titulo: 'X', dependencia: null, unidad_administrativa: null, contacto_nombre: null, contacto_puesto: null, contacto_correo: null, contacto_telefono: null, contacto_extension: null, liga_en_linea: null, horario: null, direccion: null, costo_descripcion: null, plazo_respuesta: null }];
    const r = await searchFichas('query', 'santiago-dev@centinelia.mx');
    expect(r.confidence).toBe('medium');
  });

  it('confidence = low para similarity < 0.4', async () => {
    mock.__state.hitsToReturn = [{ chunk_id: 'c1', ficha_id: 'f1', chunk_index: 0, section_type: 'x', content: 'y', token_count: 1, similarity: 0.2 }];
    mock.__state.fichasToReturn = [{ id: 'f1', codigo: 'X', titulo: 'X', dependencia: null, unidad_administrativa: null, contacto_nombre: null, contacto_puesto: null, contacto_correo: null, contacto_telefono: null, contacto_extension: null, liga_en_linea: null, horario: null, direccion: null, costo_descripcion: null, plazo_respuesta: null }];
    const r = await searchFichas('query', 'santiago-dev@centinelia.mx');
    expect(r.confidence).toBe('low');
  });

  it('devuelve vacío si la RPC no retorna hits', async () => {
    mock.__state.hitsToReturn = [];
    const r = await searchFichas('query', 'santiago-dev@centinelia.mx');
    expect(r.matches).toEqual([]);
    expect(r.suggested_ficha).toBeNull();
  });

  it('llama RPC con portal_email filter y match_count=max(topK*2, 10)', async () => {
    mock.__state.hitsToReturn = [];
    await searchFichas('query', 'santiago-dev@centinelia.mx', { topK: 3 });
    expect(mock.rpc).toHaveBeenCalledWith('match_ficha_chunks', expect.objectContaining({
      portal_email_filter: 'santiago-dev@centinelia.mx',
      match_count: 10, // max(3*2, 10) = 10
    }));

    mock.rpc.mockClear();
    await searchFichas('query', 'santiago-dev@centinelia.mx', { topK: 8 });
    expect(mock.rpc).toHaveBeenCalledWith('match_ficha_chunks', expect.objectContaining({
      match_count: 16, // max(8*2, 10) = 16
    }));
  });
});
