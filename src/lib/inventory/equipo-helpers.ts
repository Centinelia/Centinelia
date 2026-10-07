/**
 * Helpers compartidos para extraer propiedades de un equipo HVAC a partir de
 * su descripción y modelo. Antes vivían duplicados en inv_procesar_oc_qb y
 * inv_procesar_factura_trane con regexes LIGERAMENTE distintos → la misma
 * fila podía quedar con FAMILIA/TR/VOLTS distintos según qué tool la creó.
 * Centralizados aquí 2026-10-06 (audit post-Meet Camila).
 */

export type FamiliaCatalogo = Record<string, string>;
export type FamiliasPorModelo = Map<string, Map<string, number>>;

/**
 * Infiere la FAMILIA de un equipo con la siguiente precedencia:
 *   1. Catálogo entrenado por el usuario (familiasCatalogo[modelo])
 *   2. Precedente del Excel (familia más común entre filas con el mismo modelo)
 *      ← prioridad sobre el regex de descripción porque el Excel es la fuente
 *      de verdad de qué familias EXISTEN en el inventario de ese cliente.
 *   3. Match de descripción contra familiasValidas (set de familias que SÍ
 *      existen en el Excel). Patterns MANEJADOR/CONDENSAD/EVAPORAD/MSP/U-MATCH/
 *      PQT HP/UMA solo se usan si matchean a una familia que ya existe.
 *   4. Vacío (humano llena manualmente).
 *
 * 2026-10-07 bug reportado por Nazre en OC 6203 real: Nami inventaba
 * "EVAPORADORA" y "CONDENSADORA" como FAMILIA, pero esas familias NO
 * existen en el Excel de AC Proyectos (usa nombres como "MSP SEER19",
 * "EVAP SPLIT", "COND INV", etc. — distintos per cliente). El hardcoded
 * step que retornaba "EVAPORADORA"/"CONDENSADORA" ignoraba la realidad
 * del Excel. Fix: el precedente histórico GANA al hardcoded, y los
 * patrones solo se usan si matchean una familia válida existente.
 */
export function inferFamilia(
  desc: string,
  modelo: string,
  familiasCatalogo: FamiliaCatalogo,
  familiasPorModelo: FamiliasPorModelo,
  familiasValidas?: Set<string>,  // set de familias que SÍ existen en el Excel
): string {
  const mKey = modelo.toUpperCase();
  if (mKey && familiasCatalogo[mKey]) return familiasCatalogo[mKey];

  // Precedente histórico GANA (step 2). El Excel es la fuente de verdad.
  const counts = mKey ? familiasPorModelo.get(mKey) : undefined;
  if (counts && counts.size > 0) {
    let best = '';
    let bestN = 0;
    for (const [f, n] of counts) if (n > bestN) { best = f; bestN = n; }
    if (best) return best;
  }

  const d = desc.toUpperCase();

  // Si tenemos familiasValidas, intentar matchear patrones contra el set real.
  // Para cada pattern, buscamos una familia existente que CONTENGA ese keyword.
  // Ejemplo: /MANEJADOR/ → busca familia en set que contenga "MANEJADOR"
  // (ej. "MANEJADORA SPLIT 20TR", "MANEJAD-COMERCIAL", etc.).
  const findMatchingValid = (keyword: RegExp): string => {
    if (!familiasValidas || familiasValidas.size === 0) return '';
    for (const f of familiasValidas) {
      if (keyword.test(f)) return f;
    }
    return '';
  };

  if (/MANEJADOR/i.test(d)) {
    const match = findMatchingValid(/MANEJADOR/i);
    if (match) return match;
  }
  if (/CONDENSAD/i.test(d)) {
    const match = findMatchingValid(/COND(ENS)?/i);
    if (match) return match;
  }
  if (/EVAPORAD/i.test(d)) {
    const match = findMatchingValid(/EVAP(OR)?/i);
    if (match) return match;
  }
  if (/MINI[\s-]?SPLIT/i.test(d)) {
    const seer = d.match(/(?:SEER\s*(\d{1,2})|(\d{1,2})\s*SEER)/i);
    const seerVal = seer?.[1] || seer?.[2];
    // Buscar MSP SEER<N> en familiasValidas si existe
    if (seerVal) {
      const target = `MSP SEER${seerVal}`;
      if (!familiasValidas || familiasValidas.has(target)) return target;
      const matchMsp = findMatchingValid(new RegExp(`MSP.*SEER\\s*${seerVal}`, 'i'));
      if (matchMsp) return matchMsp;
    }
    const matchMspGen = findMatchingValid(/^MSP\b/i);
    if (matchMspGen) return matchMspGen;
    // Si no hay familiasValidas, usar el patrón histórico (compat tests legacy)
    if (!familiasValidas) return seerVal ? `MSP SEER${seerVal}` : 'MSP';
  }
  if (/U[-\s]?MATCH/i.test(d)) {
    const match = findMatchingValid(/U[-\s]?MATCH/i);
    if (match) return match;
    if (!familiasValidas) return 'U-MATCH';
  }
  if (/PQT[\s-]?HP/i.test(d)) {
    const match = findMatchingValid(/PQT[\s-]?HP/i);
    if (match) return match;
    if (!familiasValidas) return 'PQT HP';
  }
  if (/\bUMA\b/i.test(d)) {
    const match = findMatchingValid(/\bUMA\b/i);
    if (match) return match;
    if (!familiasValidas) return 'UMA';
  }
  return '';
}

