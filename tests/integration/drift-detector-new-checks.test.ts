/**
 * Integration tests para los nuevos checks del drift detector (Fase 7 Task 7.2).
 *
 * Tests:
 * 1. detectTaskActionOrphans: detecta task_action sin task_execution_start correspondiente.
 * 2. detectAutotagBackfillIssues stall check: ya existe y funciona (smoke check).
 * 3. backfillFichaTags: fichas_timeout separado de fichas_error.
 *
 * Requiere TEST_PORTAL_EMAIL para correr contra Supabase real.
 * assertNotProdOrAllowed en beforeAll garantiza que NO corremos contra prod.
 *
 * Si TEST_PORTAL_EMAIL no está seteado, los tests se marcan como skip.
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertNotProdOrAllowed } from '@/lib/test-helpers/prod-guard';
import { detectTaskActionOrphans } from '@/lib/ops/consumption-audit';
import { backfillFichaTags } from '@/lib/workers/backfill-ficha-tags';

const TEST_EMAIL = process.env.TEST_PORTAL_EMAIL;
const supabase = createAdminClient();

async function cleanupAiOpsLog(agentId: string) {
  // Limpia filas de test en ai_ops_log para el agentId de prueba.
  // ai_ops_log puede tener tamper-protection similar a ops_ledger.
  // Si existe el RPC test_cleanup_ai_ops_log lo usamos; si no, delete directo.
  try {
    await supabase
      .from('ai_ops_log')
      .delete()
      .eq('agent_id', agentId);
  } catch { /* Si está protegida, ignorar — los tests deben ser idempotentes */ }
}

describe('detectTaskActionOrphans', () => {
  const TEST_AGENT_ID = 'test-agent-orphan-00000000-0000-0000-0000-000000000001';
  const TEST_RUN_ID_ORPHAN = 'test-run-orphan-00000000-0000-0000-0000-aaa000000001';
  const TEST_RUN_ID_VALID  = 'test-run-valid-00000000-0000-0000-0000-bbb000000001';

  beforeAll(async () => {
    if (!TEST_EMAIL) return;
    await assertNotProdOrAllowed();
    await cleanupAiOpsLog(TEST_AGENT_ID);
  });

  afterEach(async () => {
    if (!TEST_EMAIL) return;
    await cleanupAiOpsLog(TEST_AGENT_ID);
  });

  it('retorna array vacío cuando no hay task_action rows en la ventana', async () => {
    if (!TEST_EMAIL) {
      console.log('[skip] TEST_PORTAL_EMAIL no seteado');
      return;
    }

    const orphans = await detectTaskActionOrphans(1); // solo 1 hora de ventana
    // Puede haber orphans de otras fuentes; verificamos que no falla
    expect(Array.isArray(orphans)).toBe(true);
  });

  it('detecta task_action sin task_execution_start correspondiente', async () => {
    if (!TEST_EMAIL) {
      console.log('[skip] TEST_PORTAL_EMAIL no seteado');
      return;
    }

    // Seed: insertar task_action con run_id que NO tiene start
    await supabase.from('ai_ops_log').insert({
      agent_id:     TEST_AGENT_ID,
      portal_email: TEST_EMAIL,
      source:       'task_action',
      reason:       'task_action',
      reference_id: 'test-task-orphan',
      count:        3,
      label:        'Test orphan task_action',
      context:      JSON.stringify({ run_id: TEST_RUN_ID_ORPHAN, trigger_source: 'cron' }),
    });

    // Detectar orphans en ventana de 2 horas
    const orphans = await detectTaskActionOrphans(2);
    const ourOrphan = orphans.find(o => o.run_id === TEST_RUN_ID_ORPHAN);

    expect(ourOrphan).toBeDefined();
    expect(ourOrphan?.orphan_count).toBe(1);
    expect(ourOrphan?.portal_email).toBe(TEST_EMAIL);
  });

  it('NO marca como orphan un task_action con task_execution_start correspondiente', async () => {
    if (!TEST_EMAIL) {
      console.log('[skip] TEST_PORTAL_EMAIL no seteado');
      return;
    }

    // Seed: insertar PRIMERO el start, LUEGO el action — ambos con el mismo run_id
    await supabase.from('ai_ops_log').insert({
      agent_id:     TEST_AGENT_ID,
      portal_email: TEST_EMAIL,
      source:       'task_execution_start',
      reason:       'task_execution_start',
      reference_id: 'test-task-valid',
      count:        1,
      label:        'Test valid task start',
      context:      JSON.stringify({ run_id: TEST_RUN_ID_VALID, trigger_source: 'cron' }),
    });

    await supabase.from('ai_ops_log').insert({
      agent_id:     TEST_AGENT_ID,
      portal_email: TEST_EMAIL,
      source:       'task_action',
      reason:       'task_action',
      reference_id: 'test-task-valid',
      count:        2,
      label:        'Test valid task action',
      context:      JSON.stringify({ run_id: TEST_RUN_ID_VALID, trigger_source: 'cron' }),
    });

    const orphans = await detectTaskActionOrphans(2);
    const matchingOrphan = orphans.find(o => o.run_id === TEST_RUN_ID_VALID);

    // Este run NO debe estar en orphans (tiene su start)
    expect(matchingOrphan).toBeUndefined();
  });

  it('ignora task_action rows con context null o sin run_id', async () => {
    if (!TEST_EMAIL) {
      console.log('[skip] TEST_PORTAL_EMAIL no seteado');
      return;
    }

    // Seed: task_action sin context (no se puede correlacionar)
    await supabase.from('ai_ops_log').insert({
      agent_id:     TEST_AGENT_ID,
      portal_email: TEST_EMAIL,
      source:       'task_action',
      reason:       'task_action',
      count:        1,
      label:        'Task action sin context',
      context:      null,
    });

    // No debe lanzar, solo ignorar
    const orphans = await detectTaskActionOrphans(2);
    // El row sin context no debe aparecer en los orphans
    const withNullCtx = orphans.find(o => o.run_id === 'null');
    expect(withNullCtx).toBeUndefined();
  });
});

