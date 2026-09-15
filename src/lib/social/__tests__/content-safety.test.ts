/**
 * Unit tests for checkContentSafety.
 *
 * Pure function — no mocks needed.
 */
import { describe, it, expect } from 'vitest';
import { checkContentSafety } from '../content-safety';

describe('checkContentSafety — denylist', () => {
  it('flags a denylist word present in text', () => {
    const r = checkContentSafety('Esta fue una mala experiencia total', ['mala experiencia'], []);
    expect(r.safe).toBe(false);
    expect(r.violations).toContain('denylist: mala experiencia');
  });

  it('is case-insensitive for denylist words', () => {
    const r = checkContentSafety('SPAM de SPAM', ['spam'], []);
    expect(r.safe).toBe(false);
    expect(r.violations).toHaveLength(1);
  });

  it('flags multiple denylist words independently', () => {
    const r = checkContentSafety('spam y fraude y estafa', ['spam', 'fraude', 'estafa'], []);
    expect(r.safe).toBe(false);
    expect(r.violations).toHaveLength(3);
  });

  it('passes clean text against a non-empty denylist', () => {
    const r = checkContentSafety('Excelente servicio hoy', ['spam', 'fraude'], []);
    expect(r.safe).toBe(true);
    expect(r.violations).toHaveLength(0);
  });

  it('passes any text against an empty denylist', () => {
    const r = checkContentSafety('spam fraude estafa', [], []);
    expect(r.safe).toBe(true);
  });

  it('ignores empty strings in denylist', () => {
    const r = checkContentSafety('cualquier texto', ['', '  '.trim()], []);
    expect(r.safe).toBe(true);
  });
});

describe('checkContentSafety — URL domain whitelist', () => {
  it('flags URL with domain not in allowedDomains', () => {
    const r = checkContentSafety('visita http://competidor.com ahora', [], ['centinelia.mx']);
    expect(r.safe).toBe(false);
    expect(r.violations).toContain('domain not whitelisted: competidor.com');
  });

  it('allows URL whose domain is in allowedDomains', () => {
    const r = checkContentSafety('visita https://centinelia.mx/oferta', [], ['centinelia.mx']);
    expect(r.safe).toBe(true);
  });

  it('allows subdomain of a whitelisted domain', () => {
    const r = checkContentSafety('ver https://portal.centinelia.mx/login', [], ['centinelia.mx']);
    expect(r.safe).toBe(true);
  });

  it('strips www before matching', () => {
    const r = checkContentSafety('ver https://www.centinelia.mx/home', [], ['centinelia.mx']);
    expect(r.safe).toBe(true);
  });

  it('allows any URL when allowedDomains is empty (no restriction)', () => {
    const r = checkContentSafety('visita https://cualquier.com', [], []);
    expect(r.safe).toBe(true);
  });

  it('flags URL with invalid syntax', () => {
    const r = checkContentSafety('ir a http://::not-a-url/path ahora', [], []);
    expect(r.safe).toBe(false);
    expect(r.violations[0]).toMatch(/^invalid URL:/);
  });

  it('strips trailing punctuation before URL parse', () => {
    // Period after URL should not cause an invalid-URL violation
    const r = checkContentSafety('visita https://centinelia.mx.', [], ['centinelia.mx']);
    expect(r.safe).toBe(true);
  });

  it('flags URL not in whitelist even if text also has an allowed URL', () => {
    const r = checkContentSafety(
      'bueno https://centinelia.mx y malo https://spam.io',
      [],
      ['centinelia.mx'],
    );
    expect(r.safe).toBe(false);
    expect(r.violations).toContain('domain not whitelisted: spam.io');
    expect(r.violations.some((v) => v.includes('centinelia.mx'))).toBe(false);
  });
});

describe('checkContentSafety — @mention whitelist (optional)', () => {
  it('does not flag mentions when mentionWhitelist is undefined', () => {
    const r = checkContentSafety('hola @unauthorized_handle', [], []);
    expect(r.safe).toBe(true);
  });

  it('flags mention not in whitelist when mentionWhitelist is provided', () => {
    const r = checkContentSafety('hola @spammer', [], [], ['centinelia']);
    expect(r.safe).toBe(false);
    expect(r.violations).toContain('unauthorized mention: @spammer');
  });

  it('allows whitelisted mention', () => {
    const r = checkContentSafety('hola @centinelia', [], [], ['centinelia']);
    expect(r.safe).toBe(true);
  });

  it('is case-insensitive for mention whitelist', () => {
    const r = checkContentSafety('hola @Centinelia', [], [], ['centinelia']);
    expect(r.safe).toBe(true);
  });
});

describe('checkContentSafety — combined violations', () => {
  it('returns all violations when denylist, URL, and mention checks all fail', () => {
    const r = checkContentSafety(
      'spam aquí https://evil.com y @spammer',
      ['spam'],
      ['centinelia.mx'],
      ['centinelia'],
    );
    expect(r.safe).toBe(false);
    expect(r.violations.length).toBe(3);
    expect(r.violations.some((v) => v.startsWith('denylist:'))).toBe(true);
    expect(r.violations.some((v) => v.startsWith('domain not whitelisted:'))).toBe(true);
    expect(r.violations.some((v) => v.startsWith('unauthorized mention:'))).toBe(true);
  });

  it('returns safe=true and empty violations for perfectly clean text', () => {
    const r = checkContentSafety(
      'Gracias por elegirnos. Visita https://centinelia.mx y saluda a @centinelia.',
      ['spam', 'fraude'],
      ['centinelia.mx'],
      ['centinelia'],
    );
    expect(r.safe).toBe(true);
    expect(r.violations).toHaveLength(0);
  });
});
