// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeAgentTool } from '@/lib/tools/executor';

const mocks = vi.hoisted(() => ({
  resolveInv:        vi.fn(),
  patchEstatus:      vi.fn(),
  insertLog:         vi.fn(),
  refundOps:         vi.fn(),
}));

vi.mock('@/lib/inventory/adapter', () => ({
  resolveInventoryContext: mocks.resolveInv,
  patchEstatusBySerie:     mocks.patchEstatus,
  insertMutationLog:       mocks.insertLog,
}));
vi.mock('@/lib/ai/ops-guard', () => ({
  consumeAiOp: vi.fn(async () => ({ ok: true, used: 1, limit: 100 })),
  refundOps:   mocks.refundOps,
}));

async function runTool(args: Record<string, unknown>, flagOn = true) {
  return executeAgentTool('inv_actualizar_estatus', args, {
    agentId: 'agent-1', portalEmail: 'camila@acproyectos.com',
    agentName: 'Nami', businessName: 'AC Proyectos', portalToken: 'tok',
    agent: { id: 'agent-1', features: flagOn ? { inventory_write_enabled: true } : {} },
    supabase: {} as never, channel: 'chat',
  });
}

describe('executor inv_actualizar_estatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveInv.mockResolvedValue({ portalEmail: 'camila@acproyectos.com', token: 't', config: {} });
  });

  it('happy path: ALMACEN → SEPARADO con mensaje narrable', async () => {
    mocks.patchEstatus.mockResolvedValue({
      ok: true, serie: '2619HA012345', estatus_anterior: 'ALMACEN', estatus_nuevo: 'SEPARADO',
      before_state: { ESTATUS: 'ALMACEN' }, after_state: { ESTATUS: 'SEPARADO' },
      patched_columns: ['ESTATUS'], table_row_index: 5,
    });
    const r = await runTool({ serie: '2619HA012345', nuevo_estatus: 'SEPARADO' });
    expect((r as Record<string, unknown>).ok).toBe(true);
    expect((r as Record<string, unknown>).message).toContain('ALMACEN → SEPARADO');
    expect(mocks.insertLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ success: true, patched_columns: ['ESTATUS'] }));
  });

  it('serie_not_found → ok:false, cobra (negocio)', async () => {
    mocks.patchEstatus.mockResolvedValue({ ok: false, code: 'serie_not_found' });
    const r = await runTool({ serie: 'X', nuevo_estatus: 'SEPARADO' });
    expect((r as Record<string, unknown>).ok).toBe(false);
    expect(mocks.refundOps).not.toHaveBeenCalled();
    expect(mocks.insertLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ success: false, error_code: 'serie_not_found' }));
  });

  it('no_op → ok:true con mensaje "ya estaba en X"', async () => {
    mocks.patchEstatus.mockResolvedValue({
      ok: true, no_op: true, serie: '2619HA012345', estatus_anterior: 'ALMACEN', estatus_nuevo: 'ALMACEN',
      before_state: { ESTATUS: 'ALMACEN' }, after_state: { ESTATUS: 'ALMACEN' },
      patched_columns: [], table_row_index: 5,
    });
    const r = await runTool({ serie: '2619HA012345', nuevo_estatus: 'ALMACEN' });
    expect((r as Record<string, unknown>).ok).toBe(true);
    expect((r as Record<string, unknown>).no_op).toBe(true);
    expect((r as Record<string, unknown>).message).toContain('ya estaba en ALMACEN');
  });

  it('flag off → write_not_enabled', async () => {
    const r = await runTool({ serie: 'X', nuevo_estatus: 'SEPARADO' }, false);
    expect((r as Record<string, unknown>).ok).toBe(false);
    expect((r as Record<string, unknown>).code).toBe('write_not_enabled');
  });
});