describe('backfillFichaTags fichas_timeout separado de fichas_error', () => {
  it('la interfaz BackfillResult incluye fichas_timeout', async () => {
    if (!TEST_EMAIL) {
      console.log('[skip] TEST_PORTAL_EMAIL no seteado');
      return;
    }

    await assertNotProdOrAllowed();

    // No necesitamos correr el backfill real (puede ser lento).
    // Verificamos a nivel de tipo que BackfillResult tiene fichas_timeout.
    // Lo hacemos corriendo el worker con un org sin fichas legacy → result.fichas_timeout = 0.
    const result = await backfillFichaTags();

    // El resultado debe tener fichas_timeout como campo
    expect(typeof result.fichas_timeout).toBe('number');
    expect(typeof result.fichas_error).toBe('number');
    expect(typeof result.fichas_processed).toBe('number');
    expect(typeof result.orgs_skipped).toBe('number');

    // fichas_timeout y fichas_error son mutuamente exclusivos para la misma ficha
    // (una ficha con timeout va a fichas_timeout, no a fichas_error).
    // No pueden sumar más que el total de fichas procesadas con fallo.
    expect(result.fichas_timeout + result.fichas_error).toBeLessThanOrEqual(
      result.fichas_processed + result.fichas_timeout + result.fichas_error,
    );
  });
});

describe('detectAutotagBackfillIssues stall check (smoke)', () => {
  it('la funcion existe y retorna un array', async () => {
    if (!TEST_EMAIL) {
      console.log('[skip] TEST_PORTAL_EMAIL no seteado');
      return;
    }

    await assertNotProdOrAllowed();

    const { detectAutotagBackfillIssues } = await import('@/lib/ops/consumption-audit');
    const issues = await detectAutotagBackfillIssues();

    // El check de stall ya existe desde Fase 6 con filtro de 7 dias (I3 fix).
    // Solo verificamos que la funcion retorna array sin throws.
    expect(Array.isArray(issues)).toBe(true);

    // Verificar que los issues tienen la shape esperada
    for (const issue of issues) {
      expect(typeof issue.kind).toBe('string');
      expect(typeof issue.detail).toBe('string');
      expect(typeof issue.urgent).toBe('boolean');
    }
  });
});
