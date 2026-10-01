import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeAgentTool } from '@/lib/tools/executor';

const mocks = vi.hoisted(() => ({
  resolveInv:   vi.fn(),
  patchSalida:  vi.fn(),
  insertLog:    vi.fn(),
  refundOps:    vi.fn(),
}));

vi.mock('@/lib/inventory/adapter', () => ({
  resolveInventoryContext: mocks.resolveInv,
  patchSalidaBySeries:     mocks.patchSalida,
  insertMutationLog:       mocks.insertLog,
}));
vi.mock('@/lib/ai/ops-guard', () => ({
  consumeAiOp: vi.fn(async () => ({ ok: true, used: 1, limit: 100 })),
  refundOps:   mocks.refundOps,
}));

async function runTool(args: Record<string, unknown>) {
  return executeAgentTool('inv_registrar_salida', args, {
    agentId: 'agent-1', portalEmail: 'camila@acproyectos.com',
    agentName: 'Nami', businessName: 'AC Proyectos', portalToken: 'tok',
    agent: { id: 'agent-1', features: { inventory_write_enabled: true } },
    supabase: {} as never, channel: 'chat',
  });
}

describe('executor inv_registrar_salida', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveInv.mockResolvedValue({ portalEmail: 'camila@acproyectos.com', token: 't', config: {} });
  });

  it('happy multi-serie: 2 series → 2 rows en audit log + mensaje con conteo', async () => {
    mocks.patchSalida.mockResolvedValue({
      ok: true, folio_hoja: '4251',
      series_registradas: ['2616HA045921', '2617HA02401A'], series_not_found: [], conflicts: [],
      mutations: [
        { serie: '2616HA045921', table_row_index: 10, before_state: { ESTATUS: 'SEPARADO' }, after_state: { ESTATUS: 'ENTREGADO' }, patched_columns: ['ESTATUS'] },
        { serie: '2617HA02401A', table_row_index: 11, before_state: { ESTATUS: 'SEPARADO' }, after_state: { ESTATUS: 'ENTREGADO' }, patched_columns: ['ESTATUS'] },
      ],
      message: 'Hoja de salida 4251 registrada: 2 equipos entregados a Mauricio Guerra.',
    });
    const r = await runTool({ folio_hoja: '4251', cliente_nombre: 'Mauricio Guerra', fecha: '2026-10-01', series: ['2616HA045921', '2617HA02401A'] });
    expect((r as any).ok).toBe(true);
    expect(mocks.insertLog).toHaveBeenCalledTimes(2);
    expect((r as any).message).toContain('2 equipos');
  });

  it('1 encontrada + 1 not_found → ok:true con ambos sets en el mensaje', async () => {
    mocks.patchSalida.mockResolvedValue({
      ok: true, folio_hoja: '4251',
      series_registradas: ['2616HA045921'], series_not_found: ['NO-EXISTE'], conflicts: [],
      mutations: [{ serie: '2616HA045921', table_row_index: 10, before_state: {}, after_state: {}, patched_columns: ['ESTATUS'] }],
      message: 'Hoja de salida 4251 registrada: 1 equipos entregados a X. Series no encontradas: NO-EXISTE.',
    });
    const r = await runTool({ folio_hoja: '4251', cliente_nombre: 'X', fecha: '2026-10-01', series: ['2616HA045921', 'NO-EXISTE'] });
    expect((r as any).ok).toBe(true);
    expect((r as any).series_not_found).toEqual(['NO-EXISTE']);
    expect(mocks.insertLog).toHaveBeenCalledTimes(1);
  });

  it('fecha inválida (no ISO) → invalid_input + refund (Review Focus #4)', async () => {
    const r = await runTool({ folio_hoja: '4251', cliente_nombre: 'X', fecha: '1 de octubre', series: ['X'] });
    expect((r as any).ok).toBe(false);
    expect((r as any).code).toBe('invalid_input');
    expect(mocks.refundOps).toHaveBeenCalled();
    expect(mocks.patchSalida).not.toHaveBeenCalled();
    expect(mocks.insertLog).not.toHaveBeenCalled();
  });

  it('conflicts reportados en el mensaje sin abortar', async () => {
    mocks.patchSalida.mockResolvedValue({
      ok: true, folio_hoja: '4251',
      series_registradas: ['2616HA045921'], series_not_found: [], conflicts: ['serie 2616HA045921 ya estaba asignada a "Otro" (no sobre-escribí)'],
      mutations: [{ serie: '2616HA045921', table_row_index: 10, before_state: {}, after_state: {}, patched_columns: ['ESTATUS'], conflict: 'serie 2616HA045921 ya estaba asignada a "Otro"' }],
      message: 'Hoja de salida 4251 registrada: 1 equipos entregados.',
    });
    const r = await runTool({ folio_hoja: '4251', cliente_nombre: 'X', series: ['2616HA045921'] });
    expect((r as any).ok).toBe(true);
    expect((r as any).conflicts).toHaveLength(1);
  });
});
