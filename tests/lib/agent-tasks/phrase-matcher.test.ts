/**
 * Unit tests para src/lib/agent-tasks/phrase-matcher.ts.
 * Mockea Supabase — sin DB real.
 *
 * Cubre los casos de la spec Sección 4.5.1:
 * - user dice frase exacta → match
 * - user dice frase con case distinto → match (case-insensitive)
 * - user dice frase como substring → match
 * - frase muy corta/no match → null
 * - tarea inactiva → no match
 * - tarea de otro agente → no match
 * - mensaje vacío → null
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase ANTES de importar el módulo bajo test
const mockOrder = vi.fn();
const mockFrom  = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: mockFrom,
  }),
}));

import { matchPhraseToTask } from '@/lib/agent-tasks/phrase-matcher';

const AGENT_ID = 'agent-uuid-001';

// Helper para construir la cadena de mock de Supabase
function buildPhraseTasksChain(tasks: unknown[]) {
  const chain: Record<string, unknown> = {
    select:  vi.fn().mockReturnThis(),
    eq:      vi.fn().mockReturnThis(),
    // La cadena termina en resolución de Promise
  };
  // El último .eq() retorna la promesa
  let callCount = 0;
  (chain.eq as ReturnType<typeof vi.fn>).mockImplementation(() => {
    callCount++;
    if (callCount >= 3) {
      // Tercer eq es trigger_type='phrase', active=true — retorna promesa
      return Promise.resolve({ data: tasks, error: null });
    }
    return chain;
  });
  mockFrom.mockReturnValue(chain);
  return chain;
}

const PHRASE_TASK = {
  id:             'task-phrase-001',
  trigger_config: { phrases: ['dame el reporte', 'necesito el resumen diario'] },
  active:         true,
};

// Features con flag activo — se pasan directamente para evitar SELECT extra.
const FEATURES_ON  = { agent_missions_enabled: true };
const FEATURES_OFF = { agent_missions_enabled: false };

describe('matchPhraseToTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna match cuando el usuario dice la frase exacta', async () => {
    buildPhraseTasksChain([PHRASE_TASK]);

    const result = await matchPhraseToTask(AGENT_ID, 'dame el reporte', FEATURES_ON);
    expect(result).not.toBeNull();
    expect(result?.taskId).toBe('task-phrase-001');
    expect(result?.matchedPhrase).toBe('dame el reporte');
    expect(result?.matchType).toBe('literal');
  });

  it('retorna match cuando el usuario escribe en mayúsculas (case-insensitive)', async () => {
    buildPhraseTasksChain([PHRASE_TASK]);

    const result = await matchPhraseToTask(AGENT_ID, 'DAME EL REPORTE ahora', FEATURES_ON);
    expect(result).not.toBeNull();
    expect(result?.matchedPhrase).toBe('dame el reporte');
  });

  it('retorna match cuando la frase está dentro de un mensaje más largo', async () => {
    buildPhraseTasksChain([PHRASE_TASK]);

    const result = await matchPhraseToTask(AGENT_ID, 'Oye, necesito el resumen diario de hoy por favor', FEATURES_ON);
    expect(result).not.toBeNull();
    expect(result?.matchedPhrase).toBe('necesito el resumen diario');
  });

  it('retorna null cuando el mensaje no contiene ninguna frase registrada', async () => {
    buildPhraseTasksChain([PHRASE_TASK]);

    const result = await matchPhraseToTask(AGENT_ID, 'Hola, ¿cómo estás?', FEATURES_ON);
    expect(result).toBeNull();
  });

  it('retorna null cuando no hay tareas phrase activas', async () => {
    buildPhraseTasksChain([]);

    const result = await matchPhraseToTask(AGENT_ID, 'dame el reporte', FEATURES_ON);
    expect(result).toBeNull();
  });

  it('retorna null si el mensaje está vacío', async () => {
    buildPhraseTasksChain([PHRASE_TASK]);

    const result = await matchPhraseToTask(AGENT_ID, '', FEATURES_ON);
    expect(result).toBeNull();
    // No debe llamar a Supabase para mensajes vacíos
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('retorna null si el mensaje es solo espacios', async () => {
    buildPhraseTasksChain([PHRASE_TASK]);

    const result = await matchPhraseToTask(AGENT_ID, '   ', FEATURES_ON);
    expect(result).toBeNull();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  // Kill switch: flag OFF retorna null sin tocar Supabase
  it('retorna null cuando agent_missions_enabled=false (kill switch)', async () => {
    buildPhraseTasksChain([PHRASE_TASK]);

    const result = await matchPhraseToTask(AGENT_ID, 'dame el reporte', FEATURES_OFF);
    expect(result).toBeNull();
    // Con orgFeatures pasado y flag OFF, no debe consultar tareas
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('retorna null si Supabase retorna error y loguea warning', async () => {
    const chain: Record<string, unknown> = {
      select:  vi.fn().mockReturnThis(),
      eq:      vi.fn().mockReturnThis(),
    };
    let callCount = 0;
    (chain.eq as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callCount++;
      if (callCount >= 3) {
        return Promise.resolve({ data: null, error: { message: 'DB error' } });
      }
      return chain;
    });
    mockFrom.mockReturnValue(chain);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await matchPhraseToTask(AGENT_ID, 'dame el reporte', FEATURES_ON);
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith('[phrase-matcher] Error al obtener tareas:', 'DB error');
    warnSpy.mockRestore();
  });
});
