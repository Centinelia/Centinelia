// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeAgentTool } from '@/lib/tools/executor';

const mocks = vi.hoisted(() => ({
  resolveInv: vi.fn(),
  sendEmail:  vi.fn(),
  consumeAiOp: vi.fn(async () => ({ ok: true, used: 1, limit: 100 })),
  refundOps:   vi.fn(),
}));

vi.mock('@/lib/inventory/adapter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/inventory/adapter')>()),
  resolveInventoryContext: mocks.resolveInv,
}));
vi.mock('@/lib/email/send-as-agent', () => ({
  sendMeerkatHtmlEmail: mocks.sendEmail,
}));
vi.mock('@/lib/ai/ops-guard', () => ({
  consumeAiOp: mocks.consumeAiOp,
  refundOps:   mocks.refundOps,
}));

function runTool(toolName: string, input: Record<string, unknown>) {
  return executeAgentTool(toolName, input, {
    agentId: 'agent-1', portalEmail: 'camila@acproyectos.com',
    agentName: 'Nami', businessName: 'AC Proyectos', portalToken: 'tok',
    agent: { id: 'agent-1', features: {}, email_from: null, email_domain_verified: null },
    supabase: {} as never, channel: 'chat',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveInv.mockResolvedValue({
    portalEmail: 'camila@acproyectos.com',
    token: 't',
    config: {
      location: { scope: { type: 'me' as const }, itemId: 'ITEM-1' },
      sheets: { historico: { name: 'INVENTARIO', table: 'Tabla6' }, stock: { name: 'STOCK', header_row: 1, ideal_column: 'T', stock_column: 'J', modelo_column: 'H', propuesta_column: 'W' } },
      columns_historico: {},
      estatus_validos: [], bodegas_canonicas: [],
      trane_contacts: { registro_oc: 'isabel@tranemx.com', solicitar_entrega: 'isabel@tranemx.com' },
    },
  });
  mocks.sendEmail.mockResolvedValue({ ok: true, provider: 'outlook' });
});

describe('executor inv_notificar_trane_registro_oc', () => {
  it('enviar=false (default): no envía, devuelve borrador para review', async () => {
    const r = await runTool('inv_notificar_trane_registro_oc', {
      oc_numero: '7520',
      items: [{ modelo: '4TXK6548', cantidad: 10 }, { modelo: '4MXD6548', cantidad: 5 }],
    });
    expect((r as any).ok).toBe(true);
    expect((r as any).draft).toBeDefined();
    expect((r as any).draft.subject).toContain('7520');
    expect((r as any).draft.html).toContain('4TXK6548');
    expect((r as any).draft.html).toContain('10');
    expect((r as any).draft.to).toBe('isabel@tranemx.com');
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('enviar=true: manda el correo via sendMeerkatHtmlEmail', async () => {
    const r = await runTool('inv_notificar_trane_registro_oc', {
      oc_numero: '7520',
      items: [{ modelo: '4TXK6548', cantidad: 10 }],
      enviar: true,
    });
    expect((r as any).ok).toBe(true);
    expect(mocks.sendEmail).toHaveBeenCalledOnce();
    const callArgs = mocks.sendEmail.mock.calls[0][0];
    expect(callArgs.to).toBe('isabel@tranemx.com');
    expect(callArgs.subject).toContain('7520');
  });

  it('destinatario_email override toma precedencia sobre config', async () => {
    const r = await runTool('inv_notificar_trane_registro_oc', {
      oc_numero: '7520',
      items: [{ modelo: 'X', cantidad: 1 }],
      destinatario_email: 'otro@trane.com',
      enviar: true,
    });
    expect((r as any).ok).toBe(true);
    expect(mocks.sendEmail.mock.calls[0][0].to).toBe('otro@trane.com');
  });

  it('sin destinatario y sin config.trane_contacts → error claro', async () => {
    mocks.resolveInv.mockResolvedValue({
      portalEmail: 'camila@acproyectos.com', token: 't',
      config: {
        location: { scope: { type: 'me' as const }, itemId: 'X' },
        sheets: { historico: { name: 'INVENTARIO', table: 'T' }, stock: { name: 'STOCK', header_row: 1, ideal_column: 'T', stock_column: 'J', modelo_column: 'H', propuesta_column: 'W' } },
        columns_historico: {}, estatus_validos: [], bodegas_canonicas: [],
      },
    });
    const r = await runTool('inv_notificar_trane_registro_oc', {
      oc_numero: '7520',
      items: [{ modelo: 'X', cantidad: 1 }],
      enviar: true,
    });
    expect((r as any).ok).toBe(false);
    expect((r as any).error).toMatch(/destinatario/i);
  });

  it('items vacío → error', async () => {
    const r = await runTool('inv_notificar_trane_registro_oc', {
      oc_numero: '7520', items: [],
    });
    expect((r as any).ok).toBe(false);
  });

  it('nota opcional se incluye en el html', async () => {
    const r = await runTool('inv_notificar_trane_registro_oc', {
      oc_numero: '7520',
      items: [{ modelo: 'X', cantidad: 1 }],
      nota: 'Entrega urgente para proyecto Monterrey',
    });
    expect((r as any).draft.html).toContain('Monterrey');
  });
});

describe('executor inv_solicitar_entrega_trane', () => {
  it('enviar=false default: devuelve borrador', async () => {
    const r = await runTool('inv_solicitar_entrega_trane', {
      oc_numero: '7520',
    });
    expect((r as any).ok).toBe(true);
    expect((r as any).draft).toBeDefined();
    expect((r as any).draft.subject).toContain('7520');
    expect((r as any).draft.subject.toLowerCase()).toMatch(/entrega|solicitud/);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('enviar=true: manda correo', async () => {
    const r = await runTool('inv_solicitar_entrega_trane', {
      oc_numero: '7520',
      enviar: true,
    });
    expect((r as any).ok).toBe(true);
    expect(mocks.sendEmail).toHaveBeenCalledOnce();
  });

  it('fecha_requerida se incluye en el html', async () => {
    const r = await runTool('inv_solicitar_entrega_trane', {
      oc_numero: '7520',
      fecha_requerida: '2026-10-15',
    });
    expect((r as any).draft.html).toContain('2026-10-15');
  });

  it('oc_numero vacío → error', async () => {
    const r = await runTool('inv_solicitar_entrega_trane', { oc_numero: '' });
    expect((r as any).ok).toBe(false);
  });
});
