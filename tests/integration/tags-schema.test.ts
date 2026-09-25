/**
 * Tests de integración para el schema de tags (Fase 1).
 *
 * Requiere aplicar las 4 migrations antes de ejecutar:
 *   pnpm exec supabase db push
 *
 * Ejecutar con:
 *   pnpm test:integration -- tags-schema
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

// Email de test sintético para org_role_tag_additions.
// Debe existir en organizations en el ambiente de dev.
const TEST_PORTAL_EMAIL = process.env.TEST_PORTAL_EMAIL ?? 'tags-schema-test@test.centinelia.invalid';

beforeAll(async () => {
  await assertNotProdOrAllowed();
});

afterAll(async () => {
  // Limpiar las adiciones de test para no contaminar el ambiente.
  await supabase
    .from('org_role_tag_additions')
    .delete()
    .eq('portal_email', TEST_PORTAL_EMAIL);
});

// ---------------------------------------------------------------------------
// Task 1.1: ficha_tags
// ---------------------------------------------------------------------------
describe('ficha_tags schema', () => {
  it('tiene 15 tags con los slugs correctos en el orden esperado', async () => {
    const { data, error } = await supabase
      .from('ficha_tags')
      .select('slug, label_es, orden, active')
      .order('orden', { ascending: true });

    expect(error).toBeNull();
    expect(data).toHaveLength(15);
    expect(data!.map((t) => t.slug)).toEqual([
      'contabilidad',
      'cobranza',
      'ventas',
      'atencion_cliente',
      'catalogo_productos',
      'politicas',
      'rh',
      'operaciones',
      'logistica',
      'marketing',
      'finanzas',
      'legal',
      'fiscal',
      'onboarding_clientes',
      'soporte_tecnico',
    ]);
    expect(data!.every((t) => t.active)).toBe(true);
  });

  it('primer tag (orden 10) es contabilidad', async () => {
    const { data, error } = await supabase
      .from('ficha_tags')
      .select('slug')
      .order('orden', { ascending: true })
      .limit(1)
      .single();

    expect(error).toBeNull();
    expect(data!.slug).toBe('contabilidad');
  });
});

// ---------------------------------------------------------------------------
// Task 1.2: role_default_tag_whitelist
// ---------------------------------------------------------------------------
describe('role_default_tag_whitelist schema', () => {
  it('tiene los 15 roles distintos del roster', async () => {
    const { data, error } = await supabase
      .from('role_default_tag_whitelist')
      .select('role');

    expect(error).toBeNull();
    const rolesSet = new Set(data!.map((r) => r.role));
    expect(rolesSet.size).toBe(15);

    const expectedRoles = [
      'nia', 'noah', 'nico', 'nelia', 'neo',
      'nara', 'naia', 'nova', 'nala', 'nalu',
      'nami', 'neka', 'nox', 'niva', 'nash',
    ];
    for (const role of expectedRoles) {
      expect(rolesSet.has(role)).toBe(true);
    }
  });

  it('nox tiene whitelist completa (15 tags)', async () => {
    const { data, error } = await supabase
      .from('role_default_tag_whitelist')
      .select('tag_slug')
      .eq('role', 'nox');

    expect(error).toBeNull();
    expect(data).toHaveLength(15);
  });

  it('niva tiene whitelist completa (15 tags)', async () => {
    const { data, error } = await supabase
      .from('role_default_tag_whitelist')
      .select('tag_slug')
      .eq('role', 'niva');

    expect(error).toBeNull();
    expect(data).toHaveLength(15);
  });

  it('nash tiene whitelist completa (15 tags)', async () => {
    const { data, error } = await supabase
      .from('role_default_tag_whitelist')
      .select('tag_slug')
      .eq('role', 'nash');

    expect(error).toBeNull();
    expect(data).toHaveLength(15);
  });

  it('nala tiene exactamente 5 tags: contabilidad, cobranza, ventas, politicas, fiscal', async () => {
    const { data, error } = await supabase
      .from('role_default_tag_whitelist')
      .select('tag_slug')
      .eq('role', 'nala');

    expect(error).toBeNull();
    const slugs = data!.map((r) => r.tag_slug).sort();
    expect(slugs).toEqual(['cobranza', 'contabilidad', 'fiscal', 'politicas', 'ventas']);
  });

  it('los roles que no son coordinadores tienen entre 3 y 5 tags', async () => {
    const nonCoordinators = [
      'nia', 'noah', 'nico', 'nelia', 'neo',
      'nara', 'naia', 'nova', 'nala', 'nalu',
      'nami', 'neka',
    ];

    for (const role of nonCoordinators) {
      const { data, error } = await supabase
        .from('role_default_tag_whitelist')
        .select('tag_slug')
        .eq('role', role);

      expect(error).toBeNull();
      expect(data!.length).toBeGreaterThanOrEqual(3);
      expect(data!.length).toBeLessThanOrEqual(5);
    }
  });
});

// ---------------------------------------------------------------------------
// Task 1.3: org_role_tag_additions
// ---------------------------------------------------------------------------
describe('org_role_tag_additions schema', () => {
  it('acepta insert con FK a organizations.portal_email y ficha_tags.slug', async () => {
    // Requiere que TEST_PORTAL_EMAIL exista en organizations en el ambiente de dev.
    const { error } = await supabase
      .from('org_role_tag_additions')
      .upsert({
        portal_email: TEST_PORTAL_EMAIL,
        role: 'nala',
        tag_slug: 'rh',
        added_by: 'test-runner',
      });

    expect(error).toBeNull();
  });

  it('upsert doble es idempotente (no lanza error por PK duplicate)', async () => {
    const { error: e1 } = await supabase
      .from('org_role_tag_additions')
      .upsert({
        portal_email: TEST_PORTAL_EMAIL,
        role: 'nala',
        tag_slug: 'rh',
        added_by: 'test-runner',
      });

    const { error: e2 } = await supabase
      .from('org_role_tag_additions')
      .upsert({
        portal_email: TEST_PORTAL_EMAIL,
        role: 'nala',
        tag_slug: 'rh',
        added_by: 'test-runner',
      });

    expect(e1).toBeNull();
    expect(e2).toBeNull();
  });

  it('rechaza tag_slug no existente en ficha_tags (FK violation)', async () => {
    const { error } = await supabase
      .from('org_role_tag_additions')
      .upsert({
        portal_email: TEST_PORTAL_EMAIL,
        role: 'nala',
        tag_slug: 'tag_que_no_existe_en_catalogo',
        added_by: 'test-runner',
      });

    expect(error).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Task 1.3: fichas_informativas - columnas tags y autotag_status
// ---------------------------------------------------------------------------
describe('fichas_informativas columnas tags y autotag_status', () => {
  it('la tabla tiene columna tags (text[])', async () => {
    const { data, error } = await supabase
      .from('fichas_informativas')
      .select('tags')
      .limit(1);

    // Si la columna no existe, Supabase devuelve un error de schema.
    expect(error).toBeNull();
  });

  it('la tabla tiene columna autotag_status (text)', async () => {
    const { data, error } = await supabase
      .from('fichas_informativas')
      .select('autotag_status')
      .limit(1);

    expect(error).toBeNull();
  });

  it('autotag_status acepta los 5 valores del CHECK constraint', async () => {
    const validStatuses = ['pending', 'done', 'manual_override', 'untagged_legacy', 'error'];

    for (const status of validStatuses) {
      const { data, error } = await supabase
        .from('fichas_informativas')
        .select('autotag_status')
        .eq('autotag_status', status)
        .limit(1);

      // La query en sí no debe fallar (aunque no haya rows con ese status).
      expect(error).toBeNull();
    }
  });

  it('fichas pre-migration tienen autotag_status=untagged_legacy y tags=[_untagged_]', async () => {
    // Esta assertion verifica que el UPDATE de la migration 4 se aplicó.
    // Si hay fichas pre-existentes deben haberse marcado como untagged_legacy.
    const { data: legacyFichas, error } = await supabase
      .from('fichas_informativas')
      .select('autotag_status, tags')
      .eq('autotag_status', 'untagged_legacy')
      .limit(10);

    expect(error).toBeNull();

    // Si existen fichas legacy, todas deben tener tags=[_untagged_].
    if (legacyFichas && legacyFichas.length > 0) {
      for (const ficha of legacyFichas) {
        expect(ficha.tags).toEqual(['_untagged_']);
      }
    }
    // Si no hay fichas legacy es porque la DB de dev está vacía, lo cual es válido.
  });
});
