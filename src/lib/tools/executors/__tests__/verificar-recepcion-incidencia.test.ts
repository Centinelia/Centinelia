// src/lib/tools/executors/__tests__/verificar-recepcion-incidencia.test.ts
import { describe, it, expect, vi } from 'vitest';
import { verificarRecepcionIncidencia } from '../verificar-recepcion-incidencia';

/**
 * Mock Supabase chain que simula:
 * 1. SELECT verification_attempts para leer historial existente
 * 2. UPDATE con resultado + attempts apendeado
 *
 * `existingAttempts` = lo que retorna el SELECT en el mock.
 */
function makeCtx(existingAttempts: unknown[] = []) {
  let phase: 'read' | 'write' = 'read';
  let readEqCalls = 0;
  let writeEqCalls = 0;
  const eqCalls: Array<[string, unknown]> = [];
  const updateCalls: any[] = [];
  const selectCalls: string[] = [];

  const supabase: any = {
    from: vi.fn(() => supabase),
    select: vi.fn((cols: string) => {
      selectCalls.push(cols);
      phase = 'read';
      readEqCalls = 0;
      return supabase;
    }),
    update: vi.fn((args: any) => {
      updateCalls.push(args);
      phase = 'write';
      writeEqCalls = 0;
      return supabase;
    }),
    eq: vi.fn((col: string, val: unknown) => {
      eqCalls.push([col, val]);
      if (phase === 'read') {
        readEqCalls++;
        // read: 2 eq calls (id + agent_id) → then .maybeSingle()
        return supabase;
      } else {
        writeEqCalls++;
        // write: 2 eq calls → then resolve as thenable
        if (writeEqCalls >= 2) {
          return Promise.resolve({ data: null, error: null });
        }
        return supabase;
      }
    }),
    maybeSingle: vi.fn(() =>
      Promise.resolve({ data: { verification_attempts: existingAttempts }, error: null })
    ),
  };
  return { supabase, eqCalls, updateCalls, selectCalls, agent: { id: 'agent-1' } };
}

describe('verificarRecepcionIncidencia', () => {
  it('crea primer attempt cuando el historial está vacío', async () => {
    const ctx = makeCtx([]);
    const res = await verificarRecepcionIncidencia(ctx as any, {
      incident_id: 'inc-1', resultado: 'ok', notas: 'surtido el martes',
    });
    expect(res.ok).toBe(true);
    expect(res.verification_result).toBe('ok');
    expect(res.attempt_number).toBe(1);
    const updateArgs = ctx.updateCalls[0];
    expect(updateArgs.verification_result).toBe('ok');
    expect(updateArgs.verification_result_notes).toBe('surtido el martes');
    expect(Array.isArray(updateArgs.verification_attempts)).toBe(true);
    expect(updateArgs.verification_attempts).toHaveLength(1);
    expect(updateArgs.verification_attempts[0].result).toBe('ok');
    expect(updateArgs.verification_attempts[0].notes).toBe('surtido el martes');
    expect(typeof updateArgs.verification_attempts[0].called_at).toBe('string');
  });

  it('apendea al historial cuando ya hay intentos previos', async () => {
    const prior = [
      { called_at: '2026-08-25T10:00:00.000Z', result: 'sin_respuesta', notes: null },
      { called_at: '2026-08-27T10:00:00.000Z', result: 'no_visitado', notes: 'no ha ido el vendedor' },
    ];
    const ctx = makeCtx(prior);
    const res = await verificarRecepcionIncidencia(ctx as any, {
      incident_id: 'inc-1', resultado: 'ok', notas: 'confirmado surtido hoy',
    });
    expect(res.attempt_number).toBe(3);
    const updateArgs = ctx.updateCalls[0];
    expect(updateArgs.verification_attempts).toHaveLength(3);
    expect(updateArgs.verification_attempts[0]).toEqual(prior[0]);
    expect(updateArgs.verification_attempts[1]).toEqual(prior[1]);
    expect(updateArgs.verification_attempts[2].result).toBe('ok');
    expect(updateArgs.verification_result).toBe('ok');
  });

  it('scope por agent_id en read y write', async () => {
    const ctx = makeCtx([]);
    await verificarRecepcionIncidencia(ctx as any, {
      incident_id: 'inc-1', resultado: 'sin_respuesta',
    });
    // 4 eq calls total: 2 en read (id, agent_id), 2 en write (id, agent_id)
    expect(ctx.eqCalls).toEqual([
      ['id', 'inc-1'], ['agent_id', 'agent-1'],
      ['id', 'inc-1'], ['agent_id', 'agent-1'],
    ]);
  });

  it('rechaza resultado inválido antes de tocar DB', async () => {
    const ctx = makeCtx([]);
    await expect(verificarRecepcionIncidencia(ctx as any, {
      incident_id: 'inc-1', resultado: 'invalido' as any,
    })).rejects.toThrow();
    expect(ctx.updateCalls).toHaveLength(0);
  });

  it('rechaza cuando falta ctx.agent (evita ownership bypass)', async () => {
    const ctx: any = { supabase: {}, agent: null };
    await expect(verificarRecepcionIncidencia(ctx, {
      incident_id: 'inc-1', resultado: 'ok',
    })).rejects.toThrow(/agent\.id/);
  });
});
