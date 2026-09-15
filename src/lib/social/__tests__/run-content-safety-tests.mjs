/**
 * Standalone node:test runner para checkContentSafety.
 *
 * content-safety.ts es una funcion pura sin dependencias externas,
 * por lo que jiti puede cargarlo directamente.
 *
 * Uso desde la raiz del worktree:
 *
 *   node \
 *     --import "file:///C:/Users/Nazre/centinelia/node_modules/jiti/lib/jiti-native.mjs" \
 *     src/lib/social/__tests__/run-content-safety-tests.mjs
 *
 * Convencion estandar: centinelia y centinelia-navi estan al mismo nivel
 * (C:/Users/Nazre/). Sobreescribir con CENTINELA_ROOT env var si se necesita.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const worktreeRoot = path.resolve(__dirname, '..', '..', '..', '..');

// ─── Load checkContentSafety ──────────────────────────────────────────────────
// content-safety.ts tiene cero dependencias externas — jiti lo carga directo.

const require = createRequire(import.meta.url);

let checkContentSafety;
try {
  const mod = require(path.resolve(worktreeRoot, 'src', 'lib', 'social', 'content-safety.ts'));
  checkContentSafety = mod.checkContentSafety;
} catch (e) {
  console.error('');
  console.error('ERROR: Could not load content-safety.ts.');
  console.error('Run this test via jiti:');
  console.error('');
  console.error('  node --import "file:///C:/Users/Nazre/centinelia/node_modules/jiti/lib/jiti-native.mjs" \\');
  console.error('    src/lib/social/__tests__/run-content-safety-tests.mjs');
  console.error('');
  console.error('Original error:', e.message);
  process.exit(1);
}

// ─── Tests — denylist ─────────────────────────────────────────────────────────

describe('checkContentSafety — denylist', () => {
  test('flags a denylist word present in text', () => {
    const r = checkContentSafety('Esta fue una mala experiencia total', ['mala experiencia'], []);
    assert.equal(r.safe, false);
    assert.ok(r.violations.includes('denylist: mala experiencia'),
      `violations: ${JSON.stringify(r.violations)}`);
  });

  test('is case-insensitive for denylist words', () => {
    const r = checkContentSafety('SPAM de SPAM', ['spam'], []);
    assert.equal(r.safe, false);
    assert.equal(r.violations.length, 1);
  });

  test('flags multiple denylist words independently', () => {
    const r = checkContentSafety('spam y fraude y estafa', ['spam', 'fraude', 'estafa'], []);
    assert.equal(r.safe, false);
    assert.equal(r.violations.length, 3, `expected 3 violations, got: ${JSON.stringify(r.violations)}`);
  });

  test('passes clean text against a non-empty denylist', () => {
    const r = checkContentSafety('Excelente servicio hoy', ['spam', 'fraude'], []);
    assert.equal(r.safe, true);
    assert.equal(r.violations.length, 0);
  });

  test('passes any text against an empty denylist', () => {
    const r = checkContentSafety('spam fraude estafa', [], []);
    assert.equal(r.safe, true);
  });

  test('ignores empty strings in denylist', () => {
    const r = checkContentSafety('cualquier texto', ['', ''], []);
    assert.equal(r.safe, true);
  });
});

// ─── Tests — URL domain whitelist ─────────────────────────────────────────────

describe('checkContentSafety — URL domain whitelist', () => {
  test('flags URL with domain not in allowedDomains', () => {
    const r = checkContentSafety('visita http://competidor.com ahora', [], ['centinelia.mx']);
    assert.equal(r.safe, false);
    assert.ok(r.violations.includes('domain not whitelisted: competidor.com'),
      `violations: ${JSON.stringify(r.violations)}`);
  });

  test('allows URL whose domain is in allowedDomains', () => {
    const r = checkContentSafety('visita https://centinelia.mx/oferta', [], ['centinelia.mx']);
    assert.equal(r.safe, true);
    assert.equal(r.violations.length, 0);
  });

  test('allows subdomain of a whitelisted domain', () => {
    const r = checkContentSafety('ver https://portal.centinelia.mx/login', [], ['centinelia.mx']);
    assert.equal(r.safe, true);
  });

  test('strips www before matching', () => {
    const r = checkContentSafety('ver https://www.centinelia.mx/home', [], ['centinelia.mx']);
    assert.equal(r.safe, true);
  });

  test('allows any URL when allowedDomains is empty (no restriction)', () => {
    const r = checkContentSafety('visita https://cualquier.com', [], []);
    assert.equal(r.safe, true);
  });

  test('flags URL with invalid syntax', () => {
    const r = checkContentSafety('ir a http://::not-a-url/path ahora', [], []);
    assert.equal(r.safe, false);
    assert.ok(r.violations.length > 0 && r.violations[0].startsWith('invalid URL:'),
      `expected invalid URL violation, got: ${JSON.stringify(r.violations)}`);
  });

  test('strips trailing punctuation before URL parse (period after URL)', () => {
    const r = checkContentSafety('visita https://centinelia.mx.', [], ['centinelia.mx']);
    assert.equal(r.safe, true, `violations: ${JSON.stringify(r.violations)}`);
  });

  test('flags URL not in whitelist even if another allowed URL is present', () => {
    const r = checkContentSafety(
      'bueno https://centinelia.mx y malo https://spam.io',
      [],
      ['centinelia.mx'],
    );
    assert.equal(r.safe, false);
    assert.ok(r.violations.includes('domain not whitelisted: spam.io'),
      `violations: ${JSON.stringify(r.violations)}`);
    const hasAllowed = r.violations.some(v => v.includes('centinelia.mx'));
    assert.equal(hasAllowed, false, 'centinelia.mx should not appear in violations');
  });

  test('HTTP URL is parsed correctly (not just HTTPS)', () => {
    const r = checkContentSafety('ver http://centinelia.mx/page', [], ['centinelia.mx']);
    assert.equal(r.safe, true);
  });

  test('multiple disallowed URLs generates one violation per domain', () => {
    const r = checkContentSafety(
      'a https://evil1.com b https://evil2.com',
      [],
      ['centinelia.mx'],
    );
    assert.equal(r.violations.length, 2, `expected 2 violations, got: ${JSON.stringify(r.violations)}`);
  });
});

// ─── Tests — @mention whitelist (optional) ────────────────────────────────────

describe('checkContentSafety — @mention whitelist (optional)', () => {
  test('does not flag mentions when mentionWhitelist is undefined', () => {
    const r = checkContentSafety('hola @unauthorized_handle', [], []);
    assert.equal(r.safe, true);
  });

  test('flags mention not in whitelist when mentionWhitelist is provided', () => {
    const r = checkContentSafety('hola @spammer', [], [], ['centinelia']);
    assert.equal(r.safe, false);
    assert.ok(r.violations.includes('unauthorized mention: @spammer'),
      `violations: ${JSON.stringify(r.violations)}`);
  });

  test('allows whitelisted mention', () => {
    const r = checkContentSafety('hola @centinelia', [], [], ['centinelia']);
    assert.equal(r.safe, true);
  });

  test('is case-insensitive for mention whitelist', () => {
    const r = checkContentSafety('hola @Centinelia', [], [], ['centinelia']);
    assert.equal(r.safe, true);
  });
});

// ─── Tests — combined violations ──────────────────────────────────────────────

describe('checkContentSafety — combined violations', () => {
  test('returns all violations when denylist, URL, and mention checks all fail', () => {
    const r = checkContentSafety(
      'spam aqui https://evil.com y @spammer',
      ['spam'],
      ['centinelia.mx'],
      ['centinelia'],
    );
    assert.equal(r.safe, false);
    assert.equal(r.violations.length, 3, `violations: ${JSON.stringify(r.violations)}`);
    assert.ok(r.violations.some(v => v.startsWith('denylist:')));
    assert.ok(r.violations.some(v => v.startsWith('domain not whitelisted:')));
    assert.ok(r.violations.some(v => v.startsWith('unauthorized mention:')));
  });

  test('returns safe=true and empty violations for perfectly clean text', () => {
    const r = checkContentSafety(
      'Gracias por elegirnos. Visita https://centinelia.mx y saluda a @centinelia.',
      ['spam', 'fraude'],
      ['centinelia.mx'],
      ['centinelia'],
    );
    assert.equal(r.safe, true, `violations: ${JSON.stringify(r.violations)}`);
    assert.equal(r.violations.length, 0);
  });

  test('text with no URLs and no mentions passes with non-empty denylist (no false positives)', () => {
    const r = checkContentSafety(
      'Excelente producto, muy recomendado.',
      ['spam'],
      ['centinelia.mx'],
      ['centinelia'],
    );
    assert.equal(r.safe, true);
  });
});
