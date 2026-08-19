/**
 * Inserta una imagen de firma digitalizada sobre un PDF (típicamente el PDF
 * de una Orden de Compra descargado de QuickBooks). Devuelve el buffer del
 * PDF firmado.
 *
 * Uso: pack `ciclo_oc_cfdi`. Nala/Nox lo llaman después de evaluar reglas de
 * autofirma. El path de la imagen de firma vive en `organizations.ciclo_oc_firma_path`.
 */

import { PDFDocument } from 'pdf-lib';

export interface ApplyFirmaOptions {
  /** Página donde va la firma. Default: última. 1-indexed. */
  page?:      number | 'last';
  /** Coordenadas del ancla inferior-izquierda de la imagen, en puntos PDF. */
  x?:         number;
  y?:         number;
  /** Ancho de la imagen en puntos. Alto se calcula preservando aspect ratio. */
  width?:     number;
  /** Formato de la imagen. Auto-detecta por magic bytes si no se especifica. */
  format?:    'png' | 'jpg';
}

const DEFAULTS: Required<Omit<ApplyFirmaOptions, 'format'>> = {
  page:   'last',
  x:      380,   // parte derecha, sobre línea de firma
  y:      120,   // ~4cm desde el fondo
  width:  160,   // ~5.5cm
};

function detectFormat(buf: Buffer): 'png' | 'jpg' {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'png';
  if (buf.length >= 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'jpg';
  throw new Error('Formato de firma no soportado. Usa PNG o JPG.');
}

export async function applyFirmaToPdf(
  pdfBuffer:      Buffer,
  firmaImage:     Buffer,
  options:        ApplyFirmaOptions = {},
): Promise<Buffer> {
  const opts = { ...DEFAULTS, ...options };
  const format = options.format ?? detectFormat(firmaImage);

  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages  = pdfDoc.getPages();
  if (pages.length === 0) throw new Error('PDF vacío, no se puede firmar.');

  const targetIndex = opts.page === 'last'
    ? pages.length - 1
    : Math.max(0, Math.min(pages.length - 1, (opts.page as number) - 1));
  const page = pages[targetIndex];

  const embedded = format === 'png'
    ? await pdfDoc.embedPng(firmaImage)
    : await pdfDoc.embedJpg(firmaImage);

  const aspectRatio = embedded.height / embedded.width;
  const height      = opts.width * aspectRatio;

  page.drawImage(embedded, {
    x:      opts.x,
    y:      opts.y,
    width:  opts.width,
    height,
  });

  const out = await pdfDoc.save();
  return Buffer.from(out);
}
