// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeAgentTool } from '@/lib/tools/executor';

const mocks = vi.hoisted(() => ({
  resolveInv:  vi.fn(),
  patchVenta:  vi.fn(),
  insertLog:   vi.fn(),
  refundOps:   vi.fn(),
}));

vi.mock('@/lib/inventory/adapter', () => ({
  resolveInventoryContext: mocks.resolveInv,
  patchVentaBySerie:       mocks.patchVenta,
  insertMutationLog:       mocks.insertLog,
}));
vi.mock('@/lib/ai/ops-guard', () => ({
  consumeAiOp: vi.fn(async () => ({ ok: true, used: 1, limit: 100 })),
  refundOps:   mocks.refundOps,
}));

async function runTool(args: Record<string, unknown>) {
  return executeAgentTool('inv_registrar_venta', args, {
    agentId: 'agent-1', portalEmail: 'camila@acproyectos.com',
    agentName: 'Nami', businessName: 'AC Proyectos', portalToken: 'tok',
    agent: { id: 'agent-1', features: { inventory_write_enabled: true } },
    supabase: {} as never, channel: 'chat',
  });
}

describe('executor inv_registrar_venta', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveInv.mockResolvedValue({ portalEmail: 'camila@acproyectos.com', token: 't', config: {} });
  });

  it('happy path con factor calculado → mensaje narrable', async () => {
    mocks.patchVenta.mockResolvedValue({
      ok: true, serie: '2619HA012345', folio_venta: 'FV-1', precio_unitario_mx: 35000,
      factor_calculado: 1.3455,
      before_state: {}, after_state: {}, patched_columns: ['FOLIO', 'FECHA DE VENTA'], table_row_index: 5,
    });
    const r = await runTool({ serie: '2619HA012345', folio_venta: 'FV-1', fecha_venta: '2026-10-01', precio_unitario_mx: 35000 });
    expect((r as any).ok).toBe(true);
    expect((r as any).message).toContain('1.3455');
    expect((r as any).message).toContain('FV-1');
  });

  it('cannot_compute_factor → mensaje accionable', async () => {
    mocks.patchVenta.mockResolvedValue({ ok: false, code: 'cannot_compute_factor' });
    const r = await runTool({ serie: 'X', folio_venta: 'FV-1', fecha_venta: '2026-10-01', precio_unitario_mx: 35000 });
    expect((r as any).ok).toBe(false);
    expect((r as any).error).toContain('costo_mx');
    expect(mocks.insertLog).toHaveBeenCalledOnce();
  });

  it('fecha_venta no ISO → invalid_input + refund (Review Focus #4)', async () => {
    const r = await runTool({ serie: 'X', folio_venta: 'FV-1', fecha_venta: '1 de octubre', precio_unitario_mx: 35000 });
    expect((r as any).ok).toBe(false);
    expect((r as any).code).toBe('invalid_input');
    expect(mocks.refundOps).toHaveBeenCalled();
    expect(mocks.patchVenta).not.toHaveBeenCalled();
  });

  it('serie_not_found → ok:false', async () => {
    mocks.patchVenta.mockResolvedValue({ ok: false, code: 'serie_not_found' });
    const r = await runTool({ serie: 'X', folio_venta: 'FV-1', fecha_venta: '2026-10-01', precio_unitario_mx: 35000 });
    expect((r as any).ok).toBe(false);
    expect((r as any).code).toBe('serie_not_found');
    expect(mocks.insertLog).toHaveBeenCalledOnce();
  });
});
