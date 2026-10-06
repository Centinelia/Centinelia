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
 *   2. Descripción contiene MANEJADORA / CONDENSADORA / EVAPORADORA (señal
 *      fuerte y específica, le gana al precedente histórico)
 *   3. Precedente del Excel (familia más común entre filas con el mismo modelo)
 *   4. Patrones secundarios en la descripción (MSP SEER, U-MATCH, PQT HP, UMA)
 *   5. Vacío
 */
export function inferFamilia(
  desc: string,
  modelo: string,
  familiasCatalogo: FamiliaCatalogo,
  familiasPorModelo: FamiliasPorModelo,
): string {
  const mKey = modelo.toUpperCase();
  if (mKey && familiasCatalogo[mKey]) return familiasCatalogo[mKey];

  const d = desc.toUpperCase();
  if (/MANEJADOR/i.test(d))   return 'MANEJADORA';
  if (/CONDENSAD/i.test(d))   return 'CONDENSADORA';
  if (/EVAPORAD/i.test(d))    return 'EVAPORADORA';

  const counts = mKey ? familiasPorModelo.get(mKey) : undefined;
  if (counts && counts.size > 0) {
    let best = '';
    let bestN = 0;
    for (const [f, n] of counts) if (n > bestN) { best = f; bestN = n; }
    if (best) return best;
  }

  if (/MINI[\s-]?SPLIT/i.test(d)) {
    const seer = d.match(/(\d{1,2})\s*SEER/i)?.[1];
    return seer ? `MSP SEER${seer}` : 'MSP';
  }
  if (/U[-\s]?MATCH/i.test(d))  return 'U-MATCH';
  if (/PQT[\s-]?HP/i.test(d))   return 'PQT HP';
  if (/\bUMA\b/i.test(d))       return 'UMA';
  return '';
}

/**
 * Extrae SEER, REF (refrigerante) y VOLTS de la descripción del equipo.
 * El regex de volts tolera formatos "230/3/60", "230/03/60" (ambos con o sin
 * cero inicial en los dígitos del medio y final). Antes el handler de factura
 * TRANE era más estricto y rechazaba "230/3/60" que SÍ es un formato común.
 */
export function extractSeerRefVolts(desc: string): { seer?: string; ref?: string; volts?: string } {
  const seer  = desc.match(/(\d{1,2})\s*SEER/i)?.[1];
  const refM  = desc.match(/R(\d{2,3})/i);
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
  const trExplicit = desc.match(/(\d{1,3})\s*TR\b/i)?.[1];
  if (trExplicit) {
    const tr = Number(trExplicit);
    if (tr >= 1 && tr <= 60) return tr;
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
