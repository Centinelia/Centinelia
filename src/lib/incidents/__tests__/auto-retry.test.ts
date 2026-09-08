import { describe, it, expect, vi } from 'vitest';
import { decideIncidentAutoRetry, MAX_VERIFICATION_ATTEMPTS } from '../auto-retry';

function mockSupabase(incidentAttempts: Array<{ result: string }> | null) {
  const supabase: any = {
    from: vi.fn(() => supabase),
    select: vi.fn(() => supabase),
    eq: vi.fn(() => supabase),
    maybeSingle: vi.fn(() => Promise.resolve({
      data: incidentAttempts === null
        ? null
        : { verification_attempts: incidentAttempts },
      error: null,
    })),
  };
  return supabase;
}

describe('decideIncidentAutoRetry', () => {
  it('devuelve null si contacto no es de client_incident', async () => {
    const supabase = mockSupabase(null);
    const decision = await decideIncidentAutoRetry(supabase, {
      external_source: 'llamada_entrante', external_id: 'X',
    });
    expect(decision).toBeNull();
  });

  it('devuelve null si no hay external_id', async () => {
    const supabase = mockSupabase(null);
    const decision = await decideIncidentAutoRetry(supabase, {
      external_source: 'client_incident', external_id: null,
    });
    expect(decision).toBeNull();
  });

  it('completed si el último attempt fue ok', async () => {
    const supabase = mockSupabase([
      { result: 'sin_respuesta' },
      { result: 'ok' },
    ]);
    const decision = await decideIncidentAutoRetry(supabase, {
      external_source: 'client_incident', external_id: 'inc-1',
    });
    expect(decision).toEqual({ toStatus: 'completed', reason: 'incident_verified_ok' });
  });

  it('completed si no hay attempts (edge case defensivo)', async () => {
    const supabase = mockSupabase([]);
    const decision = await decideIncidentAutoRetry(supabase, {
      external_source: 'client_incident', external_id: 'inc-1',
    });
    expect(decision?.toStatus).toBe('completed');
  });

  it('pending con scheduled_at día siguiente 3pm MTY cuando último fue sin_respuesta', async () => {
    const supabase = mockSupabase([{ result: 'sin_respuesta' }]);
    const decision = await decideIncidentAutoRetry(supabase, {
      external_source: 'client_incident', external_id: 'inc-1',
    });
    expect(decision?.toStatus).toBe('pending');
    expect(decision?.reason).toBe('incident_retry_after_sin_respuesta');
    expect(decision?.scheduledAt).toBeDefined();
    // Ventana: día siguiente a las 15:00 MTY = entre ~10h y ~40h desde ahora.
    const diffMs = new Date(decision!.scheduledAt!).getTime() - Date.now();
    expect(diffMs).toBeGreaterThan(10 * 3600 * 1000);
    expect(diffMs).toBeLessThan(40 * 3600 * 1000);
  });

  it('pending cuando último fue no_visitado y hay margen', async () => {
    const supabase = mockSupabase([
      { result: 'sin_respuesta' },
      { result: 'no_visitado' },
    ]);
    const decision = await decideIncidentAutoRetry(supabase, {
      external_source: 'client_incident', external_id: 'inc-1',
    });
    expect(decision?.toStatus).toBe('pending');
    expect(decision?.reason).toBe('incident_retry_after_no_visitado');
  });

  it('failed cuando se alcanza MAX_VERIFICATION_ATTEMPTS sin ok', async () => {
    const attempts = Array.from({ length: MAX_VERIFICATION_ATTEMPTS }, () => ({ result: 'sin_respuesta' }));
    const supabase = mockSupabase(attempts);
    const decision = await decideIncidentAutoRetry(supabase, {
      external_source: 'client_incident', external_id: 'inc-1',
    });
    expect(decision?.toStatus).toBe('failed');
    expect(decision?.reason).toBe(`incident_max_attempts_${MAX_VERIFICATION_ATTEMPTS}`);
  });

  it('completed cuando el 4to attempt es ok (no escala aunque llegue a max)', async () => {
    const supabase = mockSupabase([
      { result: 'sin_respuesta' },
      { result: 'no_visitado' },
      { result: 'sin_respuesta' },
      { result: 'ok' },
    ]);
    const decision = await decideIncidentAutoRetry(supabase, {
      external_source: 'client_incident', external_id: 'inc-1',
    });
    expect(decision?.toStatus).toBe('completed');
  });
});
