// Normaliza un Buffer de archivo bancario a texto CSV listo para parsear.
// Routa por tipo (XLSX vs CSV) y decodifica el encoding apropiado.
//
// Encodings observados en exports MX:
// - UTF-8 (moderno Banorte, BBVA Net Cash reciente)
// - Windows-1252 / ISO-8859-1 (BBVA legacy, cuando el cliente abre y guarda
//   desde Excel con locale es-MX)
// - UTF-8 con BOM (algunos exports vía SharePoint)
// - UTF-16 LE (export desde PowerShell del admin del cliente)

import { xlsxBufferToText } from '@/lib/excel-io/read';

/** Magic bytes del header ZIP — todo XLSX es un ZIP. */
const XLSX_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const UTF16_LE_BOM = Buffer.from([0xff, 0xfe]);
const UTF16_BE_BOM = Buffer.from([0xfe, 0xff]);

export function isXlsxBuffer(buf: Buffer): boolean {
  if (buf.length < 4) return false;
  return buf.subarray(0, 4).equals(XLSX_MAGIC);
}

/**
 * Decodifica un Buffer a string probando encodings en orden. Priority:
 * 1. BOM explícito → ese encoding
 * 2. UTF-8 válido → UTF-8
 * 3. Fallback → Windows-1252 (superset de ISO-8859-1 que cubre es-MX)
 */
export function decodeBuffer(buf: Buffer): string {
  if (buf.length === 0) return '';

  // UTF-16 LE BOM
  if (buf.length >= 2 && buf.subarray(0, 2).equals(UTF16_LE_BOM)) {
    return new TextDecoder('utf-16le').decode(buf.subarray(2));
  }
  // UTF-16 BE BOM
  if (buf.length >= 2 && buf.subarray(0, 2).equals(UTF16_BE_BOM)) {
    return new TextDecoder('utf-16be').decode(buf.subarray(2));
  }
  // UTF-8 BOM
  if (buf.length >= 3 && buf.subarray(0, 3).equals(UTF8_BOM)) {
    return buf.subarray(3).toString('utf-8');
  }

  // Sin BOM: intentar UTF-8 estricto; si hay replacement U+FFFD → cambiar
  // a Windows-1252. TextDecoder con fatal:true tira si hay bytes inválidos,
  // así es como detectamos no-UTF-8 confiablemente.
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

/**
 * Entry point unificado: Buffer → string CSV. Si es XLSX, lo serializa
 * a CSV via exceljs. Si es texto, lo decodifica con autodetect.
 */
export async function bufferToCsvText(buf: Buffer): Promise<string> {
  if (isXlsxBuffer(buf)) {
    return await xlsxBufferToText(buf);
  }
  return decodeBuffer(buf);
}
