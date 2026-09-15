/**
 * Tests del parser de CSF. Cubre las 3 grandes categorias:
 *   1. Persona moral (denominacion/razon social + regimen 601 tipico)
 *   2. Persona fisica (nombre + apellidos + regimen 605/612/626)
 *   3. Casos borde: texto muy corto, campos ausentes, layouts variantes
 *
 * Los fixtures son strings — reproducimos el layout de texto extraido por
 * PDF.js sobre CSFs reales. No probamos parseCsfPdf (eso requiere binary
 * fixture); parseCsfText cubre el 100% de la logica de extraccion.
 */
import { describe, it, expect } from 'vitest';
import { parseCsfText, parseCsfPdf } from '../csf-parser';

const CSF_PERSONA_MORAL = `
CONSTANCIA DE SITUACION FISCAL
Datos de Identificacion del Contribuyente
RFC: TEN010518AL3
Denominación / Razón Social: TORTILLAS ESTRELLA DEL NORTE
Régimen de Capital: SA DE CV
Nombre Comercial:
Fecha de inicio de operaciones: 18/05/2001
Estatus en el padrón: ACTIVO

Datos del Domicilio Registrado
Código Postal: 66470
Tipo de Vialidad: CALLE
Nombre de Vialidad: HIDALGO
Número Exterior: 123
Nombre de la Colonia: CENTRO
Nombre del Municipio o Demarcación Territorial: SAN NICOLAS DE LOS GARZA
Nombre de la Entidad Federativa: NUEVO LEON

Regímenes
Régimen General de Ley Personas Morales           01/01/2001
`;

const CSF_PERSONA_FISICA = `
CONSTANCIA DE SITUACION FISCAL
Datos de Identificacion del Contribuyente
RFC: AAMN951208I25
CURP: AAMN951208HNLSRZ08
Nombre (s): NAZRE HASSAM MIGUEL
Primer Apellido: ASSAD
Segundo Apellido: MORALES
Fecha Nacimiento: 08/12/1995

Datos del Domicilio Registrado
Código Postal: 64997
Nombre de la Entidad Federativa: NUEVO LEON

Regímenes
Régimen Simplificado de Confianza      01/01/2022
`;

const CSF_RESICO = `
RFC: XYZM800101ABC
Denominación / Razón Social: MI EMPRESA RESICO PM
Código Postal: 07800
Régimen Simplificado de Confianza  01/07/2022
`;

const CSF_ACT_EMP = `
RFC: PPLJ700101X01
Nombre (s): JUAN
Primer Apellido: PEREZ
Segundo Apellido: LOPEZ
Código Postal: 03100
Personas Físicas con Actividades Empresariales y Profesionales  01/06/2015
`;

describe('parseCsfText — persona moral', () => {
  it('extrae los 4 campos criticos', () => {
    const r = parseCsfText(CSF_PERSONA_MORAL);
    expect(r).not.toBeNull();
    expect(r!.rfc).toBe('TEN010518AL3');
    expect(r!.razon_social).toBe('TORTILLAS ESTRELLA DEL NORTE');
    expect(r!.cp).toBe('66470');
    expect(r!.regimen_fiscal).toBe('601');
    expect(r!.regimen_label).toContain('General de Ley Personas Morales');
  });

  it('regresa raw_text_length y parsed_at', () => {
    const r = parseCsfText(CSF_PERSONA_MORAL);
    expect(r!.raw_text_length).toBeGreaterThan(50);
    expect(new Date(r!.parsed_at).getTime()).toBeGreaterThan(0);
  });
});

describe('parseCsfText — persona fisica', () => {
  it('extrae RFC de 13 chars y arma nombre concatenando apellidos', () => {
    const r = parseCsfText(CSF_PERSONA_FISICA);
    expect(r).not.toBeNull();
    expect(r!.rfc).toBe('AAMN951208I25');
    expect(r!.razon_social).toBe('ASSAD MORALES NAZRE HASSAM MIGUEL');
    expect(r!.cp).toBe('64997');
    expect(r!.regimen_fiscal).toBe('626');  // RESICO
  });
});

describe('parseCsfText — regimenes comunes', () => {
  it('detecta RESICO (626)', () => {
    const r = parseCsfText(CSF_RESICO);
    expect(r!.regimen_fiscal).toBe('626');
  });

  it('detecta Actividades Empresariales Personas Fisicas (612)', () => {
    const r = parseCsfText(CSF_ACT_EMP);
    expect(r!.regimen_fiscal).toBe('612');
  });
});

describe('parseCsfText — casos borde', () => {
  it('regresa null cuando el texto es demasiado corto', () => {
    expect(parseCsfText('')).toBeNull();
    expect(parseCsfText('RFC: X')).toBeNull();
  });

  it('regresa null cuando texto es blank', () => {
    expect(parseCsfText('   \n\n   ')).toBeNull();
  });

  it('campos individuales pueden ser null si no matchean', () => {
    const r = parseCsfText('un texto suficientemente largo pero sin patrones SAT: lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor.');
    expect(r).not.toBeNull();
    expect(r!.rfc).toBeNull();
    expect(r!.razon_social).toBeNull();
    expect(r!.cp).toBeNull();
    expect(r!.regimen_fiscal).toBeNull();
  });

  it('extrae RFC persona moral aunque razon social falte', () => {
    const r = parseCsfText('CONSTANCIA DE SITUACION FISCAL\nRFC: ABC010101XYZ\n(el resto ilegible)\nCódigo Postal: 01000\n');
    expect(r!.rfc).toBe('ABC010101XYZ');
    expect(r!.razon_social).toBeNull();
    expect(r!.cp).toBe('01000');
  });

  it('tolera variaciones de espaciado y capitalizacion en labels', () => {
    const r = parseCsfText('constancia\nrfc:  ABC010101XYZ\ncodigo postal:  99999\nDenominacion / Razon Social: EMPRESA SIN ACENTOS SA\n');
    expect(r!.rfc).toBe('ABC010101XYZ');
    expect(r!.cp).toBe('99999');
    expect(r!.razon_social).toBe('EMPRESA SIN ACENTOS SA');
  });
});

describe('parseCsfPdf — integracion con unpdf', () => {
  it('regresa null cuando el buffer NO es un PDF valido', async () => {
    const result = await parseCsfPdf(Buffer.from('esto no es un PDF, es texto plano'));
    expect(result).toBeNull();
  });
});
