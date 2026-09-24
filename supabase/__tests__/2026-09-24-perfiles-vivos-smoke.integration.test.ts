/**
 * Smoke integration test — pack perfiles_vivos E2E contra Supabase real.
 *
 * Corre después de aplicar migración 20260924120000_perfiles_vivos.sql.
 * Valida:
 *   1. Import CSV → filas en contactos_vivos con datos_operacionales coerced
 *   2. Auto-activación del feature perfiles_vivos en organizations.features
 *   3. Lookup por external_id, teléfono suffix-10 y nombre fuzzy
 *   4. registrarInteraccion → trigger denormaliza counters en contactos_vivos
 *
 * Guard: assertNotProdOrAllowed() previene ejecución accidental contra prod.
 * Mock: consumeAiOp para no tocar ops_ledger real (el import lo llama con agentId).
 *
 * Uso:
 *   npm run test:integration -- 2026-09-24-perfiles-vivos-smoke
 * Contra prod (a propósito):
 *   ALLOW_SMOKE_ON_PROD_DB=1 npm run test:integration -- 2026-09-24-perfiles-vivos-smoke
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { assertNotProdOrAllowed } from './_helpers/assert-not-prod';

// Mock consumeAiOp — el import.ts lo llama al final para cobrar pool. No queremos
// escribir en ops_ledger real desde un smoke; solo validamos que la lógica de
// import + upsert + auto-activación funciona contra DB.
vi.mock('@/lib/ai/ops-guard', () => ({
  consumeAiOp: vi.fn(async () => ({ ok: true, used: 0, limit: 0 })),
}));

import { createAdminClient } from '@/lib/supabase/admin';
import { importCarteraContactos } from '@/lib/perfiles-vivos/import';
import { lookupContacto, registrarInteraccion } from '@/lib/perfiles-vivos/lookup';

const sb = createAdminClient();
const TS = Date.now();
const PORTAL = `nazre20+pv-smoke-${TS}@gmail.com`;
const TOKEN  = `pv-smoke-${TS}`;

let agentId: string;

beforeAll(async () => {
  assertNotProdOrAllowed();

  const org = await sb.from('organizations').insert({
    portal_email: PORTAL,
    name:         'Smoke PerfilesVivos',
    portal_token: TOKEN,
    features:     {},
  }).select('portal_email').single();
  if (org.error) throw new Error(`Org insert: ${org.error.message}`);

  const ag = await sb.from('voice_agents').insert({
    portal_email:  PORTAL,
    role:          'nia',
    agent_name:    'Smoke Nia',
    client_name:   'Smoke Client',
    business_name: 'Smoke Business',
    plan:          'pro',
  }).select('id').single();
  if (ag.error) throw new Error(`Agent insert: ${ag.error.message}`);
  agentId = ag.data!.id as string;
}, 30_000);

afterAll(async () => {
  await sb.from('organizations').delete().eq('portal_email', PORTAL);
}, 30_000);

describe('perfiles_vivos smoke E2E', () => {
  it('import CSV → upsert contactos, auto-activa feature, lookups y registra interacción con trigger denorm', async () => {
    const csv =
      'ID,NOMBRE,TEL,MONTO\n' +
      'A001,Juan Pérez García,8112345678,5000\n' +
      'A002,María López,8199887766,12500';

    const result = await importCarteraContactos(Buffer.from(csv, 'utf8'), {
      portalEmail:   PORTAL,
      filename:      'smoke.csv',
      columnMapping: {
        external_id: 'ID',
        nombre:      'NOMBRE',
        telefono:    'TEL',
        datos_operacionales: { monto_adeudado: 'MONTO' },
      },
      agentId,
    });

    expect(result.total_rows_leidas).toBe(2);
    expect(result.contactos_creados).toBe(2);
    expect(result.rows_saltadas).toBe(0);
    expect(result.auto_activated).toBe(true);

    // 1) Filas insertadas con normalización + coerción
    const { data: rows, error: rowsErr } = await sb
      .from('contactos_vivos')
      .select('id, external_id, nombre, telefono, datos_operacionales')
      .eq('portal_email', PORTAL)
      .order('external_id', { ascending: true });
    expect(rowsErr).toBeNull();
    expect(rows).toHaveLength(2);
    expect(rows![0].external_id).toBe('A001');
    expect(rows![0].nombre).toBe('Juan Pérez García');
    expect(rows![0].telefono).toBe('8112345678');
    expect((rows![0].datos_operacionales as Record<string, unknown>).monto_adeudado).toBe(5000);

    // 2) Auto-activación en organizations.features
    const { data: org } = await sb
      .from('organizations')
      .select('features')
      .eq('portal_email', PORTAL)
      .single();
    expect((org?.features as Record<string, unknown>)?.perfiles_vivos).toBe(true);

    // 3a) Lookup por external_id
    const lookupExt = await lookupContacto(PORTAL, { external_id: 'A001' });
    expect(lookupExt.matched_by).toBe('external_id');
    expect(lookupExt.contacto?.external_id).toBe('A001');

    // 3b) Lookup por teléfono con formato distinto (mismo suffix-10)
    const lookupPhone = await lookupContacto(PORTAL, { telefono: '+52 811 234 5678' });
    expect(lookupPhone.matched_by).toBe('telefono');
    expect(lookupPhone.contacto?.external_id).toBe('A001');

    // 3c) Lookup fuzzy por nombre parcial
    const lookupNombre = await lookupContacto(PORTAL, { nombre: 'María' });
    expect(lookupNombre.matched_by).toBe('nombre');
    expect(lookupNombre.contacto?.external_id).toBe('A002');

    // 3d) Lookup que no existe
    const lookupMiss = await lookupContacto(PORTAL, { external_id: 'NO_EXISTE' });
    expect(lookupMiss.matched_by).toBeNull();
    expect(lookupMiss.contacto).toBeNull();

    // 4) registrarInteraccion → trigger denormaliza counters
    const contactoA1 = rows!.find((r) => r.external_id === 'A001')!;
    await registrarInteraccion({
      portalEmail:    PORTAL,
      contactoId:     contactoA1.id as string,
      tipo:           'llamada',
      resumen:        'Ciudadano solicita convenio de pago',
      sentimiento:    'positivo',
      promesa_monto:  2500,
      promesa_fecha:  '2026-10-01',
      duracion_seg:   180,
    });

    const { data: after } = await sb
      .from('contactos_vivos')
      .select('total_interacciones, promesas_hechas, sentimiento_ultimo, ultima_interaccion_tipo, ultima_interaccion_at')
      .eq('id', contactoA1.id as string)
      .single();
    expect(after?.total_interacciones).toBe(1);
    expect(after?.promesas_hechas).toBe(1);
    expect(after?.sentimiento_ultimo).toBe('positivo');
    expect(after?.ultima_interaccion_tipo).toBe('llamada');
    expect(after?.ultima_interaccion_at).not.toBeNull();

    // 4b) Segunda interacción sin promesa — total sube, promesas_hechas queda
    await registrarInteraccion({
      portalEmail: PORTAL,
      contactoId:  contactoA1.id as string,
      tipo:        'correo',
      resumen:     'Envío de acuse',
    });
    const { data: after2 } = await sb
      .from('contactos_vivos')
      .select('total_interacciones, promesas_hechas, ultima_interaccion_tipo')
      .eq('id', contactoA1.id as string)
      .single();
    expect(after2?.total_interacciones).toBe(2);
    expect(after2?.promesas_hechas).toBe(1);
    expect(after2?.ultima_interaccion_tipo).toBe('correo');
  }, 60_000);
});
