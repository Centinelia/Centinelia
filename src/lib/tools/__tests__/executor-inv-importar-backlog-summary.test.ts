// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeAgentTool } from '@/lib/tools/executor';

const mocks = vi.hoisted(() => ({
  resolveInv:   vi.fn(),
  parseBacklog: vi.fn(),
  syncBacklog:  vi.fn(),
  sendEmail:    vi.fn(),
  consumeAiOp:  vi.fn(async () => ({ ok: true, used: 1, limit: 100 })),
  refundOps:    vi.fn(),
  fetchSpy:     vi.fn(),
}));

vi.mock('@/lib/inventory/adapter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/inventory/adapter')>()),
  resolveInventoryContext: mocks.resolveInv,
}));
vi.mock('@/lib/inventory/backlog-parser', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/inventory/backlog-parser')>()),
  parseBacklogPdf: mocks.parseBacklog,
}));
vi.mock('@/lib/inventory/backlog-syncer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/inventory/backlog-syncer')>()),
  syncBacklogRows: mocks.syncBacklog,
}));
vi.mock('@/lib/email/send-as-agent', () => ({
  sendMeerkatHtmlEmail: mocks.sendEmail,
}));
vi.mock('@/lib/ai/ops-guard', () => ({
  consumeAiOp: mocks.consumeAiOp,
  refundOps:   mocks.refundOps,
}));

function runTool(input: Record<string, unknown>) {
  return executeAgentTool('inv_importar_backlog', input, {
    agentId: 'agent-1', portalEmail: 'camila@acproyectos.com',
    agentName: 'Nami', businessName: 'AC Proyectos', portalToken: 'tok',
    agent: { id: 'agent-1', features: {}, email_from: null, email_domain_verified: null },
    supabase: {} as never, channel: 'chat',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveInv.mockResolvedValue({
    portalEmail: 'camila@acproyectos.com', token: 't',
    config: {
      location: { scope: { type: 'me' as const }, itemId: 'X' },
      sheets: { historico: { name: 'INVENTARIO', table: 'T' }, stock: { name: 'STOCK', header_row: 1, ideal_column: 'T', stock_column: 'J', modelo_column: 'H', propuesta_column: 'W' }, backlog: { name: 'BACKLOG', start_row: 5 } },
      columns_historico: {}, estatus_validos: [], bodegas_canonicas: [],
      backlog_trane: { pdf_password: '595170' },
    },
  });
  mocks.parseBacklog.mockResolvedValue({ page_count: 1, rows: [{ customer_po_number: '4599', line_number: '1.5' }], parsed_at: new Date().toISOString() });
  mocks.sendEmail.mockResolvedValue({ ok: true, provider: 'outlook' });
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(100) }) as never;
});

describe('inv_importar_backlog correo resumen a Camila', () => {
  it('dry_run=true → NO manda correo (es solo preview)', async () => {
    mocks.syncBacklog.mockResolvedValue({ total_parsed: 1, added: 1, updated: 0, unchanged: 0, deleted: 0, mode: 'replace', errors: [] });
    const r = await runTool({ pdf_url: 'https://x.com/pdf', dry_run: true });
    expect((r as any).ok).toBe(true);
    expect((r as any).summary_email_sent).toBe('no_dry_run');
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('dry_run=false + sin cambios → NO manda correo (no vale la pena molestarla)', async () => {
    mocks.syncBacklog.mockResolvedValue({ total_parsed: 45, added: 0, updated: 0, unchanged: 45, deleted: 0, mode: 'replace', errors: [] });
    const r = await runTool({ pdf_url: 'https://x.com/pdf', dry_run: false });
    expect((r as any).ok).toBe(true);
    expect((r as any).summary_email_sent).toBe('no_changes');
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('dry_run=false + cambios → manda correo al portal_email con resumen', async () => {
    mocks.syncBacklog.mockResolvedValue({ total_parsed: 45, added: 3, updated: 2, unchanged: 40, deleted: 0, mode: 'replace', errors: [] });
    const r = await runTool({ pdf_url: 'https://x.com/pdf', dry_run: false });
    expect((r as any).ok).toBe(true);
    expect((r as any).summary_email_sent).toBe('yes');
    expect(mocks.sendEmail).toHaveBeenCalledOnce();
    const call = mocks.sendEmail.mock.calls[0][0];
    expect(call.to).toBe('camila@acproyectos.com');
    expect(call.subject).toMatch(/BACKLOG TRANE actualizado/);
    expect(call.html).toContain('3 nuevas');
    expect(call.html).toContain('2 que cambi');
    expect(call.html).toContain('40 iguales');
    expect(call.html).toContain('Nami');
  });

  it('resumen con singular/plural correcto para 1 cambio', async () => {
    mocks.syncBacklog.mockResolvedValue({ total_parsed: 1, added: 1, updated: 0, unchanged: 0, deleted: 0, mode: 'replace', errors: [] });
    const r = await runTool({ pdf_url: 'https://x.com/pdf', dry_run: false });
    expect((r as any).ok).toBe(true);
    expect(mocks.sendEmail.mock.calls[0][0].html).toContain('1 nueva');
    expect(mocks.sendEmail.mock.calls[0][0].html).not.toContain('1 nuevas');
  });

  it('con errores de escritura, el correo los menciona', async () => {
    mocks.syncBacklog.mockResolvedValue({ total_parsed: 10, added: 5, updated: 0, unchanged: 5, deleted: 0, mode: 'replace', errors: [{ row_key: 'x::1', error: 'test' }] });
    const r = await runTool({ pdf_url: 'https://x.com/pdf', dry_run: false });
    expect((r as any).ok).toBe(true);
    expect(mocks.sendEmail.mock.calls[0][0].html).toContain('1 error');
  });

  it('si el envío de correo falla, la operación entera sigue exitosa (fail silent)', async () => {
    mocks.sendEmail.mockRejectedValue(new Error('SMTP down'));
    mocks.syncBacklog.mockResolvedValue({ total_parsed: 1, added: 1, updated: 0, unchanged: 0, deleted: 0, mode: 'replace', errors: [] });
    const r = await runTool({ pdf_url: 'https://x.com/pdf', dry_run: false });
    expect((r as any).ok).toBe(true);
    expect((r as any).summary_email_sent).toBe('failed');
  });

  it('mode=upsert con solo added → también manda correo', async () => {
    mocks.syncBacklog.mockResolvedValue({ total_parsed: 50, added: 5, updated: 0, unchanged: 45, deleted: 0, mode: 'upsert', errors: [] });
    const r = await runTool({ pdf_url: 'https://x.com/pdf', dry_run: false, mode: 'upsert' });
    expect((r as any).ok).toBe(true);
    expect((r as any).summary_email_sent).toBe('yes');
  });
});
