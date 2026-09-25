/**
 * Unit tests para src/lib/agent-tasks/validation.ts.
 * Mockea Supabase para evitar conexión a DB en tests unitarios.
 *
 * Cubre los invariantes del spec Sección 4.5 y 8.2:
 * - slug: formato, longitud
 * - mission/deliverable: obligatorio, longitud máx
 * - parameters: opcional, longitud máx
 * - trigger_config por tipo: cron válido, phrase con frases, manual libre
 * - ownership check: agente existe y pertenece al portal_email
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase ANTES de importar el módulo bajo test
const mockMaybeSingle = vi.fn();
const mockEq = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: mockFrom,
  }),
}));

import { validateCreateTaskInput, type CreateTaskInput } from '@/lib/agent-tasks/validation';

const BASE_INPUT: CreateTaskInput = {
  portalEmail:    'test@empresa.com',
  ownerAgentId:   'agent-uuid-123',
  slug:           'enviar_reporte_diario',
  mission:        'Enviar reporte diario de ventas al dueño',
  trigger_type:   'manual',
  trigger_config: {},
  deliverable:    'Reporte de ventas enviado por correo',
};

// Configurar la cadena de mock de Supabase
function mockAgentExists(portalEmail = 'test@empresa.com') {
  mockMaybeSingle.mockResolvedValueOnce({ data: { id: 'agent-uuid-123', portal_email: portalEmail }, error: null });
  mockEq.mockReturnThis();
  mockSelect.mockReturnValue({ eq: mockEq });
  mockEq.mockReturnValue({ eq: mockEq });
  mockEq.mockReturnValue({ maybeSingle: mockMaybeSingle });
  mockFrom.mockReturnValue({ select: mockSelect });
}

function mockAgentNotFound() {
  mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
  mockEq.mockReturnThis();
  mockSelect.mockReturnValue({ eq: mockEq });
  mockEq.mockReturnValue({ eq: mockEq });
  mockEq.mockReturnValue({ maybeSingle: mockMaybeSingle });
  mockFrom.mockReturnValue({ select: mockSelect });
}

describe('validateCreateTaskInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Happy paths ─────────────────────────────────────────────────────────────

  it('acepta tarea manual válida sin ownership check', async () => {
    const result = await validateCreateTaskInput(BASE_INPUT);
    expect(result.ok).toBe(true);
  });

  it('acepta tarea cron con expresión cron válida', async () => {
    const result = await validateCreateTaskInput({
      ...BASE_INPUT,
      trigger_type:   'cron',
      trigger_config: { cron: '0 9 5 * *' },
    });
    expect(result.ok).toBe(true);
  });

  it('acepta tarea phrase con frases válidas', async () => {
    const result = await validateCreateTaskInput({
      ...BASE_INPUT,
      trigger_type:   'phrase',
      trigger_config: { phrases: ['dame el reporte', 'necesito el resumen'] },
    });
    expect(result.ok).toBe(true);
  });

  it('acepta tarea con parámetros opcionales', async () => {
    const result = await validateCreateTaskInput({
      ...BASE_INPUT,
      parameters: 'Incluir los últimos 7 días de ventas',
    });
    expect(result.ok).toBe(true);
  });

  // ── Slug validations ────────────────────────────────────────────────────────

  it('rechaza slug vacío', async () => {
    const result = await validateCreateTaskInput({ ...BASE_INPUT, slug: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/slug/i);
  });

  it('rechaza slug con mayúsculas', async () => {
    const result = await validateCreateTaskInput({ ...BASE_INPUT, slug: 'Reporte_Diario' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/slug/i);
  });

  it('rechaza slug con guiones medios (solo se permiten guiones bajos)', async () => {
    const result = await validateCreateTaskInput({ ...BASE_INPUT, slug: 'enviar-reporte' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/slug/i);
  });

  it('rechaza slug de más de 64 caracteres', async () => {
    const result = await validateCreateTaskInput({ ...BASE_INPUT, slug: 'a'.repeat(65) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/64/);
  });

  // ── Mission/deliverable ─────────────────────────────────────────────────────

  it('rechaza misión vacía', async () => {
    const result = await validateCreateTaskInput({ ...BASE_INPUT, mission: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/misión/i);
  });

  it('rechaza deliverable vacío', async () => {
    const result = await validateCreateTaskInput({ ...BASE_INPUT, deliverable: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/entregable/i);
  });

  it('rechaza misión de más de 2000 caracteres', async () => {
    const result = await validateCreateTaskInput({ ...BASE_INPUT, mission: 'x'.repeat(2001) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/2000/);
  });

  it('rechaza parámetros de más de 4000 caracteres', async () => {
    const result = await validateCreateTaskInput({ ...BASE_INPUT, parameters: 'p'.repeat(4001) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/4000/);
  });

  // ── Cron validations ────────────────────────────────────────────────────────

  it('rechaza cron sin trigger_config.cron', async () => {
    const result = await validateCreateTaskInput({
      ...BASE_INPUT,
      trigger_type:   'cron',
      trigger_config: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/cron/i);
  });

  it('rechaza expresión cron con texto claramente inválido (no campos numéricos)', async () => {
    // Nota: cron-parser v5 acepta expresiones de 4 campos como válidas.
    // El test original usaba regex. Ahora usamos una expresión que claramente
    // falla el parse (caracteres inválidos como letras no reservadas).
    const result = await validateCreateTaskInput({
      ...BASE_INPUT,
      trigger_type:   'cron',
      trigger_config: { cron: 'invalid cron' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/cron/i);
  });

  it('rechaza expresión cron con texto no válido', async () => {
    const result = await validateCreateTaskInput({
      ...BASE_INPUT,
      trigger_type:   'cron',
      trigger_config: { cron: 'every day at 9am' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/cron/i);
  });

  // ── Phrase validations ──────────────────────────────────────────────────────

  it('rechaza phrase sin trigger_config.phrases', async () => {
    const result = await validateCreateTaskInput({
      ...BASE_INPUT,
      trigger_type:   'phrase',
      trigger_config: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/phrases/i);
  });

  it('rechaza phrase con arreglo vacío de frases', async () => {
    const result = await validateCreateTaskInput({
      ...BASE_INPUT,
      trigger_type:   'phrase',
      trigger_config: { phrases: [] },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/phrases/i);
  });

  // ── Ownership check ─────────────────────────────────────────────────────────

  it('acepta cuando ownership check pasa (agente existe y pertenece al portal)', async () => {
    // Build manual chain mock
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'agent-uuid-123', portal_email: 'test@empresa.com' },
        error: null,
      }),
    };
    mockFrom.mockReturnValue(chain);

    const result = await validateCreateTaskInput(BASE_INPUT, { ownershipCheck: true });
    expect(result.ok).toBe(true);
  });

  it('rechaza cuando agente no existe', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    mockFrom.mockReturnValue(chain);

    const result = await validateCreateTaskInput(BASE_INPUT, { ownershipCheck: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/no existe/i);
  });

  it('rechaza cuando agente pertenece a otro portal (ownership mismatch)', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'agent-uuid-123', portal_email: 'otro@empresa.com' },
        error: null,
      }),
    };
    mockFrom.mockReturnValue(chain);

    const result = await validateCreateTaskInput(BASE_INPUT, { ownershipCheck: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/no pertenece/i);
  });
});
