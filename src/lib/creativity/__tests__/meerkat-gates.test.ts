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

  it('MEERKAT_TOOL_ACCESS exporta exactamente 4 tools', () => {
    expect(Object.keys(MEERKAT_TOOL_ACCESS)).toEqual([
      'generar_propuesta_comercial',
      'generar_cotizacion',
      'generar_one_pager',
      'generar_correo_estructurado',
    ]);
  });
});
