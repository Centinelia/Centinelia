/**
 * schema.test.ts — verifica que las tablas del billing shared layer existen
 * con las columnas y constraints esperadas.
 *
 * Usa createAdminClient (service_role) para acceder a las tablas via PostgREST.
 * Requiere NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY en .env.local.
 *
 * NOTE: information_schema is NOT exposed by PostgREST. We verify table existence
 * via a SELECT LIMIT 0 and column presence via selecting specific columns LIMIT 0.
 *
 * NOTE: Test emails use prefix 'schema_test_' — they are synthetic and safe to delete.
 * Cleanup runs before each test group to handle leftover rows from prior runs.
 */

import { beforeEach, describe, it, expect } from 'vitest';
import { createAdminClient } from '@/lib/supabase/admin';

// Helper: check if a table exists by attempting a SELECT LIMIT 0.
// PostgREST returns error code 'PGRST205' or message containing 'does not exist'
// when the table is not in the schema cache.
async function tableExists(table: string): Promise<boolean> {
  const sb = createAdminClient();
  const { error } = await sb.from(table as any).select('*').limit(0);
  if (!error) return true;
  if (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    error.message?.includes('does not exist') ||
    error.message?.includes('schema cache')
  ) {
    return false;
  }
  throw new Error(`tableExists(${table}): unexpected error [${error.code}]: ${error.message}`);
}

// Helper: check that a table has all expected columns by selecting them with LIMIT 0.
// If the SELECT succeeds, all columns exist. If it fails, we probe each column individually.
async function tableHasColumns(
  table: string,
  expectedCols: string[],
): Promise<{ hasAll: boolean; missing: string[] }> {
  const sb = createAdminClient();
  const { error } = await sb.from(table as any).select(expectedCols.join(',')).limit(0);
  if (!error) return { hasAll: true, missing: [] };
  // Probe each column individually to find which ones are missing
  const missing: string[] = [];
  for (const col of expectedCols) {
    const { error: colErr } = await sb.from(table as any).select(col).limit(0);
    if (colErr) missing.push(col);
  }
  return { hasAll: missing.length === 0, missing };
}

// Cleanup: delete test org by portal_email. ON DELETE CASCADE removes child rows.
async function cleanupTestOrg(email: string): Promise<void> {
  const sb = createAdminClient();
  await sb.from('organizations').delete().eq('portal_email', email);
}

// All synthetic test emails used across this file
const TEST_EMAILS = [
  'schema_test_dup_type2@test.centinelia.internal',
  'schema_test_freq@test.centinelia.internal',
  'schema_test_uniq_rfc@test.centinelia.internal',
  'schema_test_alias@test.centinelia.internal',
  'schema_test_severity@test.centinelia.internal',
  'schema_test_log_null_integ@test.centinelia.internal',
  'schema_test_dup_type@test.centinelia.internal',
];

beforeEach(async () => {
  // Clean up all synthetic test orgs before each test to avoid UNIQUE violations
  // from prior runs. ON DELETE CASCADE handles child tables automatically.
  await Promise.all(TEST_EMAILS.map(cleanupTestOrg));
});

