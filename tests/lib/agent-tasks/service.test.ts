/**
 * Unit tests para src/lib/agent-tasks/service.ts.
 * Mockea Supabase y consumeAiOp — sin DB ni pool real.
 *
 * Cubre los invariantes del spec Sección 4.5 y 8.2:
 * - createTask inserta + cobra 1 op de setup
 * - updateTask no cobra
 * - deleteTask no cobra
 * - listTasksForAgent filtra por owner_agent_id
 * - listTasksForPortal filtra por portal_email
 * - getTaskById retorna null si no existe
 * - cron tasks reciben next_run_at si no estaba presente
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks ANTES de importar el módulo bajo test
vi.mock('@/lib/agent-tasks/validation', () => ({
  validateCreateTaskInput: vi.fn(),
}));

// Mock cron-parser para evitar dependencia de zona horaria en tests unitarios.
// computeNextRunAt en service.ts usa CronExpressionParser.parse — mockeamos para
// devolver una fecha fija y hacer el test determinístico.
vi.mock('cron-parser', () => ({
  CronExpressionParser: {
    parse: vi.fn().mockReturnValue({
      next: vi.fn().mockReturnValue({
        toISOString: vi.fn().mockReturnValue('2026-10-05T15:00:00.000Z'),
      }),
    }),
  },
}));

vi.mock('@/lib/ai/ops-guard', () => ({
  consumeAiOp: vi.fn().mockResolvedValue({ ok: true, used: 1, limit: 300 }),
}));

const mockFrom = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: mockFrom,
  }),
}));

import {
  createTask,
  updateTask,
  deleteTask,
  listTasksForAgent,
  listTasksForPortal,
  getTaskById,
} from '@/lib/agent-tasks/service';
import { validateCreateTaskInput } from '@/lib/agent-tasks/validation';
import { consumeAiOp } from '@/lib/ai/ops-guard';

const mockValidate    = vi.mocked(validateCreateTaskInput);
const mockConsumeAiOp = vi.mocked(consumeAiOp);

const PORTAL_EMAIL   = 'test@empresa.com';
const OWNER_AGENT_ID = 'agent-uuid-456';

const TASK_ROW = {
  id:             'task-uuid-789',
  portal_email:   PORTAL_EMAIL,
  owner_agent_id: OWNER_AGENT_ID,
  slug:           'enviar_reporte_diario',
  mission:        'Enviar reporte diario de ventas al dueño',
  trigger_type:   'manual',
  trigger_config: {},
  parameters:     null,
  deliverable:    'Reporte enviado por correo',
  active:         true,
  created_at:     '2026-09-25T12:00:00Z',
  updated_at:     '2026-09-25T12:00:00Z',
  created_by:     null,
};

// Helper que construye una cadena de query de Supabase simulada
function buildChain(returnValue: { data: unknown; error: null | { message: string } }) {
  const chain: Record<string, ReturnType<typeof vi.fn> | unknown> = {};
  const methods = ['insert', 'update', 'delete', 'select', 'eq', 'order', 'limit'];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnThis();
  }
  (chain as Record<string, unknown>).single     = vi.fn().mockResolvedValue(returnValue);
  (chain as Record<string, unknown>).maybeSingle = vi.fn().mockResolvedValue(returnValue);
  return chain;
}

describe('createTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidate.mockResolvedValue({ ok: true });
    mockConsumeAiOp.mockResolvedValue({ ok: true, used: 1, limit: 300 });
  });

  it('inserta la tarea y cobra 1 op de setup', async () => {
    const chain = buildChain({ data: TASK_ROW, error: null });
    mockFrom.mockReturnValue(chain);

    const task = await createTask({
      portalEmail:    PORTAL_EMAIL,
      ownerAgentId:   OWNER_AGENT_ID,
      slug:           'enviar_reporte_diario',
      mission:        'Enviar reporte diario de ventas',
      trigger_type:   'manual',
      trigger_config: {},
      deliverable:    'Reporte enviado por correo',
    });

    expect(task.id).toBe('task-uuid-789');
    expect(task.slug).toBe('enviar_reporte_diario');
    expect(mockConsumeAiOp).toHaveBeenCalledWith(
      OWNER_AGENT_ID,
      1,
      expect.objectContaining({ source: 'task_setup', reference_id: 'task-uuid-789' }),
    );
  });

  it('agrega next_run_at automático para tareas cron sin next_run_at', async () => {
    const cronTask = {
      ...TASK_ROW,
      trigger_type:   'cron',
      trigger_config: { cron: '0 9 5 * *' },
    };
    const chain = buildChain({ data: cronTask, error: null });
    mockFrom.mockReturnValue(chain);

    await createTask({
      portalEmail:    PORTAL_EMAIL,
      ownerAgentId:   OWNER_AGENT_ID,
      slug:           'reporte_mensual',
      mission:        'Reporte mensual',
      trigger_type:   'cron',
      trigger_config: { cron: '0 9 5 * *' },
      deliverable:    'Reporte mensual enviado',
    });

    // La llamada al insert debe incluir next_run_at en trigger_config
    const insertFn = (chain as Record<string, ReturnType<typeof vi.fn>>).insert;
    const insertArg = insertFn.mock.calls[0]?.[0] as Record<string, unknown>;
    const tc = insertArg?.trigger_config as Record<string, unknown>;
    expect(tc).toHaveProperty('next_run_at');
    expect(typeof tc.next_run_at).toBe('string');
  });

  it('lanza error si la validación falla', async () => {
    mockValidate.mockResolvedValue({ ok: false, error: 'Slug inválido' });

    await expect(createTask({
      portalEmail:    PORTAL_EMAIL,
      ownerAgentId:   OWNER_AGENT_ID,
      slug:           'Slug-Malo',
      mission:        'x',
      trigger_type:   'manual',
      trigger_config: {},
      deliverable:    'x',
    })).rejects.toThrow('Slug inválido');

    expect(mockConsumeAiOp).not.toHaveBeenCalled();
  });

  it('no revierte el insert si consumeAiOp falla', async () => {
    const chain = buildChain({ data: TASK_ROW, error: null });
    mockFrom.mockReturnValue(chain);
    mockConsumeAiOp.mockRejectedValue(new Error('Pool error'));

    // No debe lanzar, solo loguear warning
    const task = await createTask({
      portalEmail:    PORTAL_EMAIL,
      ownerAgentId:   OWNER_AGENT_ID,
      slug:           'enviar_reporte_diario',
      mission:        'Enviar reporte',
      trigger_type:   'manual',
      trigger_config: {},
      deliverable:    'Reporte enviado',
    });

    expect(task.id).toBe('task-uuid-789');
  });
});

describe('updateTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('actualiza la tarea sin cobrar ops', async () => {
    const chain = buildChain({ data: { ...TASK_ROW, mission: 'Nueva misión' }, error: null });
    mockFrom.mockReturnValue(chain);

    const task = await updateTask('task-uuid-789', { mission: 'Nueva misión' });

    expect(task.mission).toBe('Nueva misión');
    expect(mockConsumeAiOp).not.toHaveBeenCalled();
  });
});

describe('deleteTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('elimina la tarea sin cobrar ops', async () => {
    const chain = buildChain({ data: null, error: null });
    mockFrom.mockReturnValue(chain);

    await deleteTask('task-uuid-789');

    expect(mockConsumeAiOp).not.toHaveBeenCalled();
  });
});

describe('listTasksForAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna las tareas del agente', async () => {
    const chain: Record<string, unknown> = {
      select:  vi.fn().mockReturnThis(),
      eq:      vi.fn().mockReturnThis(),
      order:   vi.fn().mockResolvedValue({ data: [TASK_ROW], error: null }),
    };
    mockFrom.mockReturnValue(chain);

    const tasks = await listTasksForAgent(OWNER_AGENT_ID);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].owner_agent_id).toBe(OWNER_AGENT_ID);
  });

  it('filtra solo activas cuando activeOnly=true', async () => {
    const chain: Record<string, unknown> = {
      select:  vi.fn().mockReturnThis(),
      eq:      vi.fn().mockReturnThis(),
      order:   vi.fn().mockResolvedValue({ data: [TASK_ROW], error: null }),
    };
    mockFrom.mockReturnValue(chain);

    await listTasksForAgent(OWNER_AGENT_ID, { activeOnly: true });

    // Verificamos que eq fue llamado con 'active', true
    expect((chain.eq as ReturnType<typeof vi.fn>).mock.calls).toContainEqual(['active', true]);
  });
});

describe('listTasksForPortal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna todas las tareas del portal', async () => {
    const chain: Record<string, unknown> = {
      select:  vi.fn().mockReturnThis(),
      eq:      vi.fn().mockReturnThis(),
      order:   vi.fn().mockResolvedValue({ data: [TASK_ROW], error: null }),
    };
    mockFrom.mockReturnValue(chain);

    const tasks = await listTasksForPortal(PORTAL_EMAIL);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].portal_email).toBe(PORTAL_EMAIL);
  });
});

describe('getTaskById', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna la tarea si existe', async () => {
    const chain: Record<string, unknown> = {
      select:      vi.fn().mockReturnThis(),
      eq:          vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: TASK_ROW, error: null }),
    };
    mockFrom.mockReturnValue(chain);

    const task = await getTaskById('task-uuid-789');
    expect(task).not.toBeNull();
    expect(task?.id).toBe('task-uuid-789');
  });

  it('retorna null si la tarea no existe', async () => {
    const chain: Record<string, unknown> = {
      select:      vi.fn().mockReturnThis(),
      eq:          vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    mockFrom.mockReturnValue(chain);

    const task = await getTaskById('no-existe');
    expect(task).toBeNull();
  });
});
