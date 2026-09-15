/**
 * Parser deterministico de Constancias de Situacion Fiscal (CSF) del SAT.
 *
 * Extrae texto del PDF con unpdf (PDF.js) y aplica regex sobre los patrones
 * conocidos del layout SAT post-2022. Regresa los campos que pudo detectar;
 * ninguno es garantia. La UI muestra lo detectado y el humano decide si
 * aplica al cliente.
 *
 * NO usa OCR (asume que el CSF viene digital, no escaneado). NO usa LLM
 * (mas caro, mas frágil que regex sobre un layout consistente).
 *
 * Cuando el SAT rediseñe el CSF, esta funcion regresara los campos que
 * sigan matcheando y null para el resto. La estrategia es "best effort,
 * jamas rompas el upload".
 */
import { extractText, getDocumentProxy } from 'unpdf';
import type { DocTipo } from './centinelia-clientes';

export interface CsfExtractedFields {
  rfc:              string | null;
  razon_social:     string | null;
  regimen_fiscal:   string | null;  // codigo SAT ('601', '612', etc)
  regimen_label:    string | null;  // label human-readable del regimen encontrado
  cp:               string | null;
  raw_text_length:  number;
  parsed_at:        string;
}

/**
 * Mapa nombre → codigo SAT. Cubre los regimenes mas comunes de PyMEs
 * mexicanas. El nombre del regimen en el CSF puede tener leves variaciones
 * de formato; el match usa `includes` sobre normalizacion NFD sin acentos
 * ni mayusculas.
 */
const REGIMEN_MAP: Array<{ code: string; label: string; needles: string[] }> = [
  { code: '601', label: 'General de Ley Personas Morales',
    needles: ['general de ley personas morales'] },
  { code: '603', label: 'Personas Morales con Fines no Lucrativos',
    needles: ['personas morales con fines no lucrativos'] },
  { code: '605', label: 'Sueldos y Salarios e Ingresos Asimilados a Salarios',
    needles: ['sueldos y salarios', 'asimilados a salarios'] },
  { code: '606', label: 'Arrendamiento',
    needles: ['arrendamiento'] },
  { code: '608', label: 'Demas ingresos',
    needles: ['demas ingresos'] },
  { code: '610', label: 'Residentes en el Extranjero',
    needles: ['residentes en el extranjero'] },
  { code: '611', label: 'Ingresos por Dividendos',
    needles: ['ingresos por dividendos'] },
  { code: '612', label: 'Personas Fisicas con Actividades Empresariales y Profesionales',
    needles: ['personas fisicas con actividades empresariales'] },
  { code: '614', label: 'Ingresos por intereses',
    needles: ['ingresos por intereses'] },
  { code: '616', label: 'Sin obligaciones fiscales',
    needles: ['sin obligaciones fiscales'] },
  { code: '621', label: 'Incorporacion Fiscal',
    needles: ['incorporacion fiscal'] },
  { code: '622', label: 'Actividades Agricolas, Ganaderas, Silvicolas y Pesqueras',
    needles: ['actividades agricolas'] },
  { code: '625', label: 'Actividades Empresariales con ingresos a traves de Plataformas Tecnologicas',
    needles: ['plataformas tecnologicas'] },
  { code: '626', label: 'Regimen Simplificado de Confianza',
    needles: ['regimen simplificado de confianza', 'resico'] },
];

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Intenta match del RFC. Persona fisica = 13 chars, persona moral = 12. */
function extractRfc(text: string): string | null {
  const m = text.match(/RFC[:\s]*([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})\b/i);
  return m ? m[1].toUpperCase() : null;
}

/**
 * Extrae razon social o nombre. CSF de persona moral tiene "Denominación o
 * Razón Social:"; persona fisica tiene "Nombre (s):" + "Primer Apellido:" +
 * "Segundo Apellido:". Para persona fisica concatenamos los 3.
 */
function extractRazonSocial(text: string): string | null {
  // Persona moral
  const pm = text.match(/Denominaci[oó]n\s*(?:o|\/)\s*Raz[oó]n\s*Social[:\s]*([^\r\n]+?)(?:\r?\n|$)/i);
  if (pm && pm[1].trim() && !/^\s*$/.test(pm[1])) return pm[1].trim();

  // Persona fisica
  const nombre = text.match(/Nombre\s*\(s\)[:\s]*([^\r\n]+?)(?:\r?\n|$)/i);
  const primer = text.match(/Primer\s+Apellido[:\s]*([^\r\n]+?)(?:\r?\n|$)/i);
  const segundo = text.match(/Segundo\s+Apellido[:\s]*([^\r\n]+?)(?:\r?\n|$)/i);
  if (nombre) {
    const parts = [primer?.[1], segundo?.[1], nombre[1]].map(p => p?.trim() ?? '').filter(Boolean);
    if (parts.length > 0) return parts.join(' ').toUpperCase();
  }
  return null;
}

function extractCp(text: string): string | null {
  const m = text.match(/C[oó]digo\s*Postal[:\s]*(\d{5})\b/i);
  return m ? m[1] : null;
}

/**
 * Busca el codigo de regimen a partir del label. Devuelve el PRIMER match
 * en el orden de REGIMEN_MAP (mas comunes primero). Un CSF puede listar
 * varios regimenes historicamente; nos quedamos con el primero encontrado
 * y el humano ajusta si necesita otro.
 */
function extractRegimen(text: string): { code: string | null; label: string | null } {
  const haystack = normalize(text);
  for (const r of REGIMEN_MAP) {
    for (const needle of r.needles) {
      if (haystack.includes(needle)) {
        return { code: r.code, label: r.label };
      }
    }
  }
  return { code: null, label: null };
}

/**
 * Aplica los regex sobre un texto ya extraido. Separado de parseCsfPdf para
 * testeabilidad — los tests pasan strings fixture directo sin invocar pdf.js.
 * Regresa null solo si el texto es demasiado corto para ser un CSF real.
 */
export function parseCsfText(text: string): CsfExtractedFields | null {
  if (!text || text.length < 50) return null;
  const regimen = extractRegimen(text);
  return {
    rfc:             extractRfc(text),
    razon_social:    extractRazonSocial(text),
    regimen_fiscal:  regimen.code,
    regimen_label:   regimen.label,
    cp:              extractCp(text),
    raw_text_length: text.length,
    parsed_at:       new Date().toISOString(),
  };
}

/**
 * Parsea un buffer de CSF PDF. Extrae texto con unpdf y delega a parseCsfText.
 * Regresa `null` si el PDF no se pudo leer (corrupto o formato desconocido).
 */
export async function parseCsfPdf(buffer: Buffer): Promise<CsfExtractedFields | null> {
  let text: string;
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text: rawText } = await extractText(pdf, { mergePages: true });
    text = Array.isArray(rawText) ? rawText.join('\n') : rawText;
  } catch (e) {
    console.warn('[csf-parser] extractText fallo:', (e as Error).message);
    return null;
  }
  return parseCsfText(text);
}

/** Solo tipo CSF disparara el parser en la UI. */
export function isParseableTipo(tipo: DocTipo): boolean {
  return tipo === 'csf';
}
