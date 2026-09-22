import { describe, it, expect } from 'vitest';
import { MEERKATS, getMeerkatBySlug, meerkatSlugs } from '@/lib/meerkats/data';

describe('meerkats data', () => {
  it('el roster tiene 13 empleados (2 dirección + 11 operación)', () => {
    expect(MEERKATS.length).toBe(13);
    const direccion = MEERKATS.filter(m => m.categoria === 'direccion');
    const operacion = MEERKATS.filter(m => m.categoria === 'operacion');
    expect(direccion.length).toBe(2);
    expect(operacion.length).toBe(11);
  });

  it('los slugs esperados están presentes', () => {
    const expected = ['nox', 'niva', 'nia', 'noah', 'nara', 'neo', 'naia', 'nico', 'nelia', 'nova', 'nala', 'nalu', 'nami'];
    expect(meerkatSlugs().sort()).toEqual(expected.sort());
  });

  it('todos los slugs son URL-safe', () => {
    for (const slug of meerkatSlugs()) {
      expect(slug).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('no hay slugs duplicados', () => {
    expect(new Set(meerkatSlugs()).size).toBe(MEERKATS.length);
  });

  it.each(MEERKATS)('$nombre: data mínima completa', m => {
    expect(m.nombre).toBeTruthy();
    expect(m.rol).toBeTruthy();
    expect(m.tagline.length).toBeGreaterThan(10);
    expect(m.descCorta.length).toBeGreaterThan(30);
    expect(m.descLarga.length).toBeGreaterThan(100);
    expect(m.capacidades.length).toBeGreaterThanOrEqual(5);
    expect(m.casosUso.length).toBeGreaterThanOrEqual(3);
    expect(m.herramientas.length).toBeGreaterThanOrEqual(3);
    expect(m.vsHumano.length).toBeGreaterThanOrEqual(2);
    expect(m.faq.length).toBeGreaterThanOrEqual(3);
    expect(m.keywords.length).toBeGreaterThanOrEqual(2);
    expect(m.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(m.image).toMatch(/^\/meerkats\/.*\.png$/);
  });

  it.each(MEERKATS)('$nombre: no usa em-dash', m => {
    const dump = JSON.stringify(m);
    expect(dump.includes('—'), `${m.nombre} contiene em-dash`).toBe(false);
  });

  it('getMeerkatBySlug retorna correcto', () => {
    expect(getMeerkatBySlug('nia')?.nombre).toBe('Nia');
    expect(getMeerkatBySlug('nalu')?.nombre).toBe('Nalú');
    expect(getMeerkatBySlug('inexistente')).toBeUndefined();
  });

  it('no incluye meerkats obsoletos o internos (custom, nash, neka, navi)', () => {
    // Regla dura: 'custom' se eliminó y roles nuevos van via /pedir-rol.
    // Nash, Neka y Navi son internos de Centinelia, no de clientes.
    const slugs = meerkatSlugs();
    for (const forbidden of ['custom', 'nash', 'neka', 'navi']) {
      expect(slugs, `${forbidden} no debe estar en el catálogo público`).not.toContain(forbidden);
    }
  });

  it('las FAQ no tienen preguntas duplicadas dentro del mismo meerkat', () => {
    for (const m of MEERKATS) {
      const qs = m.faq.map(f => f.q);
      expect(new Set(qs).size, `${m.nombre} tiene preguntas duplicadas`).toBe(qs.length);
    }
  });

  it('cada empleado se posiciona como "empleado digital" y no como bot', () => {
    for (const m of MEERKATS) {
      const combined = `${m.descCorta}\n${m.descLarga}`.toLowerCase();
      expect(combined, `${m.nombre} se auto-describe como chatbot`).not.toMatch(/es un chatbot/);
      expect(combined, `${m.nombre} se auto-describe solo como agente de voz`).not.toMatch(/es un agente de voz\b/);
    }
  });
});
