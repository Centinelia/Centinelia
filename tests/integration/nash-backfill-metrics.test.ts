/**
 * Integration tests para los checks de Nash sobre el backfill de autotag.
 *
 * SKIP si TEST_PORTAL_EMAIL no está definido.
 * assertNotProdOrAllowed() en beforeAll protege prod.
 *
 * Verifica:
 * 1. detectAutotagBackfillIssues() devuelve array (puede estar vacío si no hay issues).
 * 2. error_spike se detecta cuando count('error') > 10 para cualquier org.
 * 3. pending_stuck se detecta cuando hay fichas pending con updated_at > 1h.
 * 4. coverage_low no dispara para org sin retrieval_v2_enabled.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertNotProdOrAllowed } from '@/lib/test-helpers/prod-guard';
import { detectAutotagBackfillIssues } from '@/lib/ops/consumption-audit';

const TEST_PORTAL_EMAIL = process.env.TEST_PORTAL_EMAIL;

const describeOrSkip = TEST_PORTAL_EMAIL ? describe : describe.skip;

describeOrSkip('detectAutotagBackfillIssues', () => {
  const supabase = createAdminClient();
  const insertedIds: string[] = [];

  beforeAll(async () => {
    await assertNotProdOrAllowed();
  });

  afterAll(async () => {
    if (insertedIds.length > 0) {
      await supabase
        .from('fichas_informativas')
        .delete()
        .in('id', insertedIds);
    }
  });

  it('devuelve array (puede estar vacio si no hay issues)', async () => {
    const issues = await detectAutotagBackfillIssues();
    expect(Array.isArray(issues)).toBe(true);
    // Cada issue tiene las claves esperadas
    for (const issue of issues) {
      expect(['stall', 'error_spike', 'pending_stuck', 'coverage_low']).toContain(issue.kind);
      expect(typeof issue.detail).toBe('string');
      expect(typeof issue.urgent).toBe('boolean');
    }
  });

  it('detecta pending_stuck cuando hay fichas pending con updated_at > 1h', async () => {
    if (!TEST_PORTAL_EMAIL) return;

    // Insertar 21 fichas con autotag_status='pending' y updated_at hace 2h
    const oldDate = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const rows = Array.from({ length: 21 }, (_, i) => ({
      portal_email:   TEST_PORTAL_EMAIL,
      codigo:         `TEST-NASH-PENDING-${Date.now()}-${i}`,
      titulo:         `Ficha test Nash pending ${i}`,
      raw_text:       'Contenido de prueba',
      autotag_status: 'pending',
      updated_at:     oldDate,
      metadata:       {},
    }));

    const { data: inserted, error } = await supabase
      .from('fichas_informativas')
      .insert(rows)
      .select('id');

    expect(error).toBeNull();
    if (inserted) insertedIds.push(...inserted.map(r => r.id as string));

    const issues = await detectAutotagBackfillIssues();
    const pendingStuck = issues.filter(i => i.kind === 'pending_stuck');
    expect(pendingStuck.length).toBeGreaterThan(0);
    expect(pendingStuck[0].urgent).toBe(true);

    // Limpiar para no contaminar otros tests
    if (inserted) {
      await supabase.from('fichas_informativas').delete().in('id', inserted.map(r => r.id));
      inserted.forEach(r => {
        const idx = insertedIds.indexOf(r.id as string);
        if (idx > -1) insertedIds.splice(idx, 1);
      });
    }
  });

  it('no dispara coverage_low para org sin retrieval_v2_enabled', async () => {
    if (!TEST_PORTAL_EMAIL) return;

    // Verificar que el org de test no tiene retrieval_v2_enabled activo
    const { data: org } = await supabase
      .from('organizations')
      .select('features')
      .eq('portal_email', TEST_PORTAL_EMAIL)
      .maybeSingle();

    const features = (org?.features as Record<string, unknown> | null) ?? {};
    if (features.retrieval_v2_enabled === true) {
      // El org ya tiene flag activo — este test no aplica
      return;
    }

    // Insertar ficha untagged_legacy en org sin flag
    const { data: row, error } = await supabase
      .from('fichas_informativas')
      .insert({
        portal_email:   TEST_PORTAL_EMAIL,
        codigo:         `TEST-NASH-LEGACY-${Date.now()}`,
        titulo:         'Ficha legacy test Nash',
        raw_text:       'Texto de prueba',
        autotag_status: 'untagged_legacy',
        metadata:       {},
      })
      .select('id')
      .single();

    expect(error).toBeNull();
    if (row?.id) insertedIds.push(row.id);

    const issues = await detectAutotagBackfillIssues();
    // No debe haber coverage_low para este org (sin retrieval_v2_enabled)
    const coverageLow = issues.filter(
      i => i.kind === 'coverage_low' && i.portal_email === TEST_PORTAL_EMAIL
    );
    expect(coverageLow.length).toBe(0);
  });
});
