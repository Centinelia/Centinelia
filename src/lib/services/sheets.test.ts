import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getMapping, refreshHeaders, appendRow } from './sheets';

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
