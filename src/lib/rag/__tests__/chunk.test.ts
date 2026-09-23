import { describe, it, expect } from 'vitest';
import { chunkSections } from '../chunk';

describe('chunkSections', () => {
  it('genera 1 chunk por sección cuando cabe en el límite', () => {
    const chunks = chunkSections(
      [
        { type: 'descripcion', content: 'Descripción corta del trámite predial.' },
        { type: 'requisitos',  content: 'Nombre del propietario, número de expediente catastral.' },
      ],
      'TS-SFT-RIN-02 — Pago del Impuesto Predial — Secretaría de Finanzas'
    );
    expect(chunks).toHaveLength(3);
    expect(chunks[0].section_type).toBe('header');
    expect(chunks[1].section_type).toBe('descripcion');
    expect(chunks[2].section_type).toBe('requisitos');
  });

  it('preserva chunk_index secuencial arrancando en 0', () => {
    const chunks = chunkSections(
      [
        { type: 'descripcion', content: 'a' },
        { type: 'requisitos',  content: 'b' },
        { type: 'costo',       content: 'c' },
      ],
      'header'
    );
    expect(chunks.map((c) => c.chunk_index)).toEqual([0, 1, 2, 3]);
  });

  it('hace split recursivo cuando la sección excede 800 tokens', () => {
    // "palabra " son 8 chars = ~2 tokens. 500 repeticiones = ~1000 tokens.
    const bigContent = 'palabra '.repeat(500).trim();
    const chunks = chunkSections([{ type: 'pasos', content: bigContent }]);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    for (const c of chunks) {
      expect(c.section_type).toBe('pasos');
      expect(c.token_count).toBeLessThanOrEqual(800);
    }
  });

  it('omite header si viene vacío', () => {
    const chunks = chunkSections(
      [{ type: 'descripcion', content: 'X' }],
      ''
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0].section_type).toBe('descripcion');
  });

  it('omite secciones vacías', () => {
    const chunks = chunkSections(
      [
        { type: 'descripcion', content: '' },
        { type: 'requisitos',  content: '   ' },
        { type: 'costo',       content: 'Variable' },
      ],
      ''
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0].section_type).toBe('costo');
  });
});
