export interface MediaMetadata {
  mimeType:        string;
  durationSeconds?: number;
  width?:          number;
  height?:         number;
  sizeBytes:       number;
}

const ALLOWED_VIDEO = ['video/mp4', 'video/quicktime'];
const ALLOWED_IMAGE = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Valida si un archivo multimedia cumple los requisitos de Instagram
 * para el tipo de publicación indicado.
 *
 * Límites de tamaño:
 *   - Video (reel / story con video): 100 MB
 *   - Imagen (post / carrusel / story con imagen): 30 MB
 *
 * Resolución mínima para reel: 720 px en ambos ejes (típicamente 720×1280).
 * Duration máxima para reel: 90 s.
 *
 * @param m      Metadatos del archivo ya disponibles (pueden ser parciales).
 * @param target Tipo de publicación objetivo en Instagram.
 */
export function validateMediaForIG(
  m:      MediaMetadata,
  target: 'image' | 'reel' | 'story' | 'carousel',
): { valid: boolean; reason?: string } {

  if (target === 'reel') {
    if (!ALLOWED_VIDEO.includes(m.mimeType)) {
      return { valid: false, reason: `Formato no soportado para reel (${m.mimeType}). Usa mp4 o quicktime.` };
    }
    if ((m.durationSeconds ?? 0) > 90) {
      return { valid: false, reason: `El reel no puede durar más de 90 segundos (duración actual: ${m.durationSeconds}s).` };
    }
    if ((m.width ?? 0) < 720 || (m.height ?? 0) < 720) {
      return { valid: false, reason: `Resolución insuficiente para reel — mínimo 720px en ambos ejes.` };
    }
    if (m.sizeBytes > 100 * 1024 * 1024) {
      return { valid: false, reason: 'El video excede el límite de 100 MB para reel.' };
    }
    return { valid: true };
  }

  if (target === 'image' || target === 'carousel') {
    if (!ALLOWED_IMAGE.includes(m.mimeType)) {
      return { valid: false, reason: `Formato imagen no soportado (${m.mimeType}). Usa jpeg, png o webp.` };
    }
    if (m.sizeBytes > 30 * 1024 * 1024) {
      return { valid: false, reason: 'La imagen excede el límite de 30 MB.' };
    }
    return { valid: true };
  }

  if (target === 'story') {
    const allowed = [...ALLOWED_IMAGE, ...ALLOWED_VIDEO];
    if (!allowed.includes(m.mimeType)) {
      return { valid: false, reason: `Formato no soportado para story (${m.mimeType}).` };
    }
    // Límite según tipo: video=100MB, imagen=30MB
    const maxBytes = ALLOWED_VIDEO.includes(m.mimeType) ? 100 * 1024 * 1024 : 30 * 1024 * 1024;
    if (m.sizeBytes > maxBytes) {
      return { valid: false, reason: `El archivo excede el límite para story (${ALLOWED_VIDEO.includes(m.mimeType) ? '100' : '30'} MB).` };
    }
    return { valid: true };
  }

  // target desconocido — rechazar de forma segura
  return { valid: false, reason: `Tipo de publicación desconocido: ${target as string}` };
}
