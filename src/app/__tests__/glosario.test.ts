import { describe, it, expect } from 'vitest';
import { TERMINOS, getTerminoBySlug, terminoSlugs } from '@/lib/glosario/data';

describe('glosario data', () => {
  it('tiene al menos 15 términos', () => {
    expect(TERMINOS.length).toBeGreaterThanOrEqual(15);
  });

  it('todos los slugs son URL-safe', () => {
    for (const slug of terminoSlugs()) {
      expect(slug).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('no hay slugs duplicados', () => {
    expect(new Set(terminoSlugs()).size).toBe(TERMINOS.length);
  });

  it('los términos core están registrados', () => {
    const slugs = terminoSlugs();
    for (const core of ['empleado-digital', 'cfdi', 'pac', 'rfc', 'lfpdppp', 'vapi', 'anthropic-claude', 'elevenlabs']) {
      expect(slugs, `Falta término core: ${core}`).toContain(core);
    }
  });

  it.each(TERMINOS)('$termino: data mínima completa', t => {
    expect(t.termino).toBeTruthy();
    expect(t.definicionCorta.length).toBeGreaterThanOrEqual(80);
    expect(t.definicionCorta.length).toBeLessThanOrEqual(400);
    expect(t.definicionLarga.length).toBeGreaterThanOrEqual(1);
    expect(t.ejemplos.length).toBeGreaterThanOrEqual(1);
    expect(t.keywords.length).toBeGreaterThanOrEqual(3);
  });

  it.each(TERMINOS)('$termino: no contiene em-dashes', t => {
    const dump = JSON.stringify(t);
    expect(dump.includes('—'), `${t.termino} contiene em-dash`).toBe(false);
  });

  it.each(TERMINOS)('$termino: los relacionados existen en el registro', t => {
    const slugs = terminoSlugs();
    for (const rel of t.relacionados) {
      expect(slugs, `${t.termino} referencia término inexistente: ${rel}`).toContain(rel);
    }
  });

  it.each(TERMINOS)('$termino: no se autoreferencia como relacionado', t => {
    expect(t.relacionados, `${t.termino} se autoreferencia`).not.toContain(t.slug);
  });

  it.each(TERMINOS)('$termino: URLs de referencias son válidas', t => {
    for (const ref of t.referencias) {
      expect(ref.url).toMatch(/^https:\/\//);
      expect(ref.titulo).toBeTruthy();
    }
  });

  it('categorías son un set finito conocido', () => {
    const validas = ['Producto', 'Fiscal MX', 'Laboral MX', 'Tecnología', 'Compliance'];
    for (const t of TERMINOS) {
      expect(validas, `${t.termino} tiene categoría inválida ${t.categoria}`).toContain(t.categoria);
    }
  });

  it('getTerminoBySlug retorna correcto', () => {
    expect(getTerminoBySlug('cfdi')?.termino).toContain('Comprobante');
    expect(getTerminoBySlug('inexistente')).toBeUndefined();
  });

  it('cubre términos de varias categorías (balance del glosario)', () => {
    const categorias = new Set(TERMINOS.map(t => t.categoria));
    expect(categorias.size).toBeGreaterThanOrEqual(4);
  });
});
