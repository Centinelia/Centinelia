/**
 * Integration test real para match_ficha_chunks_filtered contra Supabase.
 *
 * Este test hace una query real contra la DB usando el RPC
 * match_ficha_chunks_filtered. Requiere:
 *   - TEST_PORTAL_EMAIL seteado en .env.local o entorno.
 *   - Una org real con fichas_informativas y fichas_informativas_chunks cargados.
 *   - El RPC match_ficha_chunks_filtered desplegado (migration 20260925160000).
 *
 * Se omite automáticamente si TEST_PORTAL_EMAIL no está seteado.
 *
 * Para correr: npm run test:integration
 *
 * IMPORTANTE: nunca usar correos de clientes reales como TEST_PORTAL_EMAIL.
 * Usar exclusivamente nazre20@gmail.com o un org de prueba propio de Nazre.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { assertNotProdOrAllowed } from '@/lib/test-helpers/prod-guard';
import { createAdminClient } from '@/lib/supabase/admin';

const TEST_EMAIL = process.env.TEST_PORTAL_EMAIL;

// Si no hay TEST_PORTAL_EMAIL, skip todo el suite.
const describeOrSkip = TEST_EMAIL ? describe : describe.skip;

describeOrSkip('match_ficha_chunks_filtered — live integration', () => {
  beforeAll(async () => {
    await assertNotProdOrAllowed();
  });

  it('RPC responde sin error con whitelist vacía (devuelve solo _untagged_)', async () => {
    if (!TEST_EMAIL) return; // guard adicional por si describeOrSkip no funciona en entorno

    const supabase = createAdminClient();

    // Embedding de ceros — válido para probar que el RPC resuelve sin error.
    // El resultado semántico no importa en este test — importa que el RPC no falla.
    const zeroEmbedding = new Array(1536).fill(0);

    const { data, error } = await supabase.rpc('match_ficha_chunks_filtered', {
      p_portal_email:        TEST_EMAIL,
      p_query_embedding:     zeroEmbedding,
      p_effective_whitelist: [], // whitelist vacía → solo _untagged_ deben pasar
      p_limit:               5,
    });

    expect(error).toBeNull();
    // Con whitelist vacía, solo fichas con tags = ['_untagged_'] pasan.
    // Si el org no tiene fichas _untagged_, data es []. Ambos son correctos.
    expect(Array.isArray(data)).toBe(true);

    // Validar que ninguna fila tenga tags que no sean _untagged_ (C1 regression check)
    if (data && data.length > 0) {
      for (const row of data) {
        const tags: string[] = row.tags ?? [];
        expect(tags).toContain('_untagged_');
      }
    }
  });

  it('RPC tsvector_search_fichas_chunks responde ordenado por rank', async () => {
    if (!TEST_EMAIL) return;

    const supabase = createAdminClient();

    const { data, error } = await supabase.rpc('tsvector_search_fichas_chunks', {
      p_portal_email: TEST_EMAIL,
      p_query:        'información',
      p_limit:        5,
    });

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);

    // Verificar que viene ordenado por rank descendente
    if (data && data.length >= 2) {
      for (let i = 1; i < data.length; i++) {
        expect(data[i - 1].rank).toBeGreaterThanOrEqual(data[i].rank);
      }
    }
  });
});