/**
 * Extrae SEER, REF (refrigerante) y VOLTS de la descripción del equipo.
 * El regex de volts tolera formatos "230/3/60", "230/03/60" (ambos con o sin
 * cero inicial en los dígitos del medio y final).
 *
 * 2026-10-07 bug fix (reportado por Nazre en OC 6203 real):
 *   - SEER antes solo matcheaba "19 SEER" (orden inverso). Descripciones
 *     Trane residencial usan "SEER19" (pegado). Ahora matchea ambos.
 *   - REF matcheaba "R19" dentro de "SEER19" porque /R(\d{2,3})/ no tenía
 *     word boundary. Ahora requiere separador antes de la R (start-of-string,
 *     espacio, guion, coma, etc.) para evitar colisión con "SEER<n>".
 */
export function extractSeerRefVolts(desc: string): { seer?: string; ref?: string; volts?: string } {
  // SEER acepta ambos ordenes: "SEER19", "SEER 19", "19SEER", "19 SEER"
  const seerMatch = desc.match(/(?:SEER\s*(\d{1,2})|(\d{1,2})\s*SEER)/i);
  const seer = seerMatch ? (seerMatch[1] || seerMatch[2]) : undefined;
  // REF: refrigerante tipo R-410A, R410, R-32, R32. Requiere separador antes
  // de la R para no capturar "R19" de "SEER19". Letra sufijo opcional (A/B).
  const refM = desc.match(/(?:^|[\s\-,.;:(])R[-\s]?(\d{2,3})[A-Z]?\b/i);
  const volts = desc.match(/(\d{3}\s*\/\s*\d{1,2}\s*\/\s*\d{1,2})/)?.[1]?.replace(/\s/g, '');
  return { seer, ref: refM ? 'R' + refM[1] : undefined, volts };
}

/**
 * Toneladas (TR): regla de Camila 2026-10-06:
 *   - Primero intentar en la descripción: "20TR" literal → 20
 *   - Segundo: "36MBH" → 36/12 = 3 TR
 *   - Si no viene, usar el modelo MSP: patrón `16XX` donde XX son BTUs/1000.
 *     Ej: 1636 → 3 TR, 1624 → 2, 1618 → 1.5, 1612 → 1
 *   - Si no cuadra, dejar null.
 * Antes el handler de factura TRANE NO intentaba el patrón "20TR" literal →
 * dejaba TR vacío aunque la descripción claramente dijera "20TR".
 */
export function extractTonelada(desc: string, modelo: string): number | null {
  // 2026-10-07 bug fix (reportado Nazre OC 6203 real): regex antes era
  // /(\d{1,3})\s*TR\b/ que no soportaba decimales. Para "1.5TR" matcheaba
  // solo "5TR" (ignorando "1.") y resultaba en TR=5. Fix: aceptar decimal
  // con punto o coma. Residencial Trane trabaja con 1, 1.5, 2, 2.5, 3 TR.
  const trExplicit = desc.match(/(\d+(?:[.,]\d+)?)\s*TR\b/i)?.[1];
  if (trExplicit) {
    const tr = Number(trExplicit.replace(',', '.'));
    if (tr >= 0.5 && tr <= 60) return tr;
  }
  const mbh = desc.match(/(\d{2,3})\s*MBH/i)?.[1];
  if (mbh) {
    const tr = Number(mbh) / 12;
    if (tr >= 1 && tr <= 20) return tr;
  }
  const mspMatch = modelo.match(/16(\d{2})/);
  if (mspMatch) {
    const btu = Number(mspMatch[1]);
    if (btu >= 12 && btu <= 60 && btu % 6 === 0) return btu / 12;
  }
  return null;
}

/**
 * Formatea un número de OC AC a la convención del Excel: `OC` + 5 dígitos con
 * ceros a la izquierda. Ej: `7119` → `OC07119`. Si ya trae prefijo "OC" lo
 * normaliza. Si no es numérico, devuelve el string tal cual.
 */
export function formatOcAc(oc: string | null): string | null {
  if (!oc) return null;
  const digits = oc.replace(/^OC0*/i, '').trim();
  if (!/^\d+$/.test(digits)) return oc;
  return 'OC' + digits.padStart(5, '0');
}
