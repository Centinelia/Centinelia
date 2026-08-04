import { describe, it, expect } from 'vitest';
import { meerkatCanUse, MEERKAT_TOOL_ACCESS } from '../meerkat-gates';

describe('meerkat-gates', () => {
  it('Noah puede usar los 4 tools', () => {
    expect(meerkatCanUse('noah', 'generar_propuesta_comercial')).toBe(true);
    expect(meerkatCanUse('noah', 'generar_cotizacion')).toBe(true);
    expect(meerkatCanUse('noah', 'generar_one_pager')).toBe(true);
    expect(meerkatCanUse('noah', 'generar_correo_estructurado')).toBe(true);
  });

  it('Nelia puede one_pager y correo pero NO propuesta ni cotizacion', () => {
    expect(meerkatCanUse('nelia', 'generar_one_pager')).toBe(true);
    expect(meerkatCanUse('nelia', 'generar_correo_estructurado')).toBe(true);
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

  it('extended tools están en MEERKAT_TOOL_ACCESS con roles correctos', () => {
    expect(MEERKAT_TOOL_ACCESS.generar_pitch_deck).toEqual(['noah']);
    expect(MEERKAT_TOOL_ACCESS.generar_reporte_metricas_excel).toEqual(['noah', 'nara', 'nelia']);
  });

  it('Noah puede pitch_deck y reporte_metricas', () => {
    expect(meerkatCanUse('noah', 'generar_pitch_deck')).toBe(true);
    expect(meerkatCanUse('noah', 'generar_reporte_metricas_excel')).toBe(true);
  });

  it('Nara y Nelia solo tienen reporte_metricas, NO pitch_deck', () => {
    expect(meerkatCanUse('nara', 'generar_pitch_deck')).toBe(false);
    expect(meerkatCanUse('nara', 'generar_reporte_metricas_excel')).toBe(true);
    expect(meerkatCanUse('nelia', 'generar_pitch_deck')).toBe(false);
    expect(meerkatCanUse('nelia', 'generar_reporte_metricas_excel')).toBe(true);
  });

  it('MEERKAT_TOOL_ACCESS ahora exporta 6 tools', () => {
    expect(Object.keys(MEERKAT_TOOL_ACCESS)).toHaveLength(6);
  });
});
