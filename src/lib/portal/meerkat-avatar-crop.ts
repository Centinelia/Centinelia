/**
 * Tuning per-meerkat para avatares circulares pequeños (32-100px).
 *
 * Fuente de verdad: los valores base vinieron del landing TeamFlowSection.tsx,
 * que ya estaba visualmente afinado. Esto permite reusar la misma calibración
 * en el FAB de chat, el banner de reportes, y cualquier otra card compacta.
 *
 * Uso típico:
 *   const crop = getMeerkatCrop(meerkatId);
 *   <img style={{
 *     objectFit: 'cover',
 *     objectPosition: crop.pos,
 *     transform: buildCropTransform(crop),
 *     transformOrigin: crop.origin ?? crop.pos,
 *   }} />
 */

export interface MeerkatCrop {
  /** object-position — punto del raster que se ancla al centro del contenedor. */
  pos:     string;
  /** transform scale extra sobre object-fit cover. 1 = sin zoom extra. */
  scale:   number;
  /** transform-origin. Si se omite, se usa `pos`. */
  origin?: string;
  /** Translate X extra tras el scale (px o cualquier unidad CSS). */
  shiftX?: string;
  /** Translate Y extra tras el scale. */
  shiftY?: string;
}

/**
 * Valores curados en la landing (TeamFlowSection). No modificar sin verificar
 * el resultado en todos los consumidores (chat FAB, banner reportes, landing).
 */
export const MEERKAT_AVATAR_CROP: Record<string, MeerkatCrop> = {
  // ── Specialists (calibrados en TeamFlowSection) ─────────────────────────
  nia:   { pos: 'center 10%', scale: 1.35, origin: 'center 12%', shiftX: '15px' },
  noah:  { pos: 'center 8%',  scale: 1.2,  shiftY: '5px' },
  nara:  { pos: 'center 8%',  scale: 1.2,  origin: 'center 10%', shiftX: '-3px', shiftY: '4px' },
  nico:  { pos: 'center 8%',  scale: 1,    shiftY: '3px' },
  naia:  { pos: 'center 8%',  scale: 1,    shiftX: '-0.5px' },
  nelia: { pos: 'center 8%',  scale: 1,    shiftY: '4px' },
  neo:   { pos: 'center 10%', scale: 1.45, origin: 'center 12%', shiftX: '15.5px', shiftY: '5px' },
  nova:  { pos: 'center 5%',  scale: 2.00, origin: 'center 12%', shiftX: '23px',   shiftY: '6px' },

  // ── Coordinadores / internos (tuning nuevo) ──────────────────────────────
  // Nox y Niva: retrato de 3/4 con face en el top ~15%. Necesitan zoom para
  // que la cara llene el círculo pequeño.
  nox:   { pos: 'center 4%',  scale: 1.55, origin: 'center 12%', shiftY: '3px' },
  niva:  { pos: 'center 4%',  scale: 1.55, origin: 'center 12%', shiftX: '-2px', shiftY: '3px' },
  // Nash: ya viene close-up con VR glasses, casi no requiere zoom.
  nash:  { pos: 'center 25%', scale: 1.05, origin: 'center 30%' },
  // Nala: retrato similar a los specialists, face en top ~15%.
  nala:  { pos: 'center 6%',  scale: 1.3,  origin: 'center 10%', shiftY: '3px' },
  // Neus: sin imagen dedicada al momento, fallback conservador.
  neus:  { pos: 'center 6%',  scale: 1.3,  origin: 'center 10%' },
  // Nami: retrato landscape con face al lado izquierdo (scanner a la derecha).
  nami:  { pos: '32% 35%',    scale: 1.6,  origin: '32% 35%' },
};

/**
 * Fallback conservador para cualquier meerkat sin entrada explícita. Usa un
 * pequeño zoom (1.3) y anchor cerca del top, que funciona bien con la mayoría
 * de retratos verticales del roster.
 */
export const DEFAULT_MEERKAT_CROP: MeerkatCrop = {
  pos:    'center 5%',
  scale:  1.3,
  origin: 'center 10%',
};

export function getMeerkatCrop(id: string | null | undefined): MeerkatCrop {
  if (!id) return DEFAULT_MEERKAT_CROP;
  return MEERKAT_AVATAR_CROP[id] ?? DEFAULT_MEERKAT_CROP;
}

/**
 * Construye el `transform` CSS combinando translate (shiftX/shiftY) + scale.
 * Devuelve `undefined` si no hay nada que aplicar (deja el default).
 */
export function buildCropTransform(crop: MeerkatCrop): string | undefined {
  const parts: string[] = [];
  if (crop.shiftX || crop.shiftY) {
    parts.push(`translate(${crop.shiftX ?? '0'}, ${crop.shiftY ?? '0'})`);
  }
  if (crop.scale !== 1) {
    parts.push(`scale(${crop.scale})`);
  }
  return parts.length > 0 ? parts.join(' ') : undefined;
}
