/**
 * centinelia-billing.test.ts — helpers de idempotencia sobre centinelia_billing.
 *
 * Prueba yaFacturadoEsteCiclo (cfdi/rep) y yaNotificadoEsteCiclo (notify_sent
 * en modo NEKA_NOTIFY_ONLY). Ambos siguen el mismo patron pero devuelven
 * shapes distintas — event vs boolean — para diferenciar "hay evento previo"
 * (necesitas datos) de "ya se hizo" (solo saltar).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { yaFacturadoEsteCiclo, yaNotificadoEsteCiclo } from '../centinelia-billing';

function makeChainable(finalResponse: { data: unknown; error: unknown }) {
  const chain: {
    select:      ReturnType<typeof vi.fn>;
    eq:          ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
  } = {
    select:      vi.fn(),
    eq:          vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(finalResponse),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  return chain;
}

function makeSupabase(finalResponse: { data: unknown; error: unknown }) {
  const chain = makeChainable(finalResponse);
  return {
    from: vi.fn().mockReturnValue(chain),
    _chain: chain,
  } as unknown as SupabaseClient & { _chain: ReturnType<typeof makeChainable>; from: ReturnType<typeof vi.fn> };
}

describe('yaNotificadoEsteCiclo', () => {
  beforeEach(() => vi.clearAllMocks());

  it('regresa true cuando hay row para (cliente, ciclo, tipo=notify_sent)', async () => {
    const supabase = makeSupabase({ data: { id: 'evt-123' }, error: null });

    const result = await yaNotificadoEsteCiclo('cliente-1', '2026-09', supabase);

    expect(result).toBe(true);
    expect(supabase.from).toHaveBeenCalledWith('centinelia_billing');
    // Verifica que filtra por los 3 campos correctos
    const eqCalls = (supabase._chain.eq as ReturnType<typeof vi.fn>).mock.calls;
    expect(eqCalls).toContainEqual(['cliente_id', 'cliente-1']);
    expect(eqCalls).toContainEqual(['ciclo_key',  '2026-09']);
    expect(eqCalls).toContainEqual(['tipo',       'notify_sent']);
  });

  it('regresa false cuando maybeSingle devuelve null', async () => {
    const supabase = makeSupabase({ data: null, error: null });
    const result = await yaNotificadoEsteCiclo('cliente-2', '2026-10', supabase);
    expect(result).toBe(false);
  });

  it('lanza error si Supabase reporta error', async () => {
    const supabase = makeSupabase({ data: null, error: { message: 'row level security' } });
    await expect(yaNotificadoEsteCiclo('cliente-3', '2026-11', supabase))
      .rejects.toThrow(/yaNotificadoEsteCiclo.*row level security/);
  });
});

describe('yaFacturadoEsteCiclo', () => {
  beforeEach(() => vi.clearAllMocks());

  it('regresa el evento cuando ya existe cfdi_emitido para el ciclo', async () => {
    const evento = {
      id:         'evt-cfdi-1',
      cliente_id: 'cliente-x',
      tipo:       'cfdi_emitido',
      ciclo_key:  '2026-09',
      cfdi_uuid:  'uuid-abc',
    };
    const supabase = makeSupabase({ data: evento, error: null });

    const result = await yaFacturadoEsteCiclo('cliente-x', '2026-09', 'cfdi_emitido', supabase);

    expect(result).toMatchObject({ id: 'evt-cfdi-1', cfdi_uuid: 'uuid-abc' });
  });

  it('regresa null cuando no hay evento previo', async () => {
    const supabase = makeSupabase({ data: null, error: null });
    const result = await yaFacturadoEsteCiclo('cliente-y', '2026-09', 'rep_emitido', supabase);
    expect(result).toBeNull();
  });
});
