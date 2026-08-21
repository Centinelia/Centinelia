/**
 * round-trip.test.ts — Vitest test suite para el harness de round-trip XML CONTPAQi.
 *
 * Dos tipos de test:
 *
 *   1. Dummy fixture (siempre corre) — datos genericos sin RFC real, vive en el repo.
 *      Si este falla, algo se rompio en buildImportXml o en el harness.
 *
 *   2. Real fixtures (se skipean si no existen) — CFDIs reales de Beatriz.
 *      Cuando los XMLs lleguen, copiarlos a fixtures/round-trip/<caso>.contpaqi.xml
 *      y crear <caso>.input.json con los datos del adapter. Este test los detecta
 *      automaticamente.
 *
 * Correr: npm test round-trip
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { runRoundTrip, formatDiffReport } from './round-trip.harness';

const fixtureDir = path.join(__dirname, 'fixtures', 'round-trip');

// ---------------------------------------------------------------------------
// Helper: find all real fixture pairs in the fixture dir.
// A "real" fixture pair is <name>.contpaqi.xml + <name>.input.json where
// <name> !== 'dummy' (dummy is handled separately with always-pass semantics).
// ---------------------------------------------------------------------------

function findRealFixtures(): Array<{ name: string; xmlPath: string; inputPath: string }> {
  if (!fs.existsSync(fixtureDir)) return [];

  return fs
    .readdirSync(fixtureDir)
    .filter((f) => f.endsWith('.contpaqi.xml') && !f.startsWith('dummy'))
    .map((f) => {
      const name = f.replace('.contpaqi.xml', '');
      return {
        name,
        xmlPath: path.join(fixtureDir, f),
        inputPath: path.join(fixtureDir, `${name}.input.json`),
      };
    })
    .filter((pair) => fs.existsSync(pair.inputPath));
}

// ---------------------------------------------------------------------------
// 1. Dummy fixture — always runs (baseline, no real client data)
// ---------------------------------------------------------------------------

describe('round-trip XML harness — dummy fixture (baseline)', () => {
  const dummyXml = path.join(fixtureDir, 'dummy.contpaqi.xml');
  const dummyInput = path.join(fixtureDir, 'dummy.input.json');

  it('dummy fixture files exist in the repo', () => {
    expect(fs.existsSync(dummyXml), `dummy.contpaqi.xml not found at ${dummyXml}`).toBe(true);
    expect(fs.existsSync(dummyInput), `dummy.input.json not found at ${dummyInput}`).toBe(true);
  });

  it('dummy round-trip passes with no diffs', () => {
    const report = runRoundTrip(dummyXml, dummyInput);
    if (!report.passed) {
      // Print the full diff report for debugging before failing
      console.error(formatDiffReport(report));
    }
    expect(report.passed, report.summary).toBe(true);
    expect(report.diffs).toHaveLength(0);
  });

  it('DiffReport has fixture name "dummy"', () => {
    const report = runRoundTrip(dummyXml, dummyInput);
    expect(report.fixture).toBe('dummy');
  });

  it('ignoredFields includes timbrado-only fields', () => {
    const report = runRoundTrip(dummyXml, dummyInput);
    expect(report.ignoredFields).toContain('UUID');
    expect(report.ignoredFields).toContain('Sello');
    expect(report.ignoredFields).toContain('FechaTimbrado');
    expect(report.ignoredFields).toContain('NoCertificadoSAT');
  });
});

// ---------------------------------------------------------------------------
// 2. Real fixtures — skip if not present yet (waiting for Beatriz's CFDIs)
// ---------------------------------------------------------------------------

describe('round-trip XML harness — real client fixtures', () => {
  const realFixtures = findRealFixtures();

  if (realFixtures.length === 0) {
    it.skip(
      'No real fixtures found — add <caso>.contpaqi.xml + <caso>.input.json to fixtures/round-trip/ (see README.md)',
      () => {
        // This test is skipped until real CFDIs from Beatriz are added.
        // To add a fixture: see src/lib/billing/contpaqi/__tests__/fixtures/round-trip/README.md
      },
    );
  }

  for (const fixture of realFixtures) {
    it(`${fixture.name} — round-trip passes with no diffs`, () => {
      const report = runRoundTrip(fixture.xmlPath, fixture.inputPath);
      if (!report.passed) {
        console.error(formatDiffReport(report));
      }
      expect(report.passed, report.summary).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// 3. formatDiffReport unit test (no fixture files needed)
// ---------------------------------------------------------------------------

describe('formatDiffReport', () => {
  it('passed report contains fixture name and no DIFFS section', () => {
    const report = {
      fixture: 'test-case',
      passed: true,
      diffs: [],
      ignoredFields: ['UUID', 'Sello'],
      summary: 'PASS — test-case: all fields match',
    };
    const formatted = formatDiffReport(report);
    expect(formatted).toContain('test-case');
    expect(formatted).toContain('PASS');
    expect(formatted).not.toContain('MISMATCH');
    expect(formatted).toContain('UUID');
  });

  it('failed report lists each diff with field name, our value, their value', () => {
    const report = {
      fixture: 'test-case',
      passed: false,
      diffs: [
        {
          field: 'Encabezado.FormaPago',
          ourValue: '03',
          theirValue: '01',
          status: 'mismatch' as const,
        },
        {
          field: 'Encabezado.Total',
          ourValue: null,
          theirValue: '500.00',
          status: 'missing_in_ours' as const,
        },
      ],
      ignoredFields: ['UUID'],
      summary: 'FAIL — test-case: 2 diff(s) found',
    };
    const formatted = formatDiffReport(report);
    expect(formatted).toContain('MISMATCH');
    expect(formatted).toContain('Encabezado.FormaPago');
    expect(formatted).toContain('03');
    expect(formatted).toContain('01');
    expect(formatted).toContain('MISSING IN OURS');
    expect(formatted).toContain('500.00');
  });
});
