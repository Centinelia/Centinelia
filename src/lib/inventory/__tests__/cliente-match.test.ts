import { describe, it, expect } from 'vitest';
import {
  isClienteMatch,
  isClienteNoIdentificado,
  normalizeClienteForMatch,
} from '../cliente-match';

/**
 * Casos basados en pedido real de Nazre 2026-10-07:
 * "Que alerte que hay una discrepancia pero que mantenga lo que escribió de
 * la hoja de salida. Si en la hoja de salida no pudo distinguir el nombre
 * del cliente, que use el nombre que viene en la factura al final."
 */

describe('normalizeClienteForMatch', () => {
  it('strip régimen societario común', () => {
    expect(normalizeClienteForMatch('NATURAL BAGS SA DE CV')).toBe('natural bags');
    expect(normalizeClienteForMatch('Natural Bags S.A. de C.V.')).toBe('natural bags');
    expect(normalizeClienteForMatch('Ferretería García SA de CV')).toBe('ferreteria garcia');
    expect(normalizeClienteForMatch('ACME SAPI DE CV')).toBe('acme');
    expect(normalizeClienteForMatch('Empresa SRL')).toBe('empresa');
    expect(normalizeClienteForMatch('Comercial Co.')).toBe('comercial');
  });

  it('strip tildes', () => {
    expect(normalizeClienteForMatch('García Hernández')).toBe('garcia hernandez');
    expect(normalizeClienteForMatch('ÁÉÍÓÚñ')).toBe('aeioun');
  });

  it('strip puntuación', () => {
    expect(normalizeClienteForMatch('ACME, S.A.')).toBe('acme');
    expect(normalizeClienteForMatch('A/B & Hijos')).toBe('a b hijos');
  });

  it('collapse spaces', () => {
    expect(normalizeClienteForMatch('A   B    C')).toBe('a b c');
  });
});

describe('isClienteMatch (fuzzy)', () => {
  it('match: nombre comercial dentro de razón social fiscal (caso real OC 6203)', () => {
    expect(isClienteMatch('Natural Bags', 'NATURAL BAGS SA DE CV')).toBe(true);
    expect(isClienteMatch('NATURAL BAGS SA DE CV', 'Natural Bags')).toBe(true);
  });

  it('match: ambas razones sociales equivalentes con régimen distinto', () => {
    expect(isClienteMatch('Ferretería García SA de CV', 'Ferreteria Garcia S.A. de C.V.')).toBe(true);
  });

  it('NO match: nombres totalmente distintos', () => {
    expect(isClienteMatch('Natural Bags', 'Ferretería García SA de CV')).toBe(false);
    expect(isClienteMatch('ACME Corp', 'XYZ Industrias')).toBe(false);
  });

  it('match: contains parcial largo', () => {
    expect(isClienteMatch('Natural', 'NATURAL BAGS SA DE CV')).toBe(true);
    expect(isClienteMatch('Ferretería García', 'Ferretería García y Asociados SA de CV')).toBe(true);
  });

  it('NO match: acrónimos muy cortos (riesgo de false positive)', () => {
    expect(isClienteMatch('NB', 'NATURAL BAGS SA DE CV')).toBe(false);
  });

  it('NO match: cualquier input vacío/null', () => {
    expect(isClienteMatch('', 'NATURAL BAGS')).toBe(false);
    expect(isClienteMatch('NATURAL BAGS', '')).toBe(false);
    expect(isClienteMatch(null, 'X')).toBe(false);
    expect(isClienteMatch('X', undefined)).toBe(false);
  });

  it('case-insensitive', () => {
    expect(isClienteMatch('natural bags', 'NATURAL BAGS')).toBe(true);
  });
});

describe('isClienteNoIdentificado — markers de "no pude leer"', () => {
  it('detecta todos los markers que Nami puede usar', () => {
    expect(isClienteNoIdentificado('NO IDENTIFICADO')).toBe(true);
    expect(isClienteNoIdentificado('no identificado')).toBe(true);
    expect(isClienteNoIdentificado('ilegible')).toBe(true);
    expect(isClienteNoIdentificado('ILEGIBLE')).toBe(true);
    expect(isClienteNoIdentificado('no legible')).toBe(true);
    expect(isClienteNoIdentificado('No legible')).toBe(true);
    expect(isClienteNoIdentificado('desconocido')).toBe(true);
    expect(isClienteNoIdentificado('Cliente desconocido')).toBe(true);
    expect(isClienteNoIdentificado('PENDIENTE')).toBe(true);
    expect(isClienteNoIdentificado('N/A')).toBe(true);
    expect(isClienteNoIdentificado('na')).toBe(true);
    expect(isClienteNoIdentificado('-')).toBe(true);
    expect(isClienteNoIdentificado('---')).toBe(true);
    expect(isClienteNoIdentificado('')).toBe(true);
    expect(isClienteNoIdentificado(null)).toBe(true);
    expect(isClienteNoIdentificado(undefined)).toBe(true);
  });

  it('NO detecta nombres reales como "no identificado"', () => {
    expect(isClienteNoIdentificado('Natural Bags')).toBe(false);
    expect(isClienteNoIdentificado('NATURAL BAGS SA DE CV')).toBe(false);
    expect(isClienteNoIdentificado('Juan Pérez')).toBe(false);
    expect(isClienteNoIdentificado('Taquería La Única')).toBe(false);
  });
});
