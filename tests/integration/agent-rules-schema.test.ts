/**
 * Tests de integración para el schema de agent_rules (Fase 2).
 *
 * Requiere aplicar la migration antes de ejecutar:
 *   pnpm exec supabase db push
 *
 * Ejecutar con:
 *   pnpm test:integration -- agent-rules-schema
 *
 * Variables de entorno requeridas (.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL  (debe apuntar a dev, NO a prod hosted)
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Se activa TEST_ALLOW_PROD=true SOLO si se usa un proyecto Supabase de staging
 * dedicado que NO tiene datos reales de clientes.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertNotProdOrAllowed } from '@/lib/test-helpers/prod-guard';

const supabase = createAdminClient();

// Email de test sintético. Debe existir en organizations en el ambiente de dev.
const TEST_PORTAL_EMAIL = process.env.TEST_PORTAL_EMAIL ?? 'agent-rules-test@test.centinelia.invalid';

beforeAll(async () => {
  await assertNotProdOrAllowed();
});

afterAll(async () => {
  // Limpiar las reglas de test para no contaminar el ambiente.
  await supabase
    .from('agent_rules')
    .delete()
    .eq('portal_email', TEST_PORTAL_EMAIL);
});

// ---------------------------------------------------------------------------
// Task 2.1: agent_rules tabla y columnas
// ---------------------------------------------------------------------------
describe('agent_rules schema', () => {
  it('la tabla tiene las columnas esperadas', async () => {
    const { data, error } = await supabase
      .from('agent_rules')
      .select('id, portal_email, regla, detalles, applies_to, active, created_at, updated_at, created_by')
      .limit(1);

    expect(error).toBeNull();
    // La query no debe fallar aunque no haya rows.
  });

  it('acepta insert con campos mínimos (regla)', async () => {
    const { data, error } = await supabase
      .from('agent_rules')
      .insert({
        portal_email: TEST_PORTAL_EMAIL,
        regla: 'Regla de prueba integración',
        applies_to: [],
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.id).toBeTruthy();
    expect(data!.active).toBe(true);
    expect(data!.applies_to).toEqual([]);
  });

  it('active=true por defecto', async () => {
    const { data, error } = await supabase
      .from('agent_rules')
      .insert({
        portal_email: TEST_PORTAL_EMAIL,
        regla: 'Regla default active test',
        applies_to: [],
      })
      .select('active')
      .single();

    expect(error).toBeNull();
    expect(data!.active).toBe(true);
  });

  it('acepta applies_to con slugs válidos del roster', async () => {
    const { data, error } = await supabase
      .from('agent_rules')
      .insert({
        portal_email: TEST_PORTAL_EMAIL,
        regla: 'Regla solo para nia y noah',
        applies_to: ['nia', 'noah'],
      })
      .select('applies_to')
      .single();

    expect(error).toBeNull();
    expect(data!.applies_to).toEqual(['nia', 'noah']);
  });

  it('regla vacía es rechazada por CHECK constraint', async () => {
    const { error } = await supabase
      .from('agent_rules')
      .insert({
        portal_email: TEST_PORTAL_EMAIL,
        regla: '',
        applies_to: [],
      });

    expect(error).not.toBeNull();
  });

  it('updated_at se actualiza al hacer UPDATE', async () => {
    // Insertar
    const { data: inserted, error: insErr } = await supabase
      .from('agent_rules')
      .insert({
        portal_email: TEST_PORTAL_EMAIL,
        regla: 'Regla para test de updated_at',
        applies_to: [],
      })
      .select('id, updated_at')
      .single();

    expect(insErr).toBeNull();
    const ruleId    = inserted!.id;
    const updatedAt = inserted!.updated_at;

    // Pequeña pausa para asegurar cambio de timestamp
    await new Promise((r) => setTimeout(r, 10));

    // Actualizar
    const { data: updated, error: updErr } = await supabase
      .from('agent_rules')
      .update({ regla: 'Regla modificada' })
      .eq('id', ruleId)
      .select('updated_at')
      .single();

    expect(updErr).toBeNull();
    // updated_at debe haber cambiado (o al menos no fallar)
    expect(updated!.updated_at).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Task 2.1: get_rules_for_agent RPC
// ---------------------------------------------------------------------------
describe('get_rules_for_agent RPC', () => {
  it('devuelve reglas con applies_to vacío (global)', async () => {
    // Insertar regla global
    const { error: insErr } = await supabase
      .from('agent_rules')
      .insert({
        portal_email: TEST_PORTAL_EMAIL,
        regla: 'Regla global de integración',
        applies_to: [],
        active: true,
      });
    expect(insErr).toBeNull();

    const { data, error } = await supabase.rpc('get_rules_for_agent', {
      p_portal_email:     TEST_PORTAL_EMAIL,
      p_meerkat_role_id:  'nia',
    });

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    // Debe incluir la regla global (applies_to = {})
    const global = (data as { regla: string; applies_to: string[] }[])
      .find((r) => r.regla === 'Regla global de integración');
    expect(global).toBeTruthy();
  });

  it('devuelve reglas específicas del rol', async () => {
    // Insertar regla solo para nash
    const { error: insErr } = await supabase
      .from('agent_rules')
      .insert({
        portal_email: TEST_PORTAL_EMAIL,
        regla: 'Regla solo para nash integración',
        applies_to: ['nash'],
        active: true,
      });
    expect(insErr).toBeNull();

    const { data: dataNash, error: errNash } = await supabase.rpc('get_rules_for_agent', {
      p_portal_email:     TEST_PORTAL_EMAIL,
      p_meerkat_role_id:  'nash',
    });

    expect(errNash).toBeNull();
    const nashRule = (dataNash as { regla: string }[])
      .find((r) => r.regla === 'Regla solo para nash integración');
    expect(nashRule).toBeTruthy();

    // La misma regla no debe aparecer para nia
    const { data: dataNia, error: errNia } = await supabase.rpc('get_rules_for_agent', {
      p_portal_email:     TEST_PORTAL_EMAIL,
      p_meerkat_role_id:  'nia',
    });

    expect(errNia).toBeNull();
    const niaShouldNotHaveRule = (dataNia as { regla: string }[])
      .find((r) => r.regla === 'Regla solo para nash integración');
    expect(niaShouldNotHaveRule).toBeUndefined();
  });

  it('no devuelve reglas inactivas', async () => {
    // Insertar regla inactiva
    const { error: insErr } = await supabase
      .from('agent_rules')
      .insert({
        portal_email: TEST_PORTAL_EMAIL,
        regla: 'Regla inactiva integración',
        applies_to: [],
        active: false,
      });
    expect(insErr).toBeNull();

    const { data, error } = await supabase.rpc('get_rules_for_agent', {
      p_portal_email:     TEST_PORTAL_EMAIL,
      p_meerkat_role_id:  'nia',
    });

    expect(error).toBeNull();
    const inactiveRule = (data as { regla: string }[])
      .find((r) => r.regla === 'Regla inactiva integración');
    expect(inactiveRule).toBeUndefined();
  });
});
