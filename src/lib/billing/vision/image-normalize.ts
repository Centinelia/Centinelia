/**
 * Normaliza attachments de imagen antes de mandarlos a Anthropic Vision.
 *
 * Motivación (dry run FASE 4, 2026-09-07):
 *   - Screenshots PNG grandes → Anthropic 400 "Could not process image".
 *   - iPhone HEIC → media_type no soportado por Anthropic → 400.
 *   - Fotos Android 4032×3024 → aceptadas pero cara/lenta.
 *
 * Estrategia: convertir TODO a JPEG, resize máx 1568×1568, strip metadata.
 * Anthropic recomienda 1568 max en el lado largo para óptimo cost/latency;
 * arriba de eso re-escalan del lado servidor. También strippa metadata que
 * puede contener perfiles de color o EXIF que rompen algunos parsers.
 *
 * MIME aceptado (whitelist ampliado):
 *   - image/jpeg, image/jpg, image/jfif (aliases)
 *   - image/png, image/webp
 *   - image/heic, image/heif (via libheif dentro de libvips)
 *
 * Output SIEMPRE: `{ mimeType: 'image/jpeg', buffer: Buffer }` o error.
 */
import sharp from 'sharp';

export const NORMALIZE_TARGET_MIME = 'image/jpeg' as const;

/** Formatos que aceptamos como entrada (más laxos que ALLOWED_TYPES del inbox). */
const INPUT_MIME_WHITELIST = new Set([
  'image/jpeg',
  'image/jpg',
  'image/jfif',
  'image/pjpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
]);

export interface NormalizedImage {
  mimeType: 'image/jpeg';
  buffer:   Buffer;
  /** Diagnóstico: valores originales para logs/observabilidad. */
  original: {
    mimeType: string;
    bytes:    number;
    width?:   number;
    height?:  number;
    format?:  string;
  };
}

export class ImageNormalizeError extends Error {
  constructor(message: string, public code: 'unsupported_mime' | 'decode_failed' | 'sharp_failed') {
    super(message);
    this.name = 'ImageNormalizeError';
  }
}

/**
 * Normaliza un attachment a JPEG con lado largo <= maxSide (default 1568).
 * Strippa metadata. Devuelve el buffer final más metadatos originales.
 */
export async function normalizeImageForVision(
  attachment: { buffer: Buffer; mimeType: string },
  opts?: { maxSide?: number; quality?: number },
): Promise<NormalizedImage> {
  const maxSide = opts?.maxSide ?? 1568;
  const quality = opts?.quality ?? 85;
  const inputMime = attachment.mimeType.toLowerCase();

  if (!INPUT_MIME_WHITELIST.has(inputMime)) {
    throw new ImageNormalizeError(
      `unsupported mime for vision normalization: ${attachment.mimeType}`,
      'unsupported_mime',
    );
  }

  let img: sharp.Sharp;
  let originalMeta: sharp.Metadata;
  try {
    img = sharp(attachment.buffer, { failOn: 'none' });
    originalMeta = await img.metadata();
  } catch (err) {
    throw new ImageNormalizeError(
      `sharp could not decode image (mime=${attachment.mimeType}): ${err instanceof Error ? err.message : String(err)}`,
      'decode_failed',
    );
  }

  try {
    // .rotate() aplica orientación EXIF antes de resize (celulares suelen
    // guardar horizontal + EXIF rotation).
    // .resize({fit: 'inside'}) mantiene proporción sin recortar; solo baja
    // si el lado largo supera maxSide (withoutEnlargement).
    // .jpeg() re-encode. mozjpeg=true reduce ~10% tamaño sin pérdida visible.
    // No pipe metadata() explicit → sharp strippea por default.
    const buffer = await img
      .rotate()
      .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();

    return {
      mimeType: NORMALIZE_TARGET_MIME,
      buffer,
      original: {
        mimeType: attachment.mimeType,
        bytes:    attachment.buffer.length,
        ...(originalMeta.width  != null ? { width:  originalMeta.width  } : {}),
        ...(originalMeta.height != null ? { height: originalMeta.height } : {}),
        ...(originalMeta.format        ? { format: originalMeta.format } : {}),
      },
    };
  } catch (err) {
    throw new ImageNormalizeError(
      `sharp resize/encode failed (mime=${attachment.mimeType}): ${err instanceof Error ? err.message : String(err)}`,
      'sharp_failed',
    );
  }
}
