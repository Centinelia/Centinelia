import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sheetsTools } from './sheets';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/lib/services/sheets', () => ({
  getMapping:   vi.fn(),
  appendRow:    vi.fn(),
  updateRow:    vi.fn(),
  readRange:    vi.fn(),
  searchInTab:  vi.fn(),
}));

// executor.ts is only imported for its AgentToolContext type, which we mock as any
vi.mock('@/lib/tools/executor', () => ({}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function findTool(name: string) {
  const t = sheetsTools.find(t => t.name === name);
  if (!t) throw new Error(`Tool "${name}" not found in sheetsTools`);
  return t;
}

function makeCtx(overrides: Record<string, unknown> = {}) {
  return { portalEmail: 'test@org.com', agentId: 'agent-1', ...overrides } as any;
}

const FAKE_MAPPING = { id: 'mapping-1', portal_email: 'test@org.com', purpose: 'clientes', tab_name: 'Clientes', spreadsheet_id: 'sheet-abc', headers: ['Nombre', 'Email'], headers_synced_at: '', custom_purpose_label: null };

// ── sheets_agregar_fila ───────────────────────────────────────────────────────

describe('sheets_agregar_fila', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resolves mapping and delegates to appendRow', async () => {
    const { getMapping, appendRow } = await import('@/lib/services/sheets');
    (getMapping as ReturnType<typeof vi.fn>).mockResolvedValue(FAKE_MAPPING);
    (appendRow  as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, data: { row_number: 5 } });

    const tool = findTool('sheets_agregar_fila');
    const res  = await tool.execute({ purpose: 'clientes', data: { Nombre: 'Ana' } }, makeCtx());

    expect(res).toEqual({ ok: true, row_number: 5 });
    expect(getMapping).toHaveBeenCalledWith('test@org.com', 'clientes', undefined);
    expect(appendRow).toHaveBeenCalledWith('mapping-1', { Nombre: 'Ana' });
  });

  it('returns sheet_no_configurado when mapping is null', async () => {
    const { getMapping } = await import('@/lib/services/sheets');
    (getMapping as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const tool = findTool('sheets_agregar_fila');
    const res  = await tool.execute({ purpose: 'leads', data: {} }, makeCtx());

    expect(res).toEqual({ ok: false, reason: 'sheet_no_configurado', purpose: 'leads' });
  });

  it('passes custom_purpose_label to getMapping when purpose=custom', async () => {
    const { getMapping, appendRow } = await import('@/lib/services/sheets');
    (getMapping as ReturnType<typeof vi.fn>).mockResolvedValue({ ...FAKE_MAPPING, purpose: 'custom' });
    (appendRow  as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, data: { row_number: 7 } });

    const tool = findTool('sheets_agregar_fila');
    await tool.execute({ purpose: 'custom', custom_purpose_label: 'ventas', data: {} }, makeCtx());

    expect(getMapping).toHaveBeenCalledWith('test@org.com', 'custom', 'ventas');
  });

  it('propagates service error when appendRow fails', async () => {
    const { getMapping, appendRow } = await import('@/lib/services/sheets');
    (getMapping as ReturnType<typeof vi.fn>).mockResolvedValue(FAKE_MAPPING);
    (appendRow  as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, reason: 'sheets_api_error', detail: 'quota exceeded' });

    const tool = findTool('sheets_agregar_fila');
    const res  = await tool.execute({ purpose: 'clientes', data: { Nombre: 'X' } }, makeCtx());

    expect(res).toEqual({ ok: false, reason: 'sheets_api_error', detail: 'quota exceeded' });
  });
});

// ── sheets_actualizar_fila ────────────────────────────────────────────────────

