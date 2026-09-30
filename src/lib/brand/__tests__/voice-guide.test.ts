import { describe, it, expect } from 'vitest';
import { buildBrandVoiceBlock, parseBannedTerms } from '../voice-guide';

describe('buildBrandVoiceBlock', () => {
  it('devuelve null si la guía es null', () => {
    expect(buildBrandVoiceBlock(null)).toBeNull();
  });

  it('devuelve null si la guía es undefined', () => {
    expect(buildBrandVoiceBlock(undefined)).toBeNull();
  });

  it('devuelve null si la guía es string vacío', () => {
    expect(buildBrandVoiceBlock('')).toBeNull();
  });

  it('devuelve null si la guía es solo whitespace', () => {
    expect(buildBrandVoiceBlock('   \n\n  ')).toBeNull();
  });

  it('envuelve la guía en el header estándar y la instrucción de gana-el-conflicto', () => {
    const out = buildBrandVoiceBlock('Ritmo: oraciones cortas. Palabras: "checa", "va".');
    expect(out).toContain('TONO DE MARCA — HABLA COMO ESTE NEGOCIO, NO GENÉRICO:');
    expect(out).toContain('Ritmo: oraciones cortas');
    expect(out).toMatch(/esta guía gana/i);
  });

  it('trimea whitespace externo de la guía', () => {
    const out = buildBrandVoiceBlock('   Guía con espacios   ')!;
    expect(out).toContain('Guía con espacios');
    expect(out).not.toContain('   Guía');
  });

  it('devuelve solo bloque de banned terms si guide es null pero hay terms', () => {
    const out = buildBrandVoiceBlock(null, 'estimado cliente\ncordial saludo')!;
    expect(out).not.toContain('TONO DE MARCA');
    expect(out).toContain('PALABRAS Y FRASES PROHIBIDAS');
    expect(out).toContain('- estimado cliente');
    expect(out).toContain('- cordial saludo');
  });

  it('junta guía + banned terms en dos bloques separados', () => {
    const out = buildBrandVoiceBlock('Ritmo corto.', 'quedo a la orden')!;
    expect(out).toContain('TONO DE MARCA');
    expect(out).toContain('Ritmo corto');
    expect(out).toContain('PALABRAS Y FRASES PROHIBIDAS');
    expect(out).toContain('- quedo a la orden');
    // Separados por doble salto
    expect(out.split('\n\n').length).toBeGreaterThanOrEqual(2);
  });

  it('devuelve null si ambos son null/vacíos', () => {
    expect(buildBrandVoiceBlock(null, null)).toBeNull();
    expect(buildBrandVoiceBlock('', '')).toBeNull();
    expect(buildBrandVoiceBlock('  ', '  ')).toBeNull();
  });
});

// ─── parseBannedTerms ─────────────────────────────────────────────────────────

describe('parseBannedTerms', () => {
  it('devuelve [] si input null/undefined/vacío', () => {
    expect(parseBannedTerms(null)).toEqual([]);
    expect(parseBannedTerms(undefined)).toEqual([]);
    expect(parseBannedTerms('')).toEqual([]);
    expect(parseBannedTerms('   ')).toEqual([]);
  });

  it('separa por líneas', () => {
    expect(parseBannedTerms('estimado\ncordial saludo\nqueremos')).toEqual([
      'estimado', 'cordial saludo', 'queremos',
    ]);
  });

  it('separa por comas y punto y coma', () => {
    expect(parseBannedTerms('a, b; c')).toEqual(['a', 'b', 'c']);
  });

  it('trimea y quita vacíos', () => {
    expect(parseBannedTerms('  a  \n\n  b  \n \n c ')).toEqual(['a', 'b', 'c']);
  });

  it('descarta términos > 100 chars', () => {
    const longTerm = 'a'.repeat(101);
    expect(parseBannedTerms(`ok\n${longTerm}\notra`)).toEqual(['ok', 'otra']);
  });

  it('trunca a 40 items máximo', () => {
    const many = Array.from({ length: 60 }, (_, i) => `t${i}`).join('\n');
    expect(parseBannedTerms(many)).toHaveLength(40);
  });
});
