import { describe, it, expect } from 'vitest';
import { PRECIOS, getPrecioBySlug, precioSlugs } from '@/lib/precios/data';
import { SOLUCIONES, getSolucionBySlug, solucionSlugs } from '@/lib/soluciones/data';
import { meerkatSlugs } from '@/lib/meerkats/data';

describe('precios data', () => {
  it('tiene 3 comparativas de precio', () => {
    expect(PRECIOS.length).toBe(3);
  });

  it('slugs esperados', () => {
    expect(precioSlugs().sort()).toEqual(['vs-call-center', 'vs-chatbot', 'vs-recepcionista-humana']);
  });

  it.each(PRECIOS)('$titulo: data mínima', p => {
    expect(p.slug).toMatch(/^[a-z0-9-]+$/);
    expect(p.titulo).toBeTruthy();
    expect(p.h1.length).toBeGreaterThan(15);
    expect(p.metaTitle.length).toBeGreaterThan(15);
    expect(p.metaDescription.length).toBeGreaterThan(60);
    expect(p.metaDescription.length).toBeLessThan(250);
    expect(p.intro.length).toBeGreaterThan(50);
    expect(p.matriz.length).toBeGreaterThanOrEqual(8);
    expect(p.cuandoOtra.length).toBeGreaterThanOrEqual(2);
    expect(p.cuandoCentinelia.length).toBeGreaterThanOrEqual(2);
    expect(p.faq.length).toBeGreaterThanOrEqual(3);
    expect(p.keywords.length).toBeGreaterThanOrEqual(3);
  });

  it.each(PRECIOS)('$titulo: no em-dashes', p => {
    const dump = JSON.stringify(p);
    expect(dump.includes('—'), `${p.titulo} contiene em-dash`).toBe(false);
  });

  it.each(PRECIOS)('$titulo: matriz sin celdas vacías', p => {
    for (const row of p.matriz) {
      expect(row.aspecto.trim()).not.toBe('');
      expect(row.humano.trim()).not.toBe('');
      expect(row.centinelia.trim()).not.toBe('');
    }
  });

  it('getPrecioBySlug funciona', () => {
    expect(getPrecioBySlug('vs-recepcionista-humana')?.titulo).toBe('Recepcionista humana');
    expect(getPrecioBySlug('inexistente')).toBeUndefined();
  });
});

describe('soluciones data', () => {
  it('tiene 3 landings de dolor', () => {
    expect(SOLUCIONES.length).toBe(3);
  });

  it('slugs esperados', () => {
    expect(solucionSlugs().sort()).toEqual([
      'atender-fuera-de-horario',
      'no-contratar-mas-personal',
      'perdemos-llamadas',
    ]);
  });

  it.each(SOLUCIONES)('$titulo: data mínima', s => {
    expect(s.slug).toMatch(/^[a-z0-9-]+$/);
    expect(s.titulo).toBeTruthy();
    expect(s.h1.length).toBeGreaterThan(15);
    expect(s.metaTitle.length).toBeGreaterThan(15);
    expect(s.metaDescription.length).toBeGreaterThan(60);
    expect(s.hero.length).toBeGreaterThan(60);
    expect(s.sintomas.length).toBeGreaterThanOrEqual(3);
    expect(s.respuesta.length).toBeGreaterThan(60);
    expect(s.comoResolvemos.length).toBeGreaterThanOrEqual(3);
    expect(s.faq.length).toBeGreaterThanOrEqual(2);
    expect(s.keywords.length).toBeGreaterThanOrEqual(3);
  });

  it.each(SOLUCIONES)('$titulo: no em-dashes', s => {
    const dump = JSON.stringify(s);
    expect(dump.includes('—'), `${s.titulo} contiene em-dash`).toBe(false);
  });

  it.each(SOLUCIONES)('$titulo: meerkats referenciados existen', s => {
    const roster = meerkatSlugs();
    for (const slug of s.meerkats) {
      expect(roster).toContain(slug);
    }
  });

  it('getSolucionBySlug funciona', () => {
    expect(getSolucionBySlug('perdemos-llamadas')?.titulo).toBe('Perdemos llamadas');
    expect(getSolucionBySlug('inexistente')).toBeUndefined();
  });
});
