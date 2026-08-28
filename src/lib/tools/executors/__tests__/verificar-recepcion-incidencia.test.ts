// src/lib/tools/executors/__tests__/verificar-recepcion-incidencia.test.ts
import { describe, it, expect, vi } from 'vitest';
import { verificarRecepcionIncidencia } from '../verificar-recepcion-incidencia';

function makeCtx() {
  const eqCalls: Array<[string, unknown]> = [];
  const supabase: any = {
    from: vi.fn(() => supabase),
    update: vi.fn(() => supabase),
    eq: vi.fn((col: string, val: unknown) => {
      eqCalls.push([col, val]);
      // Return a thenable on the second .eq() call so the executor can await it.
      if (eqCalls.length >= 2) {
        return Promise.resolve({ data: null, error: null });
      }
      return supabase;
    }),
  };
  return { supabase, eqCalls, agent: { id: 'agent-1' } };
}

describe('verificarRecepcionIncidencia', () => {
  it('updates incident with resultado=ok and scopes by agent_id', async () => {
    const ctx = makeCtx();
    const res = await verificarRecepcionIncidencia(ctx as any, {
      incident_id: 'inc-1', resultado: 'ok', notas: 'surtido el martes',
    });
    expect(res.ok).toBe(true);
    expect(res.verification_result).toBe('ok');
    const updateArgs = ctx.supabase.update.mock.calls[0][0];
    expect(updateArgs.verification_result).toBe('ok');
    expect(updateArgs.verification_result_notes).toBe('surtido el martes');
    // Ownership scope: must chain .eq('id', ...) AND .eq('agent_id', ...)
    expect(ctx.eqCalls).toEqual([
      ['id', 'inc-1'],
      ['agent_id', 'agent-1'],
    ]);
  });

  it('rejects invalid resultado', async () => {
    const ctx = makeCtx();
    await expect(verificarRecepcionIncidencia(ctx as any, {
      incident_id: 'inc-1', resultado: 'invalido' as any,
    })).rejects.toThrow();
  });

  it('throws when ctx.agent is missing (guards against ownership bypass)', async () => {
    const ctx: any = { supabase: {}, agent: null };
    await expect(verificarRecepcionIncidencia(ctx, {
      incident_id: 'inc-1', resultado: 'ok',
    })).rejects.toThrow(/agent\.id/);
  });
});
