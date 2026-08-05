import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getMapping, refreshHeaders, appendRow, updateRow, readRange, searchInTab } from './sheets';

vi.mock('@/lib/connectors/sheets-client');
vi.mock('@/lib/supabase/admin');

describe('getMapping', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns mapping when found by reserved purpose', async () => {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const single = vi.fn().mockResolvedValue({ data: { id: 'm1', purpose: 'clientes' }, error: null });
    const eq2 = vi.fn().mockReturnValue({ single });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const from = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq: eq1 }) });
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({ from });

    const result = await getMapping('org@example.com', 'clientes');
    expect(result).toEqual({ id: 'm1', purpose: 'clientes' });
  });

  it('returns null when no mapping', async () => {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const single = vi.fn().mockResolvedValue({ data: null, error: null });
    const chain = { select: () => ({ eq: () => ({ eq: () => ({ single }) }) }) };
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({ from: () => chain });

    const result = await getMapping('org@example.com', 'clientes');
    expect(result).toBeNull();
  });

  it('requires custom_purpose_label for purpose=custom', async () => {
    await expect(getMapping('org@example.com', 'custom')).rejects.toThrow('custom_purpose_label required');
  });
});

describe('refreshHeaders', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads row 1 from tab and updates headers', async () => {
    const { getSheetsClient } = await import('@/lib/connectors/sheets-client');
    const { createAdminClient } = await import('@/lib/supabase/admin');

    const values = { get: vi.fn().mockResolvedValue({ data: { values: [['Nombre', 'Telefono', 'Email']] } }) };
    (getSheetsClient as ReturnType<typeof vi.fn>).mockResolvedValue({ spreadsheets: { values } });

    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          single: () => ({
            data: {
              id: 'm1',
              portal_email: 'org@example.com',
              spreadsheet_id: 'sheet-1',
              tab_name: 'Clientes',
            },
          }),
        }),
      }),
      update: () => ({ eq }),
    }));
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({ from });

    const result = await refreshHeaders('m1');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.headers).toEqual(['Nombre', 'Telefono', 'Email']);
    expect(values.get).toHaveBeenCalledWith(
      expect.objectContaining({
        spreadsheetId: 'sheet-1',
        range: 'Clientes!1:1',
      }),
    );
  });

  it('returns error when mapping not found', async () => {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({
      from: () => ({ select: () => ({ eq: () => ({ single: () => ({ data: null }) }) }) }),
    });
    const result = await refreshHeaders('missing');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('mapping_not_found');
  });

  it('returns sheets_api_error when Sheets API rejects', async () => {
    const { getSheetsClient } = await import('@/lib/connectors/sheets-client');
    const { createAdminClient } = await import('@/lib/supabase/admin');

    const values = { get: vi.fn().mockRejectedValue(new Error('Request had insufficient authentication scopes.')) };
    (getSheetsClient as ReturnType<typeof vi.fn>).mockResolvedValue({ spreadsheets: { values } });

    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            single: () => ({
              data: {
                id: 'm2',
                portal_email: 'org@example.com',
                spreadsheet_id: 'sheet-2',
                tab_name: 'Leads',
              },
            }),
          }),
        }),
      }),
    });

    const result = await refreshHeaders('m2');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('sheets_api_error');
      expect(result.detail).toContain('insufficient authentication');
    }
  });
});

