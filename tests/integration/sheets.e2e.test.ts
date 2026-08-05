/**
 * Sheets E2E Integration Test
 *
 * Runs the real Google Sheets API when env vars are set.
 * Skips gracefully with a log message when they are not.
 *
 * To enable:
 *   export TEST_PORTAL_EMAIL=centinelia.dev@gmail.com
 *   export TEST_SPREADSHEET_ID=<id-from-google-sheets-url>
 *   export TEST_TAB=Clientes  # optional, defaults to 'Clientes'
 *
 *   npx vitest run tests/integration/sheets.e2e.test.ts
 *
 * Prerequisites (one-time setup):
 * 1. Create a spreadsheet named "Centinelia Test Sheet" in centinelia.dev@gmail.com Drive.
 * 2. Add a tab named "Clientes" with headers in row 1: Nombre | Telefono | Email
 * 3. Make sure the org at TEST_PORTAL_EMAIL has an active Google OAuth integration
 *    in integration_accounts (scope: spreadsheets).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { getMapping, refreshHeaders, appendRow, updateRow, readRange, searchInTab } from '@/lib/services/sheets';
import { createAdminClient } from '@/lib/supabase/admin';

// ---------------------------------------------------------------------------
// Env config — all optional; test suite is skipped when not set
// ---------------------------------------------------------------------------

const TEST_PORTAL_EMAIL = process.env.TEST_PORTAL_EMAIL;
const TEST_SPREADSHEET_ID = process.env.TEST_SPREADSHEET_ID;
const TEST_TAB = process.env.TEST_TAB ?? 'Clientes';

const isConfigured = !!(TEST_PORTAL_EMAIL && TEST_SPREADSHEET_ID);

// ---------------------------------------------------------------------------
// Marker test — always runs, lets vitest report something instead of 0 tests
// ---------------------------------------------------------------------------

describe('Sheets E2E env check', () => {
  it('logs whether real integration is configured', () => {
    console.log(
      isConfigured
        ? `[sheets e2e] configured — portal ${TEST_PORTAL_EMAIL}, sheet ${TEST_SPREADSHEET_ID}, tab ${TEST_TAB}`
        : '[sheets e2e] skipped — set TEST_PORTAL_EMAIL, TEST_SPREADSHEET_ID (and optionally TEST_TAB) to enable',
    );
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Real E2E suite — only runs when env vars are present
// ---------------------------------------------------------------------------

describe.skipIf(!isConfigured)('Sheets E2E (real API)', () => {
  let mappingId: string;

  // Upsert a sheets_mappings row for the test org + purpose='clientes'.
  // onConflict on (portal_email, purpose) so re-runs are idempotent.
  beforeAll(async () => {
    const sb = createAdminClient();

    const { data, error } = await sb
      .from('sheets_mappings')
      .upsert(
        {
          portal_email:    TEST_PORTAL_EMAIL!,
          purpose:         'clientes',
          spreadsheet_id:  TEST_SPREADSHEET_ID!,
          tab_name:        TEST_TAB,
          headers:         [],
        },
        { onConflict: 'portal_email,purpose' },
      )
      .select('id')
      .single();

    if (error) throw new Error(`beforeAll upsert failed: ${error.message}`);

    mappingId = data!.id;

    // Prime the headers cache from row 1 of the real sheet
    const headersResult = await refreshHeaders(mappingId);
    if (!headersResult.ok) {
      throw new Error(
        `refreshHeaders failed in beforeAll: ${headersResult.reason}${headersResult.detail ? ` — ${headersResult.detail}` : ''}`,
      );
    }
  });

  // ── Test 1: headers ────────────────────────────────────────────────────────

  it('reads current headers from row 1 of the real sheet', async () => {
    const mapping = await getMapping(TEST_PORTAL_EMAIL!, 'clientes');
    expect(mapping).not.toBeNull();
    expect(Array.isArray(mapping!.headers)).toBe(true);
    expect(mapping!.headers.length).toBeGreaterThan(0);
    // The "Clientes" tab is expected to have at least Nombre, Telefono, Email
    expect(mapping!.headers).toContain('Nombre');
  });

  // ── Test 2: append + search ────────────────────────────────────────────────

  it('appends a row and finds it via searchInTab', async () => {
    const uniqueName = `TestUser-${Date.now()}`;

    const appendRes = await appendRow(mappingId, {
      Nombre:   uniqueName,
      Telefono: '5555555555',
      Email:    'test@centinelia.dev',
    });

    expect(appendRes.ok).toBe(true);
    if (!appendRes.ok) return; // narrow type for TS

    expect(appendRes.data.row_number).toBeGreaterThan(1); // row 1 is headers

    const searchRes = await searchInTab(mappingId, uniqueName);
    expect(searchRes.ok).toBe(true);
    if (!searchRes.ok) return;

    expect(searchRes.data.rows.length).toBeGreaterThanOrEqual(1);
    expect(searchRes.data.rows[0].Nombre).toBe(uniqueName);
  });

  // ── Test 3: update + verify ────────────────────────────────────────────────

  it('updates a row by match and reads back the new value', async () => {
    const uniqueName = `TestUpdate-${Date.now()}`;

    // Seed the row we will update
    await appendRow(mappingId, {
      Nombre:   uniqueName,
      Telefono: '1110000000',
      Email:    'update-before@centinelia.dev',
    });

    const updRes = await updateRow(mappingId, 'Nombre', uniqueName, {
      Telefono: '9999999999',
      Email:    'update-after@centinelia.dev',
    });

    expect(updRes.ok).toBe(true);
    if (!updRes.ok) return;

    // Verify by re-searching
    const searchRes = await searchInTab(mappingId, uniqueName);
    expect(searchRes.ok).toBe(true);
    if (!searchRes.ok) return;

    const row = searchRes.data.rows[0];
    expect(row).toBeDefined();
    expect(row.Telefono).toBe('9999999999');
    expect(row.Email).toBe('update-after@centinelia.dev');
  });

  // ── Test 4: read all rows as objects ──────────────────────────────────────

  it('reads all rows as header-keyed objects via readRange', async () => {
    const readRes = await readRange(mappingId);
    expect(readRes.ok).toBe(true);
    if (!readRes.ok) return;

    expect(Array.isArray(readRes.data.rows)).toBe(true);

    // If there are any data rows, they must be header-keyed objects
    if (readRes.data.rows.length > 0) {
      const first = readRes.data.rows[0];
      expect(typeof first).toBe('object');
      expect(first).toHaveProperty('Nombre');
      expect(first).toHaveProperty('Telefono');
    }
  });
});
