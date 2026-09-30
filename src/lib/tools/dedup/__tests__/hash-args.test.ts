import { describe, it, expect } from 'vitest';
import { computeArgsHash } from '../hash-args';

describe('computeArgsHash', () => {
  it('args idénticos → mismo hash', () => {
    const a = { business_name: 'Tecate Six Cantú', contact_phone: '8129262462' };
    expect(computeArgsHash('registrar_incidencia', a))
      .toBe(computeArgsHash('registrar_incidencia', a));
  });

  it('motivo distinto (caso Tecate) → mismo hash', () => {
    const call1 = { business_name: 'Tecate Six Cantú', contact_phone: '8129262462', motivo: 'Ya tiene unos días' };
    const call2 = { business_name: 'Tecate Six Cantú', contact_phone: '8129262462', motivo: 'El supervisor vino hace 3 días' };
    expect(computeArgsHash('registrar_incidencia', call1))
      .toBe(computeArgsHash('registrar_incidencia', call2));
  });

  it('phone distinto → hash distinto', () => {
    const a = { contact_phone: '8129262462' };
    const b = { contact_phone: '8112345678' };
    expect(computeArgsHash('registrar_incidencia', a))
      .not.toBe(computeArgsHash('registrar_incidencia', b));
  });

  it('business normalize (acentos + case) → mismo hash', () => {
    const a = { business_name: 'Tecate Six Cantú', contact_phone: '8129262462' };
    const b = { business_name: 'TECATE SIX CANTU', contact_phone: '8129262462' };
    expect(computeArgsHash('registrar_incidencia', a))
      .toBe(computeArgsHash('registrar_incidencia', b));
  });

  it('free-text >200 chars → ignored', () => {
    const long = 'x'.repeat(250);
    const a = { contact_phone: '8129262462', unknown_field: long };
    const b = { contact_phone: '8129262462', unknown_field: long.slice(0, -1) + 'y' };
    expect(computeArgsHash('t', a)).toBe(computeArgsHash('t', b));
  });

  it('keys de timestamp → ignored (created_at, scheduled_at, .*_at)', () => {
    const a = { contact_phone: '8129262462', scheduled_at: '2026-09-29T18:00:00Z' };
    const b = { contact_phone: '8129262462', scheduled_at: '2026-09-29T19:00:00Z' };
    expect(computeArgsHash('t', a)).toBe(computeArgsHash('t', b));
  });

  it('override identity_keys respeta la lista', () => {
    const a = { contact_phone: '8129262462', unknown: 'x' };
    const b = { contact_phone: '8129262462', unknown: 'y' };
    const override = { identity_keys: ['contact_phone', 'unknown'] };
    expect(computeArgsHash('t', a, override))
      .not.toBe(computeArgsHash('t', b, override));
  });

  it('override detail_keys ignora campos que la heurística normalmente incluiría', () => {
    const a = { contact_phone: '8129262462', misc_field: 'a' };
    const b = { contact_phone: '8129262462', misc_field: 'b' };
    const override = { detail_keys: ['misc_field'] };
    expect(computeArgsHash('t', a, override))
      .toBe(computeArgsHash('t', b, override));
  });

  it('nested objects — orden de keys NO cambia el hash (canonical JSON)', () => {
    const a = { contact_phone: '81', nested: { a: 1, b: 2 } };
    const b = { contact_phone: '81', nested: { b: 2, a: 1 } };
    expect(computeArgsHash('t', a)).toBe(computeArgsHash('t', b));
  });

  it('null/undefined tratados consistente', () => {
    const a = { contact_phone: '81', extra: null };
    const b = { contact_phone: '81', extra: undefined };
    expect(computeArgsHash('t', a)).toBe(computeArgsHash('t', b));
  });

  it('diferentes toolName → hash distinto aunque args iguales', () => {
    const args = { contact_phone: '8129262462' };
    expect(computeArgsHash('registrar_incidencia', args))
      .not.toBe(computeArgsHash('registrar_pedido', args));
  });

  it('args vacío → hash estable', () => {
    expect(computeArgsHash('t', {})).toBe(computeArgsHash('t', {}));
  });
});