describe('appendRow', () => {
  beforeEach(() => vi.clearAllMocks());

  const setupMock = (mapping: Record<string, unknown> | null, appendResult: string) => async () => {
    const { getSheetsClient } = await import('@/lib/connectors/sheets-client');
    const { createAdminClient } = await import('@/lib/supabase/admin');

    const append = vi.fn().mockResolvedValue({
      data: { updates: { updatedRange: appendResult } },
    });
    (getSheetsClient as ReturnType<typeof vi.fn>).mockResolvedValue({ spreadsheets: { values: { append } } });
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({
      from: () => ({ select: () => ({ eq: () => ({ single: () => ({ data: mapping }) }) }) }),
    });
    return append;
  };

  it('maps data object to array by headers order', async () => {
    const setup = setupMock(
      { id: 'm1', portal_email: 'o1', spreadsheet_id: 's1', tab_name: 'Clientes', headers: ['Nombre', 'Telefono', 'Email'] },
      'Clientes!A5:C5',
    );
    const append = await setup();

    const res = await appendRow('m1', { Nombre: 'Juan', Telefono: '555', Email: 'j@x.com' });
    expect(res.ok).toBe(true);
    expect(append).toHaveBeenCalledWith(expect.objectContaining({
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [['Juan', '555', 'j@x.com']] },
    }));
    if (res.ok) expect(res.data.row_number).toBe(5);
  });

  it('fills missing keys with empty string', async () => {
    const setup = setupMock(
      { id: 'm1', portal_email: 'o1', spreadsheet_id: 's1', tab_name: 'Clientes', headers: ['Nombre', 'Telefono', 'Email'] },
      'Clientes!A5:C5',
    );
    const append = await setup();

    await appendRow('m1', { Nombre: 'Ana' });
    expect(append).toHaveBeenCalledWith(expect.objectContaining({
      requestBody: { values: [['Ana', '', '']] },
    }));
  });

  it('returns headers_mismatch when data has key not in headers', async () => {
    await setupMock(
      { id: 'm1', portal_email: 'o1', spreadsheet_id: 's1', tab_name: 'Clientes', headers: ['Nombre'] },
      'Clientes!A5:A5',
    )();

    const res = await appendRow('m1', { Nombre: 'X', InexistentField: 'y' });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe('headers_mismatch');
      expect(res.detail).toContain('InexistentField');
      expect(res.detail).toContain('Nombre');
    }
  });

  it('returns mapping_not_found when mapping missing', async () => {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({
      from: () => ({ select: () => ({ eq: () => ({ single: () => ({ data: null }) }) }) }),
    });
    const res = await appendRow('missing', { X: 'y' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('mapping_not_found');
  });

  it('returns sheets_api_error when append rejects', async () => {
    const { getSheetsClient } = await import('@/lib/connectors/sheets-client');
    const { createAdminClient } = await import('@/lib/supabase/admin');

    const append = vi.fn().mockRejectedValue(new Error('Quota exceeded for quota metric'));
    (getSheetsClient as ReturnType<typeof vi.fn>).mockResolvedValue({ spreadsheets: { values: { append } } });
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            single: () => ({
              data: { id: 'm1', portal_email: 'o1', spreadsheet_id: 's1', tab_name: 'Clientes', headers: ['Nombre'] },
            }),
          }),
        }),
      }),
    });

    const res = await appendRow('m1', { Nombre: 'Test' });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe('sheets_api_error');
      expect(res.detail).toContain('Quota exceeded');
    }
  });
});

// ---------------------------------------------------------------------------
// Helper: build a mock Sheets client with a single get + update mock
// ---------------------------------------------------------------------------
const mkClient = (values: string[][]) => {
  const get = vi.fn().mockResolvedValue({ data: { values } });
  const update = vi.fn().mockResolvedValue({ data: {} });
  return { spreadsheets: { values: { get, update } } };
};

const mkSbMapping = (data: Record<string, unknown> | null) => ({
  from: () => ({
    select: () => ({
      eq: () => ({
        single: () => ({ data }),
      }),
    }),
  }),
});

// ---------------------------------------------------------------------------
// readRange
// ---------------------------------------------------------------------------
describe('readRange', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns rows as objects using headers as keys', async () => {
    const { getSheetsClient } = await import('@/lib/connectors/sheets-client');
    const { createAdminClient } = await import('@/lib/supabase/admin');
    (getSheetsClient as ReturnType<typeof vi.fn>).mockResolvedValue(mkClient([
      ['Nombre', 'Telefono'],
      ['Ana', '111'],
      ['Beto', '222'],
    ]));
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mkSbMapping({ id: 'm1', portal_email: 'o1', spreadsheet_id: 's1', tab_name: 'Clientes', headers: ['Nombre', 'Telefono'] }),
    );

    const res = await readRange('m1');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.rows).toEqual([
      { Nombre: 'Ana', Telefono: '111' },
      { Nombre: 'Beto', Telefono: '222' },
    ]);
  });

  it('returns mapping_not_found when mapping missing', async () => {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(mkSbMapping(null));

    const res = await readRange('missing');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('mapping_not_found');
  });

  it('returns sheets_api_error when Sheets API rejects', async () => {
    const { getSheetsClient } = await import('@/lib/connectors/sheets-client');
    const { createAdminClient } = await import('@/lib/supabase/admin');

    const get = vi.fn().mockRejectedValue(new Error('Sheets read failed'));
    (getSheetsClient as ReturnType<typeof vi.fn>).mockResolvedValue({ spreadsheets: { values: { get } } });
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mkSbMapping({ id: 'm1', portal_email: 'o1', spreadsheet_id: 's1', tab_name: 'Clientes', headers: ['Nombre'] }),
    );

    const res = await readRange('m1');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe('sheets_api_error');
      expect(res.detail).toContain('Sheets read failed');
    }
  });
});