describe('billing_shared_layer schema', () => {
  describe('organization_integrations', () => {
    it('table exists', async () => {
      expect(await tableExists('organization_integrations')).toBe(true);
    });

    it('has required columns', async () => {
      const { hasAll, missing } = await tableHasColumns('organization_integrations', [
        'id',
        'portal_email',
        'type',
        'config',
        'created_at',
        'updated_at',
      ]);
      expect(missing).toEqual([]);
      expect(hasAll).toBe(true);
    });

    it('enforces uniqueness of (portal_email, type)', async () => {
      const sb = createAdminClient();
      const testEmail = 'schema_test_dup_type2@test.centinelia.internal';
      await sb.from('organizations').insert({ portal_email: testEmail, name: 'Test', plan: 'starter' }).throwOnError();
      await sb.from('organization_integrations').insert({ portal_email: testEmail, type: 'test_dup', config: {} }).throwOnError();
      const { error: dupErr } = await sb.from('organization_integrations').insert({ portal_email: testEmail, type: 'test_dup', config: {} });
      await cleanupTestOrg(testEmail);
      expect(dupErr).not.toBeNull();
      expect(dupErr?.code).toBe('23505');
    });
  });

  describe('billing_client_rules', () => {
    it('table exists', async () => {
      expect(await tableExists('billing_client_rules')).toBe(true);
    });

    it('has required columns', async () => {
      const { hasAll, missing } = await tableHasColumns('billing_client_rules', [
        'id',
        'portal_email',
        'integration_id',
        'rfc',
        'adapter_client_id',
        'frequency',
        'cut_day',
        'default_payment_method',
        'aliases',
        'notes',
        'created_at',
        'updated_at',
      ]);
      expect(missing).toEqual([]);
      expect(hasAll).toBe(true);
    });

    it('enforces frequency CHECK constraint (rejects invalid value)', async () => {
      const sb = createAdminClient();
      const testEmail = 'schema_test_freq@test.centinelia.internal';
      await sb.from('organizations').insert({ portal_email: testEmail, name: 'Test', plan: 'starter' }).throwOnError();
      const { data: integ } = await sb
        .from('organization_integrations')
        .insert({ portal_email: testEmail, type: 'solucion_factible', config: {} })
        .select('id')
        .single()
        .throwOnError();

      const { error } = await sb.from('billing_client_rules').insert({
        portal_email: testEmail,
        integration_id: integ!.id,
        rfc: 'XAXX010101000',
        frequency: 'yearly', // invalid value
      });

      // Cleanup regardless of outcome
      await cleanupTestOrg(testEmail);

      expect(error).not.toBeNull();
      // PostgreSQL CHECK violation is 23514
      expect(error?.code).toBe('23514');
    });

    it('enforces UNIQUE (integration_id, rfc)', async () => {
      const sb = createAdminClient();
      const testEmail = 'schema_test_uniq_rfc@test.centinelia.internal';
      await sb.from('organizations').insert({ portal_email: testEmail, name: 'Test', plan: 'starter' }).throwOnError();
      const { data: integ } = await sb
        .from('organization_integrations')
        .insert({ portal_email: testEmail, type: 'solucion_factible', config: {} })
        .select('id')
        .single()
        .throwOnError();

      await sb.from('billing_client_rules').insert({
        portal_email: testEmail,
        integration_id: integ!.id,
        rfc: 'DUP010101DUP',
        frequency: 'monthly',
      }).throwOnError();

      const { error } = await sb.from('billing_client_rules').insert({
        portal_email: testEmail,
        integration_id: integ!.id,
        rfc: 'DUP010101DUP',
        frequency: 'weekly',
      });

      // Cleanup
      await cleanupTestOrg(testEmail);

      expect(error).not.toBeNull();
      expect(error?.code).toBe('23505');
    });
  });

  describe('billing_product_aliases', () => {
    it('table exists', async () => {
      expect(await tableExists('billing_product_aliases')).toBe(true);
    });

    it('has required columns', async () => {
      const { hasAll, missing } = await tableHasColumns('billing_product_aliases', [
        'id',
        'portal_email',
        'integration_id',
        'alias_text',
        'adapter_sku',
        'learned_from',
        'created_at',
      ]);
      expect(missing).toEqual([]);
      expect(hasAll).toBe(true);
    });

    it('enforces UNIQUE (integration_id, alias_text)', async () => {
      const sb = createAdminClient();
      const testEmail = 'schema_test_alias@test.centinelia.internal';
      await sb.from('organizations').insert({ portal_email: testEmail, name: 'Test', plan: 'starter' }).throwOnError();
      const { data: integ } = await sb
        .from('organization_integrations')
        .insert({ portal_email: testEmail, type: 'solucion_factible', config: {} })
        .select('id')
        .single()
        .throwOnError();

      await sb.from('billing_product_aliases').insert({
        portal_email: testEmail,
        integration_id: integ!.id,
        alias_text: 'coca cola',
        adapter_sku: 'SKU-001',
      }).throwOnError();

      const { error } = await sb.from('billing_product_aliases').insert({
        portal_email: testEmail,
        integration_id: integ!.id,
        alias_text: 'coca cola',
        adapter_sku: 'SKU-002',
      });

      await cleanupTestOrg(testEmail);

      expect(error).not.toBeNull();
      expect(error?.code).toBe('23505');
    });
  });

  describe('billing_activity_log', () => {
    it('table exists', async () => {
      expect(await tableExists('billing_activity_log')).toBe(true);
    });

    it('has required columns', async () => {
      const { hasAll, missing } = await tableHasColumns('billing_activity_log', [
        'id',
        'portal_email',
        'integration_id',
        'timestamp',
        'action_type',
        'severity',
        'entity_ref',
        'context',
      ]);
      expect(missing).toEqual([]);
      expect(hasAll).toBe(true);
    });

    it('enforces severity CHECK constraint (rejects invalid value)', async () => {
      const sb = createAdminClient();
      const testEmail = 'schema_test_severity@test.centinelia.internal';
      await sb.from('organizations').insert({ portal_email: testEmail, name: 'Test', plan: 'starter' }).throwOnError();

      const { error } = await sb.from('billing_activity_log').insert({
        portal_email: testEmail,
        action_type: 'test_action',
        severity: 'critical', // invalid
        context: {},
      });

      await cleanupTestOrg(testEmail);

      expect(error).not.toBeNull();
      expect(error?.code).toBe('23514');
    });

    it('accepts nullable integration_id', async () => {
      const sb = createAdminClient();
      const testEmail = 'schema_test_log_null_integ@test.centinelia.internal';
      await sb.from('organizations').insert({ portal_email: testEmail, name: 'Test', plan: 'starter' }).throwOnError();

      const { error } = await sb.from('billing_activity_log').insert({
        portal_email: testEmail,
        action_type: 'system_check',
        severity: 'info',
        context: { source: 'schema_test' },
      });

      await cleanupTestOrg(testEmail);

      expect(error).toBeNull();
    });
  });
});
