import { getSheetsClient } from '@/lib/connectors/sheets-client';
import { createAdminClient } from '@/lib/supabase/admin';
import { consumeAiOp } from '@/lib/ai/ops-guard';

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
  try {
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

    const client = await getSheetsClient(mapping.portal_email);
    const range = `${mapping.tab_name}!1:1`;
    const res = await client.spreadsheets.values.get({
      spreadsheetId: mapping.spreadsheet_id,
      range,
    });
    headers = ((res.data.values?.[0] ?? []) as unknown[]).map(String);

    await sb
      .from('sheets_mappings')
      .update({ headers, headers_synced_at: new Date().toISOString() })
      .eq('id', mappingId);

    return { ok: true, data: { headers } };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: 'sheets_api_error', detail };
  }
}

// ---------------------------------------------------------------------------
// Internal helper: load mapping + all sheet rows in one go
// ---------------------------------------------------------------------------
async function loadAllRows(mappingId: string): Promise<
  | { ok: true; mapping: SheetsMapping; rows: string[][] }
  | { ok: false; reason: string; detail?: string }
> {
  try {
    const sb = createAdminClient();
    const { data: mapping } = await sb
      .from('sheets_mappings')
      .select('*')
      .eq('id', mappingId)
      .single();

    if (!mapping) return { ok: false, reason: 'mapping_not_found' };

    const client = await getSheetsClient(mapping.portal_email);
    const res = await client.spreadsheets.values.get({
      spreadsheetId: mapping.spreadsheet_id,
      range: mapping.tab_name,
    });
    const values = (res.data.values ?? []) as string[][];
    return { ok: true, mapping: mapping as SheetsMapping, rows: values };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: 'sheets_api_error', detail };
  }
}

function rowsToObjects(headers: string[], dataRows: string[][]): Record<string, string>[] {
  return dataRows.map(row => {
    const o: Record<string, string> = {};
    headers.forEach((h, i) => { o[h] = row[i] ?? ''; });
    return o;
  });
}

/**
 * Returns all data rows from the mapped tab as an array of header-keyed objects.
 *
 * Never throws — all error paths return { ok: false, reason, detail? }.
 */
export async function readRange(
  mappingId: string,
  _range?: string,
): Promise<ToolResult<{ rows: Record<string, string>[] }>> {
  const loaded = await loadAllRows(mappingId);
  if (!loaded.ok) return loaded;
  const headers = loaded.mapping.headers ?? [];
  const dataRows = loaded.rows.slice(1);
  return { ok: true, data: { rows: rowsToObjects(headers, dataRows) } };
}

/**
 * Returns rows whose cells contain the query string (case-insensitive).
 *
 * Never throws — all error paths return { ok: false, reason, detail? }.
 */
export async function searchInTab(
  mappingId: string,
  query: string,
): Promise<ToolResult<{ rows: Record<string, string>[] }>> {
  const loaded = await loadAllRows(mappingId);
  if (!loaded.ok) return loaded;
  const headers = loaded.mapping.headers ?? [];
  const dataRows = loaded.rows.slice(1);
  const q = query.toLowerCase();
  const matched = dataRows.filter(row => row.some(cell => (cell ?? '').toLowerCase().includes(q)));
  return { ok: true, data: { rows: rowsToObjects(headers, matched) } };
}

/**
 * Finds the first row where `matchBy` column equals `matchValue`, merges `data`
 * into it, and writes the updated row back to Sheets.
 *
 * Returns { row_number } (1-indexed, header row = 1).
 * Limitation: column notation uses A-Z only; works for sheets up to 26 columns.
 *
 * Never throws — all error paths return { ok: false, reason, detail? }.
 */
