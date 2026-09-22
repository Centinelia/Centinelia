import { describe, it, expect } from 'vitest';
import { INDUSTRIES, getIndustryBySlug, industrySlugs } from '@/lib/industrias/data';
import { meerkatSlugs } from '@/lib/meerkats/data';

describe('industrias long-tail data', () => {
  it('tiene 10 industrias registradas', () => {
    expect(INDUSTRIES.length).toBe(10);
  });

  it('los slugs esperados están presentes', () => {
    const expected = [
      'talleres-mecanicos', 'veterinarias', 'escuelas', 'gimnasios', 'notarias',
      'opticas', 'spas', 'servicios-a-domicilio', 'guarderias', 'concesionarias',
    ];
    expect(industrySlugs().sort()).toEqual(expected.sort());
  });

  it('todos los slugs son URL-safe', () => {
    for (const slug of industrySlugs()) {
      expect(slug).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('no colisiona con las 5 páginas custom existentes', () => {
    const customSlugs = ['clinicas', 'restaurantes', 'despachos', 'inmobiliarias', 'tiendas'];
    for (const customSlug of customSlugs) {
      expect(industrySlugs(), `El slug ${customSlug} pertenece a la página custom, no debe estar en long-tail`).not.toContain(customSlug);
    }
  });

  it('no hay slugs duplicados', () => {
    expect(new Set(industrySlugs()).size).toBe(INDUSTRIES.length);
  });

  it.each(INDUSTRIES)('$titulo: data mínima completa', ind => {
    expect(ind.titulo).toBeTruthy();
    expect(ind.metaTitle.length).toBeGreaterThan(15);
    expect(ind.metaDescription.length).toBeGreaterThan(50);
    expect(ind.metaDescription.length).toBeLessThan(200); // límite típico de meta description
    expect(ind.keywords.length).toBeGreaterThanOrEqual(3);
    expect(ind.categoria).toBeTruthy();
    expect(ind.heroHeadline).toBeTruthy();
    expect(ind.heroHighlight).toBeTruthy();
    expect(ind.heroSub.length).toBeGreaterThan(30);
    expect(ind.intro.length).toBeGreaterThan(100);
    expect(ind.problemas.length).toBeGreaterThanOrEqual(3);
    expect(ind.features.length).toBeGreaterThanOrEqual(5);
    expect(ind.outboundCases.length).toBeGreaterThanOrEqual(3);
    expect(ind.faq.length).toBeGreaterThanOrEqual(4);
    expect(ind.color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it.each(INDUSTRIES)('$titulo: no contiene em-dashes', ind => {
    const dump = JSON.stringify(ind);
    expect(dump.includes('—'), `${ind.titulo} contiene em-dash`).toBe(false);
  });

  it.each(INDUSTRIES)('$titulo: meerkats referenciados existen en el roster', ind => {
    const roster = meerkatSlugs();
    for (const slug of ind.meerkatsRelevantes) {
      expect(roster, `${ind.titulo} referencia meerkat inexistente: ${slug}`).toContain(slug);
    }
  });

  it.each(INDUSTRIES)('$titulo: cada meerkat relevante aparece una sola vez', ind => {
    expect(new Set(ind.meerkatsRelevantes).size).toBe(ind.meerkatsRelevantes.length);
  });

  it('getIndustryBySlug retorna correcto', () => {
    expect(getIndustryBySlug('veterinarias')?.titulo).toContain('Veterinarias');
    expect(getIndustryBySlug('inexistente')).toBeUndefined();
  });

  it.each(INDUSTRIES)('$titulo: FAQ no tiene preguntas duplicadas', ind => {
    const qs = ind.faq.map(f => f.q);
    expect(new Set(qs).size).toBe(qs.length);
  });
});