describe('sheets_actualizar_fila', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resolves mapping and delegates to updateRow', async () => {
    const { getMapping, updateRow } = await import('@/lib/services/sheets');
    (getMapping as ReturnType<typeof vi.fn>).mockResolvedValue(FAKE_MAPPING);
    (updateRow  as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, data: { row_number: 3 } });

    const tool = findTool('sheets_actualizar_fila');
    const res  = await tool.execute(
      { purpose: 'clientes', match_by: 'Email', match_value: 'ana@e.com', data: { Nombre: 'Ana P.' } },
      makeCtx(),
    );

    expect(res).toEqual({ ok: true, row_number: 3 });
    expect(updateRow).toHaveBeenCalledWith('mapping-1', 'Email', 'ana@e.com', { Nombre: 'Ana P.' });
  });

  it('returns sheet_no_configurado when mapping is null', async () => {
    const { getMapping } = await import('@/lib/services/sheets');
    (getMapping as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const tool = findTool('sheets_actualizar_fila');
    const res  = await tool.execute(
      { purpose: 'oc', match_by: 'ID', match_value: '1', data: {} },
      makeCtx(),
    );

    expect(res).toEqual({ ok: false, reason: 'sheet_no_configurado', purpose: 'oc' });
  });

  it('propagates row_not_found when updateRow cannot match', async () => {
    const { getMapping, updateRow } = await import('@/lib/services/sheets');
    (getMapping as ReturnType<typeof vi.fn>).mockResolvedValue(FAKE_MAPPING);
    (updateRow  as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, reason: 'row_not_found' });

    const tool = findTool('sheets_actualizar_fila');
    const res  = await tool.execute(
      { purpose: 'clientes', match_by: 'Email', match_value: 'notfound@e.com', data: {} },
      makeCtx(),
    );

    expect(res).toEqual({ ok: false, reason: 'row_not_found' });
  });
});

// ── sheets_leer ───────────────────────────────────────────────────────────────

describe('sheets_leer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resolves mapping and delegates to readRange', async () => {
    const { getMapping, readRange } = await import('@/lib/services/sheets');
    const ROWS = [{ Nombre: 'Ana', Email: 'ana@e.com' }];
    (getMapping as ReturnType<typeof vi.fn>).mockResolvedValue(FAKE_MAPPING);
    (readRange  as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, data: { rows: ROWS } });

    const tool = findTool('sheets_leer');
    const res  = await tool.execute({ purpose: 'clientes' }, makeCtx());

    expect(res).toEqual({ ok: true, rows: ROWS });
    expect(readRange).toHaveBeenCalledWith('mapping-1', undefined);
  });

  it('returns sheet_no_configurado when mapping is null', async () => {
    const { getMapping } = await import('@/lib/services/sheets');
    (getMapping as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const tool = findTool('sheets_leer');
    const res  = await tool.execute({ purpose: 'bitacoras' }, makeCtx());

    expect(res).toEqual({ ok: false, reason: 'sheet_no_configurado', purpose: 'bitacoras' });
  });

  it('passes optional range arg to readRange', async () => {
    const { getMapping, readRange } = await import('@/lib/services/sheets');
    (getMapping as ReturnType<typeof vi.fn>).mockResolvedValue(FAKE_MAPPING);
    (readRange  as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, data: { rows: [] } });

    const tool = findTool('sheets_leer');
    await tool.execute({ purpose: 'clientes', range: 'A1:B10' }, makeCtx());

    expect(readRange).toHaveBeenCalledWith('mapping-1', 'A1:B10');
  });
});

// ── sheets_buscar ─────────────────────────────────────────────────────────────

describe('sheets_buscar', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resolves mapping and delegates to searchInTab', async () => {
    const { getMapping, searchInTab } = await import('@/lib/services/sheets');
    const ROWS = [{ Nombre: 'Bob', Email: 'bob@e.com' }];
    (getMapping  as ReturnType<typeof vi.fn>).mockResolvedValue(FAKE_MAPPING);
    (searchInTab as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, data: { rows: ROWS } });

    const tool = findTool('sheets_buscar');
    const res  = await tool.execute({ purpose: 'clientes', query: 'bob' }, makeCtx());

    expect(res).toEqual({ ok: true, rows: ROWS });
    expect(searchInTab).toHaveBeenCalledWith('mapping-1', 'bob');
  });

  it('returns sheet_no_configurado when mapping is null', async () => {
    const { getMapping } = await import('@/lib/services/sheets');
    (getMapping as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const tool = findTool('sheets_buscar');
    const res  = await tool.execute({ purpose: 'cajas_chicas', query: 'enero' }, makeCtx());

    expect(res).toEqual({ ok: false, reason: 'sheet_no_configurado', purpose: 'cajas_chicas' });
  });

  it('returns empty rows when no match found', async () => {
    const { getMapping, searchInTab } = await import('@/lib/services/sheets');
    (getMapping  as ReturnType<typeof vi.fn>).mockResolvedValue(FAKE_MAPPING);
    (searchInTab as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, data: { rows: [] } });

    const tool = findTool('sheets_buscar');
    const res  = await tool.execute({ purpose: 'leads', query: 'zzznomatch' }, makeCtx());

    expect(res).toEqual({ ok: true, rows: [] });
  });
});
