/**
 * Tests de integración para el bloque de Tareas en los prompt builders.
 *
 * Verifica:
 * - Bloque aparece cuando hay tasks activos.
 * - Bloque NO aparece cuando no hay tasks.
 * - outbound-prompt-builder NO tiene bloque de tareas (PAC-4).
 * - describeTrigger produce texto legible para cron, phrase, manual.
 * - humanReadableCron convierte correctamente los patrones comunes.
 *
 * Ejecutar con: pnpm test:integration -- prompt-builder-tasks
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { humanReadableCron, describeTrigger } from '@/lib/agent-tasks/prompt-helpers';

// ─── Tests de humanReadableCron ───────────────────────────────────────────────

describe('humanReadableCron', () => {
  it('convierte "0 9 5 * *" a "día 5 de cada mes a las 9:00"', () => {
    expect(humanReadableCron('0 9 5 * *')).toBe('día 5 de cada mes a las 9:00');
  });

  it('convierte "0 9 * * 1" a "lunes a las 9:00"', () => {
    expect(humanReadableCron('0 9 * * 1')).toBe('lunes a las 9:00');
  });

  it('convierte "0 9 * * *" a "todos los días a las 9:00"', () => {
    expect(humanReadableCron('0 9 * * *')).toBe('todos los días a las 9:00');
  });

  it('convierte "* * * * *" a "cada minuto"', () => {
    expect(humanReadableCron('* * * * *')).toBe('cada minuto');
  });

  it('convierte "*/5 * * * *" a "cada 5 minutos"', () => {
    expect(humanReadableCron('*/5 * * * *')).toBe('cada 5 minutos');
  });

  it('hace fallback al string original si no reconoce el patrón', () => {
    const exotic = '0 9 L * *';
    expect(humanReadableCron(exotic)).toBe(exotic);
  });

  it('maneja cadena vacía sin lanzar', () => {
    expect(humanReadableCron('')).toBe('');
  });

  it('convierte "30 14 * * 5" a "viernes a las 14:30"', () => {
    expect(humanReadableCron('30 14 * * 5')).toBe('viernes a las 14:30');
  });
});

// ─── Tests de describeTrigger ─────────────────────────────────────────────────

describe('describeTrigger', () => {
  it('cron retorna texto legible en español', () => {
    const result = describeTrigger('cron', { cron: '0 9 * * *' });
    expect(result).toBe('todos los días a las 9:00');
  });

  it('phrase retorna lista de frases', () => {
    const result = describeTrigger('phrase', { phrases: ['dame el reporte', 'resumen diario'] });
    expect(result).toContain('dame el reporte');
    expect(result).toContain('resumen diario');
  });

  it('manual retorna texto de portal', () => {
    const result = describeTrigger('manual', {});
    expect(result).toBe('solo manual desde el portal');
  });

  it('tipo desconocido cae en manual (fallback)', () => {
    const result = describeTrigger('unknown_type', {});
    expect(result).toBe('solo manual desde el portal');
  });
});

// ─── Tests del bloque de tareas en prompt builders (con mocks) ───────────────

// Mock del service antes de importar los builders
vi.mock('@/lib/agent-tasks/service', () => ({
  listTasksForAgent: vi.fn(),
}));

vi.mock('@/lib/agent-rules/cache', () => ({
  getCachedRulesForAgent: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: vi.fn().mockReturnValue({
      select:      vi.fn().mockReturnThis(),
      eq:          vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      order:       vi.fn().mockReturnThis(),
      limit:       vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  }),
}));

import { listTasksForAgent } from '@/lib/agent-tasks/service';

const mockListTasks = vi.mocked(listTasksForAgent);

const MANUAL_TASK = {
  id:             'task-001',
  portal_email:   'test@empresa.com',
  owner_agent_id: 'agent-001',
  slug:           'enviar_reporte',
  mission:        'Enviar reporte diario de ventas al dueño',
  trigger_type:   'manual' as const,
  trigger_config: {},
  parameters:     null,
  deliverable:    'Reporte enviado',
  active:         true,
  created_at:     '2026-09-25T00:00:00Z',
  updated_at:     '2026-09-25T00:00:00Z',
  created_by:     null,
};

