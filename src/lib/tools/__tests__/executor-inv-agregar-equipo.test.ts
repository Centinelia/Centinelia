// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeAgentTool } from '@/lib/tools/executor';

const mocks = vi.hoisted(() => ({
  resolveInv: vi.fn(),
  addEquipoRow: vi.fn(),
  consumeAiOp: vi.fn(async () => ({ ok: true, used: 1, limit: 100 })),
  refundOps:   vi.fn(),
  insertLog:   vi.fn(),
}));

vi.mock('@/lib/inventory/adapter', () => ({
  resolveInventoryContext: mocks.resolveInv,
  addEquipoRow:            mocks.addEquipoRow,
  insertMutationLog:       mocks.insertLog,
}));
vi.mock('@/lib/ai/ops-guard', () => ({
  consumeAiOp: mocks.consumeAiOp,
  refundOps:   mocks.refundOps,
}));

async function runTool(input: Record<string, unknown>) {
  return executeAgentTool('inv_agregar_equipo', input, {
    agentId: 'agent-1', portalEmail: 'camila@acproyectos.com',
    agentName: 'Nami', businessName: 'AC Proyectos', portalToken: 'tok',
    agent: { id: 'agent-1', features: { inventory_write_enabled: true } },
    supabase: {} as never, channel: 'chat',
  });
}

describe('executor inv_agregar_equipo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveInv.mockResolvedValue({ portalEmail: 'camila@acproyectos.com', token: 't', config: {} });
  });

  it('happy path: adapter OK → tool ok con mensaje narrable + audit log insert', async () => {
    mocks.addEquipoRow.mockResolvedValue({
      ok: true, serie: '2619HA012345', bodega_asignada: 'FLETEROS', row_index: 10,
      after_state: { OC: 'A1', SERIE: '2619HA012345', ESTATUS: 'ALMACEN' },
    });
    const r = await runTool({ oc: 'A1', modelo: '4TXK', serie: '2619HA012345', tonelada: 3 });
    expect((r as any).ok).toBe(true);
    expect((r as any).message).toContain('FLETEROS');
    expect(mocks.insertLog).toHaveBeenCalledOnce();
  });

  it('adapter not_configured → refund + mensaje de setup', async () => {
    mocks.resolveInv.mockResolvedValue({ error: 'not_configured', message: 'Configura el Excel...' });
    const r = await runTool({ oc: 'A1', modelo: '4TXK', serie: 'X' });
    expect((r as any).ok).toBe(false);
    expect(mocks.refundOps).toHaveBeenCalled();
  });

  it('adapter serie_already_exists → ok:false, cobra (es error de negocio)', async () => {
    mocks.addEquipoRow.mockResolvedValue({ ok: false, code: 'serie_already_exists', existing_row_index: 7 });
    const r = await runTool({ oc: 'A1', modelo: '4TXK', serie: '2619HA012345' });
    expect((r as any).ok).toBe(false);
    expect(mocks.refundOps).not.toHaveBeenCalled();
    expect(mocks.insertLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ success: false, error_code: 'serie_already_exists' }));
  });

  it('feature flag inventory_write_enabled=false → bloquea con write_not_enabled', async () => {
    const r = await executeAgentTool('inv_agregar_equipo', { oc: 'A1', modelo: '4TXK', serie: 'X' }, {
      agentId: 'agent-1', portalEmail: 'camila@acproyectos.com',
      agentName: 'Nami', businessName: 'AC Proyectos', portalToken: 'tok',
      agent: { id: 'agent-1', features: {} },
      supabase: {} as never, channel: 'chat',
    });
    expect((r as any).ok).toBe(false);
    expect((r as any).code).toBe('write_not_enabled');
  });
});
