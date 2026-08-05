import { getSheetsClient } from '@/lib/connectors/sheets-client';
import { createAdminClient } from '@/lib/supabase/admin';

export type SheetsMapping = {
  id: string;
  portal_email: string;
  purpose: 'clientes' | 'leads' | 'bitacoras' | 'oc' | 'cajas_chicas' | 'custom';
  custom_purpose_label: string | null;
  spreadsheet_id: string;
  tab_name: string;
  headers: string[];
  headers_synced_at: string;
};

export type ToolResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: string; detail?: string };

/**
 * Retrieves the sheets mapping for an org + purpose combination.
 *
 * Throws when purpose is 'custom' but no customLabel is provided — the caller
 * (a tool handler) is responsible for catching and shaping into { ok: false }.
 *
 * Returns null when no mapping exists for the given combination.
 */
export async function getMapping(
  portalEmail: string,
  purpose: SheetsMapping['purpose'],
  customLabel?: string,
): Promise<SheetsMapping | null> {
  if (purpose === 'custom' && !customLabel) {
    throw new Error('custom_purpose_label required when purpose=custom');
  }

  const sb = createAdminClient();
  let query = sb
    .from('sheets_mappings')
    .select('*')
    .eq('portal_email', portalEmail)
    .eq('purpose', purpose);

  if (purpose === 'custom') {
    query = query.eq('custom_purpose_label', customLabel!);
  }

  const { data, error } = await query.single();

  // PGRST116 = "Row not found" — not an error, just no mapping
  if (error && (error as { code?: string }).code !== 'PGRST116') throw error;

  return data as SheetsMapping | null;
}

/**
 * Reads the first row of the mapped spreadsheet tab and persists the headers.
 *
 * Never throws — all error paths return { ok: false, reason, detail? }.
 */
export async function refreshHeaders(
  mappingId: string,
): Promise<ToolResult<{ headers: string[] }>> {
  const sb = createAdminClient();

  const { data: mapping } = await sb
    .from('sheets_mappings')
    .select('*')
    .eq('id', mappingId)
    .single();

  if (!mapping) {
    return { ok: false, reason: 'mapping_not_found' };
  }

  let headers: string[];

  try {
    const client = await getSheetsClient(mapping.portal_email);
    const range = `${mapping.tab_name}!1:1`;
    const res = await client.spreadsheets.values.get({
      spreadsheetId: mapping.spreadsheet_id,
      range,
    });
    headers = ((res.data.values?.[0] ?? []) as unknown[]).map(String);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: 'sheets_api_error', detail };
  }

  await sb
    .from('sheets_mappings')
    .update({ headers, headers_synced_at: new Date().toISOString() })
    .eq('id', mappingId);

  return { ok: true, data: { headers } };
}

/**
 * Appends a data row to the mapped spreadsheet tab, mapping object keys to
 * the stored header order. Unknown keys cause an early headers_mismatch error.
 *
 * Never throws — all error paths return { ok: false, reason, detail? }.
 */
export async function appendRow(
  mappingId: string,
  data: Record<string, unknown>,
): Promise<ToolResult<{ row_number: number }>> {
  const sb = createAdminClient();
  const { data: mapping } = await sb
    .from('sheets_mappings')
    .select('*')
    .eq('id', mappingId)
    .single();

  if (!mapping) return { ok: false, reason: 'mapping_not_found' };

  const headers: string[] = mapping.headers ?? [];
  const dataKeys = Object.keys(data);
  const unknownKeys = dataKeys.filter(k => !headers.includes(k));
  if (unknownKeys.length > 0) {
    return {
      ok: false,
      reason: 'headers_mismatch',
      detail: `Keys not in sheet headers: ${unknownKeys.join(', ')}. Headers: ${headers.join(', ')}`,
    };
  }

  const row = headers.map(h => {
    const v = data[h];
    return v === undefined || v === null ? '' : String(v);
  });

  try {
    const client = await getSheetsClient(mapping.portal_email);
    const res = await client.spreadsheets.values.append({
      spreadsheetId: mapping.spreadsheet_id,
      range: `${mapping.tab_name}!A:A`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    });

    const updatedRange: string = res.data.updates?.updatedRange || '';
    const match = updatedRange.match(/!\D+(\d+):/);
    const rowNumber = match ? parseInt(match[1], 10) : -1;

    return { ok: true, data: { row_number: rowNumber } };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: 'sheets_api_error', detail };
  }
}
