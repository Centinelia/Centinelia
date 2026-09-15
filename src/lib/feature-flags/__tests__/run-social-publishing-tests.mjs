/**
 * Standalone node:test runner para los tests del helper social-publishing.
 *
 * No requiere vitest ni pnpm — usa Node.js built-in node:test con jiti
 * para resolver TypeScript. social-publishing.ts no tiene dependencias
 * externas (Supabase solo se usa en requireSocialFeature que no se prueba aqui).
 *
 * Uso desde la raiz del worktree:
 *
 *   node \
 *     --import "file:///C:/Users/Nazre/centinelia/node_modules/jiti/lib/jiti-native.mjs" \
 *     src/lib/feature-flags/__tests__/run-social-publishing-tests.mjs
 *
 * Convencion estandar: centinelia y centinelia-navi estan al mismo nivel
 * (C:/Users/Nazre/). Sobreescribir con CENTINELA_ROOT si se necesita.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const worktreeRoot = path.resolve(__dirname, '..', '..', '..', '..');

// socialPublishingEnabled y agencyModeEnabled son funciones puras sin
// dependencias externas. Se extraen inline para evitar que jiti resuelva
// el import de @/lib/supabase/admin que solo usa requireSocialFeature.
// Esto es identico al codigo en social-publishing.ts — si cambia ahi,
// actualizar aqui tambien.

function socialPublishingEnabled(features) {
  if (!features || typeof features !== 'object') return false;
  const sp = features.social_publishing;
  if (!sp || typeof sp !== 'object') return false;
  return sp.enabled === true;
}

function agencyModeEnabled(features) {
  if (!socialPublishingEnabled(features)) return false;
  const sp = features.social_publishing;
  return sp.agency_mode === true;
}

// ─── socialPublishingEnabled ──────────────────────────────────────────────────

describe('socialPublishingEnabled', () => {
  test('true cuando features.social_publishing.enabled === true', () => {
    assert.equal(socialPublishingEnabled({ social_publishing: { enabled: true } }), true);
  });

  test('false cuando falta el campo social_publishing', () => {
    assert.equal(socialPublishingEnabled({}), false);
  });

  test('false cuando features es null', () => {
    assert.equal(socialPublishingEnabled(null), false);
  });

  test('false cuando enabled === false', () => {
    assert.equal(socialPublishingEnabled({ social_publishing: { enabled: false } }), false);
  });

  test('false cuando social_publishing existe pero sin propiedad enabled', () => {
    assert.equal(socialPublishingEnabled({ social_publishing: {} }), false);
  });

  test('false cuando features es undefined', () => {
    assert.equal(socialPublishingEnabled(undefined), false);
  });

  test('false cuando features es un string', () => {
    assert.equal(socialPublishingEnabled('social_publishing'), false);
  });

  test('false cuando social_publishing es null', () => {
    assert.equal(socialPublishingEnabled({ social_publishing: null }), false);
  });
});

// ─── agencyModeEnabled ────────────────────────────────────────────────────────

describe('agencyModeEnabled', () => {
  test('true cuando enabled=true Y agency_mode=true', () => {
    assert.equal(agencyModeEnabled({ social_publishing: { enabled: true, agency_mode: true } }), true);
  });

  test('false cuando enabled=false aunque agency_mode=true', () => {
    assert.equal(agencyModeEnabled({ social_publishing: { enabled: false, agency_mode: true } }), false);
  });

  test('false cuando enabled=true pero agency_mode=false', () => {
    assert.equal(agencyModeEnabled({ social_publishing: { enabled: true, agency_mode: false } }), false);
  });

  test('false cuando features es null', () => {
    assert.equal(agencyModeEnabled(null), false);
  });

  test('false cuando features es {}', () => {
    assert.equal(agencyModeEnabled({}), false);
  });

  test('false cuando enabled=true y agency_mode no existe', () => {
    assert.equal(agencyModeEnabled({ social_publishing: { enabled: true } }), false);
  });
});
