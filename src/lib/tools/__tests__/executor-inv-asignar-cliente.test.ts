// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeAgentTool } from '@/lib/tools/executor';

const mocks = vi.hoisted(() => ({
  resolveInv:    vi.fn(),
  patchCliente:  vi.fn(),
  insertLog:     vi.fn(),
  refundOps:     vi.fn(),
}));

vi.mock('@/lib/inventory/adapter', () => ({
  resolveInventoryContext: mocks.resolveInv,
  patchClienteBySerie:     mocks.patchCliente,
  insertMutationLog:       mocks.insertLog,
}));
vi.mock('@/lib/ai/ops-guard', () => ({
  consumeAiOp: vi.fn(async () => ({ ok: true, used: 1, limit: 100 })),
  refundOps:   mocks.refundOps,
}));

async function runTool(args: Record<string, unknown>) {
  return executeAgentTool('inv_asignar_cliente', args, {
    agentId: 'agent-1', portalEmail: 'camila@acproyectos.com',
    agentName: 'Nami', businessName: 'AC Proyectos', portalToken: 'tok',
    agent: { id: 'agent-1', features: { inventory_write_enabled: true } },
    supabase: {} as never, channel: 'chat',
  });
}

describe('executor inv_asignar_cliente', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveInv.mockResolvedValue({ portalEmail: 'camila@acproyectos.com', token: 't', config: {} });
  });

  it('happy path marcar_separado default → asigna cliente + marca SEPARADO', async () => {
    mocks.patchCliente.mockResolvedValue({
      ok: true, serie: '2619HA012345', cliente_asignado: 'Mauricio Guerra', vendedor: 'ANA',
      estatus_resultante: 'SEPARADO',
      before_state: { CLIENTE: '' }, after_state: { CLIENTE: 'Mauricio Guerra', ESTATUS: 'SEPARADO' },
      patched_columns: ['CLIENTE', 'VEND', 'ESTATUS'], table_row_index: 5,
    });
    const r = await runTool({ serie: '2619HA012345', cliente_nombre: 'Mauricio Guerra', vendedor_codigo: 'ANA' });
    expect((r as Record<string, unknown>).ok).toBe(true);
    expect((r as Record<string, unknown>).message).toContain('Mauricio Guerra');
    expect((r as Record<string, unknown>).message).toContain('SEPARADA');
  });

  it('cliente_assigned_conflict → mensaje incluye current_cliente', async () => {
    mocks.patchCliente.mockResolvedValue({ ok: false, code: 'cliente_assigned_conflict', current_cliente: 'Otro Cliente' });
    const r = await runTool({ serie: '2619HA012345', cliente_nombre: 'Nuevo' });
    expect((r as Record<string, unknown>).ok).toBe(false);
    expect((r as Record<string, unknown>).error).toContain('Otro Cliente');
    expect((r as Record<string, unknown>).error).toContain('force=true');
    expect(mocks.insertLog).toHaveBeenCalledOnce();
  });

  it('force=true pasa a adapter correctamente', async () => {
    mocks.patchCliente.mockResolvedValue({
      ok: true, serie: '2619HA012345', cliente_asignado: 'Nuevo', vendedor: null,
      estatus_resultante: 'SEPARADO',
      before_state: {}, after_state: {}, patched_columns: ['CLIENTE'], table_row_index: 5,
    });
    await runTool({ serie: '2619HA012345', cliente_nombre: 'Nuevo', force: true });
    expect(mocks.patchCliente).toHaveBeenCalledWith(expect.anything(), '2619HA012345', expect.objectContaining({ force: true }));
  });

  it('serie_not_found → ok:false', async () => {
    mocks.patchCliente.mockResolvedValue({ ok: false, code: 'serie_not_found' });
    const r = await runTool({ serie: 'X', cliente_nombre: 'Y' });
    expect((r as Record<string, unknown>).ok).toBe(false);
    expect((r as Record<string, unknown>).code).toBe('serie_not_found');
    expect(mocks.insertLog).toHaveBeenCalledOnce();
  });
});
