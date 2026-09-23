import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseFileToText } from '@/lib/connectors/parse';
import { parseFichaSantiago } from '../parse-ficha-santiago';

const FICHAS_DIR = String.raw`C:\Users\Nazre\Dropbox\PC\Downloads\Municipio de Stgo`;
const FICHA_PREDIAL = 'TS-SFT-RIN-02 Pago del Impuesto Predial.pdf';
const FICHA_MULTAS  = 'TS-SFT-ING-01 Pago y Aplicación de Descuento en Multas de Tránsito.pdf';
const FICHA_ISAI    = 'TS-SFT-RIN-01 Pago del Impuesto Sobre la Adquisición de Inmuebles (1).pdf';

async function loadFichaText(file: string): Promise<string> {
  const buffer = await readFile(path.join(FICHAS_DIR, file));
  return parseFileToText(buffer, 'application/pdf');
}

const fichasAvailable = existsSync(path.join(FICHAS_DIR, FICHA_PREDIAL));

describe.skipIf(!fichasAvailable)('parseFichaSantiago', () => {
  it('parsea ficha Predial correctamente', async () => {
    const text = await loadFichaText(FICHA_PREDIAL);
    const p = parseFichaSantiago(text);
    expect(p.codigo).toBe('TS-SFT-RIN-02');
    expect(p.titulo).toMatch(/Predial/i);
    expect(p.dependencia).toMatch(/Secretar[íi]a de Finanzas/i);
    expect(p.unidadAdministrativa).toMatch(/Recaudaci[oó]n Inmobiliaria/i);
    expect(p.contactoCorreo).toBe('predial@santiago.gob.mx');
    expect(p.contactoTelefono).toBe('8121335851');
    expect(p.contactoExtension).toBe('2174');
    expect(p.contactoNombre).toMatch(/Elvira/i);
    expect(p.contactoPuesto).toMatch(/Recaudaci[oó]n Inmobiliaria/i);
    expect(p.ligaEnLinea).toContain('pagopredial.santiago.gob.mx');
    expect(p.horario).toMatch(/Lunes a Viernes/i);
    expect(p.direccion).toMatch(/Calle Mina/i);
    expect(p.sections.length).toBeGreaterThanOrEqual(5);
  });

  it('parsea ficha Multas de Tránsito y normaliza typo "ingersos" → "ingresos"', async () => {
    const text = await loadFichaText(FICHA_MULTAS);
    const p = parseFichaSantiago(text);
    expect(p.codigo).toBe('TS-SFT-ING-01');
    expect(p.titulo).toMatch(/Multas de Tr[áa]nsito/i);
    expect(p.unidadAdministrativa).toMatch(/Direcci[oó]n de Ingresos/i);
    expect(p.contactoCorreo).toBe('ingresos@santiago.gob.mx');
    expect(p.contactoExtension).toBe('2142');
    expect(p.contactoNombre).toMatch(/Vald[eé]s/i);
    expect(p.ligaEnLinea).toContain('pagotransito.santiago.gob.mx');
    expect(p.costoDescripcion).toMatch(/Desde \$207/);
  });

  it('parsea ficha ISAI y prefiere @santiago.gob.mx sobre @outlook.com', async () => {
    const text = await loadFichaText(FICHA_ISAI);
    const p = parseFichaSantiago(text);
    expect(p.codigo).toBe('TS-SFT-RIN-01');
    expect(p.titulo).toMatch(/Adquisici[oó]n de Inmuebles/i);
    expect(p.contactoCorreo).toBe('isai@santiago.gob.mx');
    expect(p.contactoExtension).toBe('2174');
    expect(p.plazoRespuesta).toMatch(/10\s*D[ií]as/i);
  });
});

describe('parseFichaSantiago — edge cases sin dependencia de PDFs', () => {
  it('devuelve nulls sin crashear cuando el texto es vacío', () => {
    const p = parseFichaSantiago('');
    expect(p.codigo).toBeNull();
    expect(p.titulo).toBeNull();
    expect(p.contactoCorreo).toBeNull();
    expect(p.sections).toEqual([]);
    expect(p.rawText).toBe('');
  });

  it('extrae código con formato TS-XXX-XXX-NN sin importar contexto', () => {
    const p = parseFichaSantiago('Algún contenido con TS-SFT-RIN-99 metido en medio.');
    expect(p.codigo).toBe('TS-SFT-RIN-99');
  });

  it('normaliza typo isai_santiago@outlook.com → isai@santiago.gob.mx', () => {
    const p = parseFichaSantiago('Correo: isai_santiago@outlook.com');
    expect(p.contactoCorreo).toBe('isai@santiago.gob.mx');
  });
});
