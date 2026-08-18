import { describe, it, expect } from 'vitest';
import { meerkatCanUse, MEERKAT_TOOL_ACCESS } from '../meerkat-gates';

describe('meerkat-gates', () => {
  it('Noah es owner de propuesta, cotizacion y correo estructurado', () => {
    expect(meerkatCanUse('noah', 'generar_propuesta_comercial')).toBe(true);
    expect(meerkatCanUse('noah', 'generar_cotizacion')).toBe(true);
    expect(meerkatCanUse('noah', 'generar_correo_estructurado')).toBe(true);
    // one_pager movido a Nelia (contenido postventa) en refactor tool bloat
    expect(meerkatCanUse('noah', 'generar_one_pager')).toBe(false);
  });

  it('Nelia es owner de one_pager, correo estructurado y reporte metricas; NO propuesta ni cotizacion', () => {
    expect(meerkatCanUse('nelia', 'generar_one_pager')).toBe(true);
    expect(meerkatCanUse('nelia', 'generar_correo_estructurado')).toBe(true);
    expect(meerkatCanUse('nelia', 'generar_reporte_metricas_excel')).toBe(true);
    expect(meerkatCanUse('nelia', 'generar_propuesta_comercial')).toBe(false);
    expect(meerkatCanUse('nelia', 'generar_cotizacion')).toBe(false);
  });

  it('Nia (recepcionista) no tiene ninguna tool comercial', () => {
    expect(meerkatCanUse('nia', 'generar_propuesta_comercial')).toBe(false);
    expect(meerkatCanUse('nia', 'generar_cotizacion')).toBe(false);
    expect(meerkatCanUse('nia', 'generar_one_pager')).toBe(false);
    expect(meerkatCanUse('nia', 'generar_correo_estructurado')).toBe(false);
  });

  it('rol null o undefined siempre retorna false', () => {
    expect(meerkatCanUse(null, 'generar_propuesta_comercial')).toBe(false);
    expect(meerkatCanUse(undefined, 'generar_one_pager')).toBe(false);
    expect(meerkatCanUse('', 'generar_cotizacion')).toBe(false);
  });

  it('MEERKAT_TOOL_ACCESS exporta exactamente 6 tools', () => {
    expect(Object.keys(MEERKAT_TOOL_ACCESS)).toEqual([
      'generar_propuesta_comercial',
      'generar_cotizacion',
      'generar_one_pager',
      'generar_correo_estructurado',
      'generar_pitch_deck',
      'generar_reporte_metricas_excel',
    ]);
  });

  it('extended tools están en MEERKAT_TOOL_ACCESS con roles correctos (post refactor tool bloat)', () => {
    expect(MEERKAT_TOOL_ACCESS.generar_pitch_deck).toEqual(['niva']);
    expect(MEERKAT_TOOL_ACCESS.generar_reporte_metricas_excel).toEqual(['nelia', 'nara', 'niva']);
  });

  it('Niva es owner de pitch_deck; NO Noah', () => {
    expect(meerkatCanUse('niva', 'generar_pitch_deck')).toBe(true);
    expect(meerkatCanUse('niva', 'generar_reporte_metricas_excel')).toBe(true);
    expect(meerkatCanUse('noah', 'generar_pitch_deck')).toBe(false);
    expect(meerkatCanUse('noah', 'generar_reporte_metricas_excel')).toBe(false);
  });

  it('Nara solo tiene reporte_metricas, NO pitch_deck', () => {
    expect(meerkatCanUse('nara', 'generar_pitch_deck')).toBe(false);
    expect(meerkatCanUse('nara', 'generar_reporte_metricas_excel')).toBe(true);
    expect(meerkatCanUse('nelia', 'generar_pitch_deck')).toBe(false);
    expect(meerkatCanUse('nelia', 'generar_reporte_metricas_excel')).toBe(true);
  });

  it('MEERKAT_TOOL_ACCESS ahora exporta 6 tools', () => {
    expect(Object.keys(MEERKAT_TOOL_ACCESS)).toHaveLength(6);
  });
});