const CRON_TASK = {
  ...MANUAL_TASK,
  id:             'task-002',
  slug:           'reporte_mensual',
  trigger_type:   'cron' as const,
  trigger_config: { cron: '0 9 5 * *' },
};

describe('prompt-builder-tasks: bloque de tareas en voice builder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('bloque de tareas aparece en el output cuando hay tareas activas', async () => {
    mockListTasks.mockResolvedValue([MANUAL_TASK, CRON_TASK]);

    // Importar dinámicamente para que los mocks estén activos
    const { buildSystemPrompt } = await import('@/lib/voice/prompt-builder');

    const agent = {
      id:            'agent-001',
      portal_email:  'test@empresa.com',
      agent_name:    'Nia',
      business_name: 'Test Corp',
      features:      { meerkat_role_id: 'nia' },
      timezone:      'America/Monterrey',
    } as unknown as import('@/types/agent').VoiceAgent;

    const prompt = await buildSystemPrompt(agent, null, null, undefined);

    expect(prompt).toContain('Tareas que puedes ejecutar');
    expect(prompt).toContain('enviar_reporte');
    expect(prompt).toContain('reporte_mensual');
    expect(prompt).toContain('solo manual desde el portal');
    expect(prompt).toContain('día 5 de cada mes a las 9:00');
  });

  it('bloque de tareas NO aparece cuando no hay tareas activas', async () => {
    mockListTasks.mockResolvedValue([]);

    const { buildSystemPrompt } = await import('@/lib/voice/prompt-builder');

    const agent = {
      id:            'agent-002',
      portal_email:  'test@empresa.com',
      agent_name:    'Nia',
      business_name: 'Test Corp',
      features:      { meerkat_role_id: 'nia' },
      timezone:      'America/Monterrey',
    } as unknown as import('@/types/agent').VoiceAgent;

    const prompt = await buildSystemPrompt(agent, null, null, undefined);

    expect(prompt).not.toContain('Tareas que puedes ejecutar');
  });

  it('outbound-prompt-builder NO incluye bloque de tareas (PAC-4)', async () => {
    mockListTasks.mockResolvedValue([MANUAL_TASK]);

    const { buildOutboundSystemPrompt } = await import('@/lib/voice/outbound-prompt-builder');

    const agent = {
      id:            'agent-003',
      portal_email:  'test@empresa.com',
      agent_name:    'Nova',
      business_name: 'Test Corp',
      role:          'Agente outbound',
      features:      { meerkat_role_id: 'nova' },
      timezone:      'America/Monterrey',
    } as unknown as import('@/types/agent').VoiceAgent;

    const prompt = await buildOutboundSystemPrompt(agent, {});

    // outbound NO debe tener bloque de tareas
    expect(prompt).not.toContain('Tareas que puedes ejecutar');
    // Y listTasksForAgent NO debe haber sido llamado para outbound
    expect(mockListTasks).not.toHaveBeenCalled();
  });

  it('bloque de tareas en whatsapp builder aparece cuando hay tareas', async () => {
    mockListTasks.mockResolvedValue([MANUAL_TASK]);

    const { buildWASystemPrompt } = await import('@/lib/whatsapp/prompt-builder');

    const agent = {
      id:            'agent-004',
      portal_email:  'test@empresa.com',
      agent_name:    'Nia',
      business_name: 'Test Corp',
      features:      { meerkat_role_id: 'nia' },
      timezone:      'America/Monterrey',
    } as unknown as import('@/types/agent').VoiceAgent;

    const prompt = await buildWASystemPrompt(agent);

    expect(prompt).toContain('Tareas que puedes ejecutar');
    expect(prompt).toContain('enviar_reporte');
  });
});
