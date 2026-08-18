/**
 * schema.test.ts — verifica que las tablas del billing shared layer existen
 * con las columnas y constraints esperadas.
 *
 * Usa createAdminClient (service_role) para acceder a information_schema.
 * Requiere NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY en .env.local.
 */

import { describe, it, expect } from 'vitest';
import { createAdminClient } from '@/lib/supabase/admin';

// Helper: fetch column names for a table
async function getColumns(table: string): Promise<string[]> {
  const sb = createAdminClient();
  const { data, error } = await sb
    .from('information_schema.columns' as any)
    .select('column_name')
    .eq('table_schema', 'public')
    .eq('table_name', table);
  if (error) throw new Error(`getColumns(${table}): ${error.message}`);
  return (data as any[]).map((r) => r.column_name as string);
}

// Helper: check table exists
async function tableExists(table: string): Promise<boolean> {
  const sb = createAdminClient();
  const { data, error } = await sb
    .from('information_schema.tables' as any)
    .select('table_name')
    .eq('table_schema', 'public')
    .eq('table_name', table)
    .maybeSingle();
  if (error) throw new Error(`tableExists(${table}): ${error.message}`);
  return data !== null;
}

describe('billing_shared_layer schema', () => {
  describe('organization_integrations', () => {
    it('table exists', async () => {
      expect(await tableExists('organization_integrations')).toBe(true);
    });

    it('has required columns', async () => {
      const cols = await getColumns('organization_integrations');
      expect(cols).toEqual(
        expect.arrayContaining(['id', 'portal_email', 'type', 'config', 'created_at', 'updated_at']),
      );
    });

    it('enforces uniqueness of (portal_email, type)', async () => {
      const sb = createAdminClient();
      // Use a test portal_email that does NOT exist in organizations to avoid FK
      // We insert via execute to bypass FK — but instead use rpc or raw query
      // We test the constraint by attempting two identical inserts via SQL
      const { error } = await sb.rpc('exec_sql_test_helper' as any, {
        query: `
          DO $$
          DECLARE
            fake_email TEXT := 'schema_test_dup_type@test.centinelia.internal';
          BEGIN
            -- Ensure org row exists
            INSERT INTO organizations (portal_email, name, plan)
            VALUES (fake_email, 'Test Schema Org', 'starter')
            ON CONFLICT (portal_email) DO NOTHING;

            -- First insert
            INSERT INTO organization_integrations (portal_email, type, config)
            VALUES (fake_email, 'test_type_dup', '{}');

            -- Second insert — must violate unique constraint
            BEGIN
              INSERT INTO organization_integrations (portal_email, type, config)
              VALUES (fake_email, 'test_type_dup', '{}');
              RAISE EXCEPTION 'Expected unique violation but none raised';
            EXCEPTION WHEN unique_violation THEN
              NULL; -- expected
            END;

            -- Cleanup
            DELETE FROM organizations WHERE portal_email = fake_email;
          END;
          $$;
        `,
      });
      // rpc won't exist — fall back to direct insert test
      if (error && error.message.includes('function') && error.message.includes('does not exist')) {
        // no helper rpc, test via direct client inserts
        const testEmail = 'schema_test_dup_type2@test.centinelia.internal';
        await sb.from('organizations').insert({ portal_email: testEmail, name: 'Test', plan: 'starter' }).throwOnError();
        await sb.from('organization_integrations').insert({ portal_email: testEmail, type: 'test_dup', config: {} }).throwOnError();
        const { error: dupErr } = await sb.from('organization_integrations').insert({ portal_email: testEmail, type: 'test_dup', config: {} });
        await sb.from('organizations').delete().eq('portal_email', testEmail);
        expect(dupErr).not.toBeNull();
        expect(dupErr?.code).toBe('23505');
      } else {
        expect(error).toBeNull();
      }
    });
  });

  describe('billing_client_rules', () => {
    it('table exists', async () => {
      expect(await tableExists('billing_client_rules')).toBe(true);
    });

    it('has required columns', async () => {
      const cols = await getColumns('billing_client_rules');
      expect(cols).toEqual(
        expect.arrayContaining([
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
        ]),
      );
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
      await sb.from('organizations').delete().eq('portal_email', testEmail);

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
      await sb.from('organizations').delete().eq('portal_email', testEmail);

      expect(error).not.toBeNull();
      expect(error?.code).toBe('23505');
    });
  });

  describe('billing_product_aliases', () => {
    it('table exists', async () => {
      expect(await tableExists('billing_product_aliases')).toBe(true);
    });

    it('has required columns', async () => {
      const cols = await getColumns('billing_product_aliases');
      expect(cols).toEqual(
        expect.arrayContaining([
          'id',
          'portal_email',
          'integration_id',
          'alias_text',
          'adapter_sku',
          'learned_from',
          'created_at',
        ]),
      );
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

      await sb.from('organizations').delete().eq('portal_email', testEmail);

      expect(error).not.toBeNull();
      expect(error?.code).toBe('23505');
    });
  });

  describe('billing_activity_log', () => {
    it('table exists', async () => {
      expect(await tableExists('billing_activity_log')).toBe(true);
    });

    it('has required columns', async () => {
      const cols = await getColumns('billing_activity_log');
      expect(cols).toEqual(
        expect.arrayContaining([
          'id',
          'portal_email',
          'integration_id',
          'timestamp',
          'action_type',
          'severity',
          'entity_ref',
          'context',
        ]),
      );
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

      await sb.from('organizations').delete().eq('portal_email', testEmail);

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

      await sb.from('organizations').delete().eq('portal_email', testEmail);

      expect(error).toBeNull();
    });
  });
});