export async function updateRow(
  mappingId: string,
  matchBy: string,
  matchValue: string,
  data: Record<string, unknown>,
): Promise<ToolResult<{ row_number: number }>> {
  const loaded = await loadAllRows(mappingId);
  if (!loaded.ok) return loaded;
  const { mapping, rows } = loaded;
  const headers = mapping.headers ?? [];

  const colIdx = headers.indexOf(matchBy);
  if (colIdx === -1) {
    return { ok: false, reason: 'headers_mismatch', detail: `match_by '${matchBy}' not in headers` };
  }

  const unknownKeys = Object.keys(data).filter(k => !headers.includes(k));
  if (unknownKeys.length > 0) {
    return { ok: false, reason: 'headers_mismatch', detail: `Keys not in headers: ${unknownKeys.join(', ')}` };
  }

  const dataRows = rows.slice(1);
  const rowIdx = dataRows.findIndex(r => (r[colIdx] ?? '') === matchValue);
  if (rowIdx === -1) return { ok: false, reason: 'row_not_found' };

  const currentRow = [...dataRows[rowIdx]];
  while (currentRow.length < headers.length) currentRow.push('');

  headers.forEach((h, i) => {
    if (h in data) {
      const v = data[h];
      currentRow[i] = v === undefined || v === null ? '' : String(v);
    }
  });

  const rowNumber = rowIdx + 2; // +1 for header row, +1 for 1-indexed
  const lastCol = String.fromCharCode(65 + headers.length - 1); // A=65; works for ≤26 cols

  try {
    const client = await getSheetsClient(mapping.portal_email);
    await client.spreadsheets.values.update({
      spreadsheetId: mapping.spreadsheet_id,
      range: `${mapping.tab_name}!A${rowNumber}:${lastCol}${rowNumber}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [currentRow] },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: 'sheets_api_error', detail };
  }

  return { ok: true, data: { row_number: rowNumber } };
}

/**
 * Returns true when the org identified by portalEmail has at least one
 * sheets_mapping row configured.
 *
 * Fail-safe: returns false on any error so that buildTools never throws.
 */
export async function hasAnyMapping(portalEmail: string): Promise<boolean> {
  try {
    const sb = createAdminClient();
    const { count } = await sb
      .from('sheets_mappings')
      .select('id', { count: 'exact', head: true })
      .eq('portal_email', portalEmail);
    return (count ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Fire-and-forget helper: syncs a newly-created lead to Google Sheets cuando
 * existe un mapping de 'leads' en la org. El mapping mismo es el switch —
 * si no quieres sincronizar, borra el mapping.
 *
 * Contract:
 * - Never throws, never propagates a rejection — safe for `void syncLeadToSheets(...)`.
 * - Does not block the caller; callers should fire with `void`.
 * - A headers_mismatch (lowercase keys vs Title-Case headers) is caught and
 *   logged — the customer is expected to configure their sheet headers to match.
 */
export async function syncLeadToSheets(
  portalEmail: string,
  agentId: string,
  args: Record<string, string | undefined>,
): Promise<void> {
  try {
    const sb = createAdminClient();

    const mapping = await getMapping(portalEmail, 'leads');
    if (!mapping) return;

    const result = await appendRow(mapping.id, {
      nombre:   args.nombre   ?? '',
      telefono: args.telefono ?? '',
      email:    args.email    ?? '',
      notas:    args.notas    ?? '',
      fuente:   'voz',
      fecha:    new Date().toISOString(),
    });

    if (!result.ok) {
      // Log visibility without a schema dependency — agent_learnings is confirmed to exist.
      await sb.from('agent_learnings').insert({
        agent_id: agentId,
        source:   'sheets_sync_fail',
        content:  `crear_lead sync a Sheets fallo: ${result.reason}${result.detail ? ` — ${result.detail}` : ''}`,
      });
    } else {
      // Cost-based charge: Google Sheets write real via OAuth API.
      await consumeAiOp(agentId, 1, {
        source: 'sheets_row_appended',
        label:  'Fila agregada a Google Sheets',
      });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[sheets sync leads]', msg);
  }
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
  try {
    const sb = createAdminClient();
    const { data: mapping } = await sb
      .from('sheets_mappings')
      .select('*')
      .eq('id', mappingId)
      .single();

    if (!mapping) return { ok: false, reason: 'mapping_not_found' };

    let headers: string[] = mapping.headers ?? [];
    const dataKeys = Object.keys(data);

    // I-2: if headers are empty but data is non-empty, auto-refresh once so a
    // freshly-created mapping (where background refreshHeaders hasn't landed yet)
    // can still append successfully on the first call.
    if (headers.length === 0 && dataKeys.length > 0) {
      const refreshResult = await refreshHeaders(mappingId);
      if (refreshResult.ok) {
        headers = refreshResult.data.headers;
      }
      // If refresh returned empty headers the sheet's row 1 is genuinely empty.
      if (headers.length === 0) {
        return {
          ok: false,
          reason: 'headers_not_synced',
          detail: 'La hoja no tiene encabezados en la fila 1. Configúralos y vuelve a intentar.',
        };
      }
    }

    let unknownKeys = dataKeys.filter(k => !headers.includes(k));
    // Auto-refresh once when data keys don't match — customer likely renamed
    // or added a column in Sheets after setup. Removes the need for the manual
    // "Actualizar columnas" button in the common case.
    if (unknownKeys.length > 0) {
      const refreshResult = await refreshHeaders(mappingId);
      if (refreshResult.ok && refreshResult.data.headers.length > 0) {
        headers = refreshResult.data.headers;
        unknownKeys = dataKeys.filter(k => !headers.includes(k));
      }
    }
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
