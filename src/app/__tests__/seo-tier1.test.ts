import { describe, it, expect } from 'vitest';
import { breadcrumbSchema, slugify, todayIso, BASE_URL } from '@/lib/seo/schemas';

describe('breadcrumbSchema', () => {
  it('genera un BreadcrumbList válido', () => {
    const schema = breadcrumbSchema([
      { name: 'Inicio', url: 'https://www.centinelia.mx' },
      { name: 'Empleados', url: 'https://www.centinelia.mx/empleados' },
      { name: 'Nia', url: 'https://www.centinelia.mx/empleados/nia' },
    ]) as {
      '@context': string;
      '@type':    string;
      itemListElement: Array<{
        '@type':  string;
        position: number;
        name:     string;
        item:     string;
      }>;
    };

    expect(schema['@context']).toBe('https://schema.org');
    expect(schema['@type']).toBe('BreadcrumbList');
    expect(schema.itemListElement).toHaveLength(3);
    expect(schema.itemListElement[0].position).toBe(1);
    expect(schema.itemListElement[2].name).toBe('Nia');
    expect(schema.itemListElement[2].item).toBe('https://www.centinelia.mx/empleados/nia');
  });

  it('posiciones son 1-indexed y consecutivas', () => {
    const items = ['A', 'B', 'C', 'D'].map(name => ({ name, url: `${BASE_URL}/${name}` }));
    const schema = breadcrumbSchema(items) as { itemListElement: Array<{ position: number }> };
    const positions = schema.itemListElement.map(i => i.position);
    expect(positions).toEqual([1, 2, 3, 4]);
  });
});

describe('todayIso', () => {
  it('devuelve YYYY-MM-DD del día actual', () => {
    const date = todayIso();
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const parsed = new Date(date);
    const now    = new Date();
    // debería ser el día de hoy (diferencia < 25 horas por si el test corre en frontera de zona)
    const diffHours = Math.abs(now.getTime() - parsed.getTime()) / (1000 * 60 * 60);
    expect(diffHours).toBeLessThan(25);
  });
});

describe('slugify', () => {
  it.each([
    ['Capacidades de Nia',        'capacidades-de-nia'],
    ['Preguntas frecuentes',       'preguntas-frecuentes'],
    ['Con qué trabaja Nalú',       'con-que-trabaja-nalu'],
    ['Cuándo elegir Centinelia',   'cuando-elegir-centinelia'],
    ['Múltiples   espacios',       'multiples-espacios'],
    ['UPPER case Texto',           'upper-case-texto'],
  ])('slugify("%s") === "%s"', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });
});

describe('BASE_URL', () => {
  it('es la URL de producción de Centinelia', () => {
    expect(BASE_URL).toBe('https://www.centinelia.mx');
  });
});
