import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { extractText, getDocumentProxy } from 'unpdf';

const DOCX_MIME  = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_MIME  = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XLS_MIME   = 'application/vnd.ms-excel';
const DOC_MIME   = 'application/msword';
const PDF_MIME   = 'application/pdf';
const PPTX_MIME  = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

export async function parseFileToText(buffer: Buffer, mimeType: string): Promise<string> {
  const mt = mimeType.split(';')[0].trim().toLowerCase();

  if (mt.startsWith('text/') || mt === 'application/json' || mt === 'text/csv') {
    return buffer.toString('utf8');
  }

  if (mt === DOCX_MIME) {
    try {
      const r = await mammoth.extractRawText({ buffer });
      return r.value;
    } catch (err) {
      return `[No pude leer el .docx: ${String(err)}]`;
    }
  }

  if (mt === XLSX_MIME || mt === XLS_MIME) {
    try {
      const wb = XLSX.read(buffer, { type: 'buffer' });
      const parts: string[] = [];
      for (const sheetName of wb.SheetNames) {
        const sheet = wb.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(sheet).trim();
        if (csv) parts.push(`# Hoja: ${sheetName}\n${csv}`);
      }
      return parts.join('\n\n');
    } catch (err) {
      return `[No pude leer el .xlsx: ${String(err)}]`;
    }
  }

  if (mt === PDF_MIME) {
    try {
      const doc = await getDocumentProxy(new Uint8Array(buffer));
      const { text } = await extractText(doc, { mergePages: true });
      return Array.isArray(text) ? text.join('\n') : text;
    } catch (err) {
      return `[No pude leer el PDF: ${String(err)}]`;
    }
  }

  if (mt === PPTX_MIME) {
    return '[Presentaciones .pptx no soportadas todavía. Convierte el archivo a Google Slides o PDF para poder leerlo.]';
  }

  if (mt === DOC_MIME) {
    return '[Formato .doc (Word 97-2003) no soportado. Convierte el archivo a .docx.]';
  }

  return `[Formato no soportado para lectura: ${mimeType}]`;
}
