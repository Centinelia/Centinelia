/**
 * Fuzzy match de nombres de cliente para detectar discrepancias entre lo que
 * Camila anotó a mano en la hoja de salida (nombre comercial) y la razón social
 * fiscal del receptor en el CFDI de venta (ej. "SA DE CV").
 *
 * Diseño: normalización agresiva + contains bidireccional. No usamos Levenshtein
 * para no sumar deps; en la práctica el match "contains" sobre texto normalizado
 * cubre los casos reales de AC Proyectos (nombre comercial corto vs razón social
 * larga con régimen societario).
 *
 * Nazre 2026-10-07: "Si en la hoja de salida no pudo distinguir el nombre del
 * cliente, que use el nombre que viene en la factura al final." + "Que alerte
 * que hay una discrepancia pero que mantenga lo que escribió de la hoja de
 * salida."
 */

const REGIMEN_RE = /\b(s\.?a\.?\s*(de\s*c\.?v\.?)?|sapi|s\.?a\.?p\.?i\.?|s\.?r\.?l\.?|s\s*de\s*r\.?l\.?|s\.?c\.?|a\.?c\.?|spa|inc\.?|ltda?\.?|llc\.?|gmbh|co\.?|corp\.?)\b/g;
// Segundo pase: "de cv" / "de c.v." standalone (ej. tras "SAPI DE CV" donde el
// primer pase ya removió "sapi" pero dejó "de cv" sin matchear contexto).
const DE_CV_RE = /\bde\s*c\.?v\.?\b/g;

/**
 * Marcadores que Nami puede usar en `inv_registrar_salida` cuando no logra
 * identificar el nombre del cliente en la hoja (ilegible, vacío, o ambiguo).
 * El handler NO escribe CLIENTE si recibe uno de estos — deja la celda vacía
 * para que la factura venta posterior la rellene con la razón social.
 */
const CLIENTE_NO_IDENTIFICADO_RE = /^(no\s+identificado|ilegible|desconocido|pendiente|no\s+leg(i|í)ble|cliente\s+desconocido|n\/?a|-+|)$/i;

export function isClienteNoIdentificado(name: string | null | undefined): boolean {
  if (!name) return true;
  return CLIENTE_NO_IDENTIFICADO_RE.test(name.trim());
}

/**
 * Normaliza para comparación: lowercase, strip tildes, strip régimen
 * societario, strip puntuación/caracteres especiales, collapse espacios.
 * "Natural Bags" → "natural bags"
 * "NATURAL BAGS SA DE CV" → "natural bags"
 * "Ferretería García S.A. de C.V." → "ferreteria garcia"
 */
export function normalizeClienteForMatch(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(REGIMEN_RE, ' ')
    .replace(DE_CV_RE, ' ')
    .replace(/[.,;:!?()&"'/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * `true` si los dos nombres de cliente probablemente refieren a la misma
 * empresa. Case: nombre comercial de hoja vs razón social fiscal de CFDI.
 *
 *   "Natural Bags"   ~ "NATURAL BAGS SA DE CV"           → match
 *   "Ferretería"     ~ "FERRETERIA GARCIA SA DE CV"      → match (contains)
 *   "Natural Bags"   ~ "Ferretería García SA DE CV"      → no match
 *   "NB"             ~ "NATURAL BAGS SA DE CV"           → no match (muy corto)
 *   ""/"-"           → no match (usar isClienteNoIdentificado para el caso)
 */
export function isClienteMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const na = normalizeClienteForMatch(a);
  const nb = normalizeClienteForMatch(b);
  if (na.length < 3 || nb.length < 3) return false;
  if (na === nb) return true;
  // Contains bidireccional: nombre comercial corto está dentro de razón social larga.
  return na.includes(nb) || nb.includes(na);
}