// ---------------------------------------------------------------------------
// searchInTab
// ---------------------------------------------------------------------------
describe('searchInTab', () => {
  beforeEach(() => vi.clearAllMocks());

  it('filters rows case-insensitive across all columns', async () => {
    const { getSheetsClient } = await import('@/lib/connectors/sheets-client');
    const { createAdminClient } = await import('@/lib/supabase/admin');
    (getSheetsClient as ReturnType<typeof vi.fn>).mockResolvedValue(mkClient([
      ['Nombre', 'Telefono'],
      ['Ana Torres', '111'],
      ['Beto Ruiz', '222'],
      ['Carla ana', '333'],
    ]));
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mkSbMapping({ id: 'm1', portal_email: 'o1', spreadsheet_id: 's1', tab_name: 'X', headers: ['Nombre', 'Telefono'] }),
    );

    const res = await searchInTab('m1', 'ana');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.rows).toHaveLength(2);
  });

  it('returns mapping_not_found when mapping missing', async () => {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(mkSbMapping(null));

    const res = await searchInTab('missing', 'test');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('mapping_not_found');
  });

  it('returns sheets_api_error when Sheets API rejects', async () => {
    const { getSheetsClient } = await import('@/lib/connectors/sheets-client');
    const { createAdminClient } = await import('@/lib/supabase/admin');

    const get = vi.fn().mockRejectedValue(new Error('Network error during search'));
    (getSheetsClient as ReturnType<typeof vi.fn>).mockResolvedValue({ spreadsheets: { values: { get } } });
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mkSbMapping({ id: 'm1', portal_email: 'o1', spreadsheet_id: 's1', tab_name: 'X', headers: ['Nombre'] }),
    );

    const res = await searchInTab('m1', 'query');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe('sheets_api_error');
      expect(res.detail).toContain('Network error during search');
    }
  });
});

// ---------------------------------------------------------------------------
// updateRow
// ---------------------------------------------------------------------------
describe('updateRow', () => {
  beforeEach(() => vi.clearAllMocks());

  it('finds row by match_by column and updates values', async () => {
    const { getSheetsClient } = await import('@/lib/connectors/sheets-client');
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const client = mkClient([
      ['Nombre', 'Telefono', 'Email'],
      ['Ana', '111', 'a@x.com'],
      ['Beto', '222', 'b@x.com'],
    ]);
    (getSheetsClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mkSbMapping({ id: 'm1', portal_email: 'o1', spreadsheet_id: 's1', tab_name: 'Clientes', headers: ['Nombre', 'Telefono', 'Email'] }),
    );

    const res = await updateRow('m1', 'Nombre', 'Beto', { Telefono: '999' });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.row_number).toBe(3);
    expect(client.spreadsheets.values.update).toHaveBeenCalledWith(expect.objectContaining({
      spreadsheetId: 's1',
      range: 'Clientes!A3:C3',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [['Beto', '999', 'b@x.com']] },
    }));
  });

  it('returns row_not_found when match_value missing', async () => {
    const { getSheetsClient } = await import('@/lib/connectors/sheets-client');
    const { createAdminClient } = await import('@/lib/supabase/admin');
    (getSheetsClient as ReturnType<typeof vi.fn>).mockResolvedValue(mkClient([
      ['Nombre', 'Telefono'],
      ['Ana', '111'],
    ]));
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mkSbMapping({ id: 'm1', portal_email: 'o1', spreadsheet_id: 's1', tab_name: 'X', headers: ['Nombre', 'Telefono'] }),
    );

    const res = await updateRow('m1', 'Nombre', 'Zoe', { Telefono: '999' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('row_not_found');
  });

  it('returns sheets_api_error when Sheets API update rejects', async () => {
    const { getSheetsClient } = await import('@/lib/connectors/sheets-client');
    const { createAdminClient } = await import('@/lib/supabase/admin');

    const get = vi.fn().mockResolvedValue({ data: { values: [['Nombre'], ['Ana']] } });
    const update = vi.fn().mockRejectedValue(new Error('Write permission denied'));
    (getSheetsClient as ReturnType<typeof vi.fn>).mockResolvedValue({ spreadsheets: { values: { get, update } } });
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mkSbMapping({ id: 'm1', portal_email: 'o1', spreadsheet_id: 's1', tab_name: 'X', headers: ['Nombre'] }),
    );

    const res = await updateRow('m1', 'Nombre', 'Ana', { Nombre: 'Maria' });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe('sheets_api_error');
      expect(res.detail).toContain('Write permission denied');
    }
  });
});
