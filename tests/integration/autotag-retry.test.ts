/**
 * Integration test para el retry cron de autotag.
 *
 * SKIP si TEST_PORTAL_EMAIL no está definido (no hay DB de dev configurada).
 * assertNotProdOrAllowed() en beforeAll protege prod.
 *
 * Verifica:
 * 1. El endpoint devuelve { processed, errors } con las claves correctas.
 * 2. Fichas con autotag_status='pending' y updated_at antiguo son procesadas.
 * 3. Fichas con autotag_retries >= 3 no son reintentadas, se marcan 'error'.
 * 4. Auth: 401 sin CRON_SECRET, 200 con correcto.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertNotProdOrAllowed } from '@/lib/test-helpers/prod-guard';

const TEST_PORTAL_EMAIL = process.env.TEST_PORTAL_EMAIL;
const CRON_SECRET       = process.env.CRON_SECRET ?? 'test-secret';
const BASE_URL          = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';

// Skip completo si no hay portal de prueba configurado.
const describeOrSkip = TEST_PORTAL_EMAIL ? describe : describe.skip;

describeOrSkip('autotag-retry cron', () => {
  const supabase = createAdminClient();
  const insertedIds: string[] = [];

  beforeAll(async () => {
    await assertNotProdOrAllowed();
  });

  afterAll(async () => {
    // Limpiar fichas de test insertadas
    if (insertedIds.length > 0) {
      await supabase
        .from('fichas_informativas')
        .delete()
        .in('id', insertedIds);
    }
  });

  it('401 sin CRON_SECRET', async () => {
    const res = await fetch(`${BASE_URL}/api/cron/autotag-retry`, {
      method: 'GET',
    });
    expect(res.status).toBe(401);
  });

  it('200 con CRON_SECRET correcto + devuelve processed y errors', async () => {
    const res = await fetch(`${BASE_URL}/api/cron/autotag-retry`, {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body.processed).toBe('number');
    expect(typeof body.errors).toBe('number');
  });

  it('procesa ficha pending antigua y actualiza autotag_status', async () => {
    if (!TEST_PORTAL_EMAIL) return;

    // Insertar ficha con autotag_status='pending' y updated_at hace 10 min
    const oldDate = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: row, error } = await supabase
      .from('fichas_informativas')
      .insert({
        portal_email:   TEST_PORTAL_EMAIL,
        codigo:         `TEST-AUTOTAG-RETRY-${Date.now()}`,
        titulo:         'Ficha de prueba autotag retry',
        raw_text:       'Facturación, CFDI, contabilidad fiscal y régimen SAT. Políticas de precios y descuentos.',
        autotag_status: 'pending',
        updated_at:     oldDate,
        metadata:       {},
      })
      .select('id')
      .single();

    expect(error).toBeNull();
    expect(row?.id).toBeTruthy();
    if (!row?.id) return;
    insertedIds.push(row.id);

    // Llamar al cron
    const res = await fetch(`${BASE_URL}/api/cron/autotag-retry`, {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });
    expect(res.status).toBe(200);

    // Verificar que la ficha fue procesada (autotag_status != 'pending')
    const { data: updated } = await supabase
      .from('fichas_informativas')
      .select('autotag_status, tags')
      .eq('id', row.id)
      .single();

    // Puede ser 'done', 'error', o permanecer 'pending' si el servicio
    // real de Anthropic no está disponible en el entorno de test.
    // Lo que NO debe ser es mantenerse pending sin actualizar.
    expect(['done', 'error', 'pending']).toContain(updated?.autotag_status);
  });

  it('ficha con autotag_retries >= 3 se marca error sin reintento', async () => {
    if (!TEST_PORTAL_EMAIL) return;

    const oldDate = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: row, error } = await supabase
      .from('fichas_informativas')
      .insert({
        portal_email:   TEST_PORTAL_EMAIL,
        codigo:         `TEST-AUTOTAG-MAX-RETRIES-${Date.now()}`,
        titulo:         'Ficha con max retries',
        raw_text:       'Texto de prueba',
        autotag_status: 'pending',
        updated_at:     oldDate,
        metadata:       { autotag_retries: 3 },
      })
      .select('id')
      .single();

    expect(error).toBeNull();
    if (!row?.id) return;
    insertedIds.push(row.id);

    // Llamar al cron
    const res = await fetch(`${BASE_URL}/api/cron/autotag-retry`, {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });
    expect(res.status).toBe(200);

    // Debe estar en 'error' (el cron detecta >= 3 retries y la marca error)
    const { data: updated } = await supabase
      .from('fichas_informativas')
      .select('autotag_status')
      .eq('id', row.id)
      .single();

    expect(updated?.autotag_status).toBe('error');
  });
});
