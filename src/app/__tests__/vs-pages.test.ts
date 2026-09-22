import { describe, it, expect } from 'vitest';
import { COMPARISONS, BLAND_AI, RETELL_AI, VAPI } from '@/lib/vs/data';

describe('/vs data (source of truth para páginas de comparación)', () => {
  it('registra los 3 competidores esperados', () => {
    const slugs = COMPARISONS.map(c => c.slug).sort();
    expect(slugs).toEqual(['bland-ai', 'retell-ai', 'vapi']);
  });

  it.each(COMPARISONS)('la data de $competitor está completa', c => {
    expect(c.slug).toMatch(/^[a-z0-9-]+$/);
    expect(c.competitor).toBeTruthy();
    expect(c.competitorUrl).toMatch(/^https:\/\//);
    expect(c.origin).toBeTruthy();
    expect(c.tagline.length).toBeGreaterThan(20);
    expect(c.intro.length).toBeGreaterThan(100);
    expect(c.matrix.length).toBeGreaterThanOrEqual(5);
    expect(c.whyCentinelia.length).toBeGreaterThanOrEqual(3);
    expect(c.whyCompetitor.length).toBeGreaterThanOrEqual(2);
    expect(c.faq.length).toBeGreaterThanOrEqual(3);
  });

  it.each(COMPARISONS)('$competitor: matriz sin filas duplicadas', c => {
    const aspectos = c.matrix.map(r => r.aspect);
    expect(new Set(aspectos).size).toBe(aspectos.length);
  });

  it.each(COMPARISONS)('$competitor: matriz sin celdas vacías', c => {
    for (const row of c.matrix) {
      expect(row.centinelia.trim()).not.toBe('');
      expect(row.competitor.trim()).not.toBe('');
    }
  });

  it('ninguna data usa em-dash (regla de copy)', () => {
    for (const c of COMPARISONS) {
      const dump = JSON.stringify(c);
      expect(dump.includes('—'), `${c.competitor} contiene em-dash`).toBe(false);
    }
  });

  it('ninguna data usa el término obsoleto "agente de voz" en tagline o intro (usar "empleado digital")', () => {
    for (const c of COMPARISONS) {
      // Los taglines y intros deben posicionar producto como empleado digital, no
      // agente de voz. La matrix comparativa sí puede mencionar "agentes" para
      // referirse al producto del competidor porque así se llaman ellos.
      const combined = `${c.tagline}\n${c.intro}`;
      expect(combined, `${c.competitor}: tagline/intro no debe posicionar como "agente de voz"`)
        .not.toMatch(/Centinelia (es|te da|provee) un (agente|bot) de voz/i);
    }
  });

  it('Bland AI destaca precio en pesos vs USD', () => {
    const dump = JSON.stringify(BLAND_AI);
    expect(dump).toMatch(/pesos|MXN/);
    expect(dump).toMatch(/USD|dólares/);
  });

  it('Retell AI destaca "producto vs framework"', () => {
    const dump = JSON.stringify(RETELL_AI).toLowerCase();
    expect(dump).toMatch(/framework|api/);
    expect(dump).toMatch(/roles|listo/);
  });

  it('Vapi menciona explícitamente que Centinelia lo usa por debajo', () => {
    const dump = JSON.stringify(VAPI).toLowerCase();
    expect(dump).toMatch(/vapi/);
    expect(dump).toMatch(/(usa|corre sobre|se apoya|infraestructura)/);
  });

  it('cada competidor tiene URL oficial única', () => {
    const urls = COMPARISONS.map(c => c.competitorUrl);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('el FAQ de cada comparación no tiene preguntas duplicadas', () => {
    for (const c of COMPARISONS) {
      const qs = c.faq.map(f => f.q);
      expect(new Set(qs).size).toBe(qs.length);
    }
  });
});
