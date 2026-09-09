/**
 * Pipeline Excel → BillingInvoice para la Tortillería Estrella.
 *
 * Toma los `ParsedBlock[]` que produjo el parser (`tortilleria-batch.ts`) y
 * los transforma en un lote de `BillingInvoice` listos para pasar al adapter
 * CONTPAQi con `submitInvoiceBatch`.
 *
 * Capas de transformación (todas puras, sin side-effects):
 *
 *   1. applySkipRules       — filtra bloques descontinuados (ALWIN, ALIMENOTOS EL NEGRO).
 *   2. applyConsolidation   — agrupa bloques que matchean con una regla (ej. DCA).
 *   3. resolveClient        — para cada grupo, resuelve código CONTPAQi vía mapping guardado
 *                             (o fallback a `codigoCliente` que detectó el parser).
 *   4. resolveProducts      — para cada línea de cada grupo, mapea columna+precio → SKU.
 *   5. buildInvoices        — arma el `BillingInvoice` final con metodoPago derivado
 *                             (PPD para códigos de crédito, PUE por default).
 *
 * Cualquier resolución que falle se reporta como `PipelineError` sin tronar
 * el batch completo — los demás grupos se emiten normal.
 */

import type { BillingInvoice, BillingLineItem } from '../adapter';
import type { ParsedBlock } from '../parsers/tortilleria-batch';
import type {
  TortilleriaMapping,
  TortilleriaPipelineConfig,
  ClientMappingEntry,
  ProductMappingEntry,
  SkipReport,
  PipelineError,
  PipelineWarning,
} from './types';

/** Un bloque post-consolidación (puede agregar varios ParsedBlock originales). */
interface ConsolidatedGroup {
  /** Título representativo (para debug/UI). */
  tituloRep: string;
  /** Bloques originales que componen este grupo. */
  sourceBlocks: ParsedBlock[];
  /** Código consolidado forzado por la regla, o null si no hay regla aplicada. */
  forcedCodigo: string | null;
  /** Razón de consolidación para trazabilidad. */
  consolidationReason: string | null;
}

export interface InvoiceMeta {
  /** Bloques originales del Excel que produjeron este invoice. */
  sourceBlocks: ParsedBlock[];
  /** Warnings acumulados durante el build de este invoice específico. */
  blockWarnings: string[];
}

export interface PipelineResult {
  invoices: BillingInvoice[];
  /** Metadata paralela a `invoices` (mismo índice). Para confidence check + trazabilidad. */
  invoiceMeta: InvoiceMeta[];
  skipped: SkipReport[];
  errors: PipelineError[];
  warnings: PipelineWarning[];
}

// ---- Layer 1: skip ---------------------------------------------------------

function applySkipRules(
  blocks: ParsedBlock[],
  mapping: TortilleriaMapping,
): { kept: ParsedBlock[]; skipped: SkipReport[] } {
  const kept: ParsedBlock[] = [];
  const skipped: SkipReport[] = [];

  for (const b of blocks) {
    const entry = findClientEntry(mapping, b);
    if (entry?.skip) {
      skipped.push({
        tituloBloque: b.tituloBloque,
        reason:       entry.notes ?? `skip explícito por mapping (cliente descontinuado)`,
      });
      continue;
    }
    kept.push(b);
  }
  return { kept, skipped };
}

// ---- Layer 2: consolidación (DCA) -----------------------------------------

function applyConsolidation(
  blocks: ParsedBlock[],
  mapping: TortilleriaMapping,
): ConsolidatedGroup[] {
  const groups: ConsolidatedGroup[] = [];
  const consumed = new Set<number>();

  for (const rule of mapping.consolidationRules) {
    const prefix = rule.matchPrefix.toUpperCase();
    const members: ParsedBlock[] = [];
    for (let i = 0; i < blocks.length; i++) {
      if (consumed.has(i)) continue;
      if (blocks[i].tituloBloque.toUpperCase().trimStart().startsWith(prefix)) {
        members.push(blocks[i]);
        consumed.add(i);
      }
    }
    if (members.length > 0) {
      groups.push({
        tituloRep:           `${rule.matchPrefix} (consolidado ${members.length})`,
        sourceBlocks:        members,
        forcedCodigo:        rule.consolidateToCode,
        consolidationReason: rule.reason,
      });
    }
  }

  // Los bloques no consumidos van cada uno como su propio grupo.
  for (let i = 0; i < blocks.length; i++) {
    if (consumed.has(i)) continue;
    groups.push({
      tituloRep:           blocks[i].tituloBloque,
      sourceBlocks:        [blocks[i]],
      forcedCodigo:        null,
      consolidationReason: null,
    });
  }

  return groups;
}

// ---- Layer 3: resolver cliente --------------------------------------------

/** Normaliza whitespace: colapsa espacios múltiples, tabs, trims. Case-insensitive. */
function normalizeTitle(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toUpperCase();
}

function findClientEntry(
  mapping: TortilleriaMapping,
  block: ParsedBlock,
): ClientMappingEntry | null {
  const titulo = normalizeTitle(block.tituloBloque);
  // Match por titlePattern (case-insensitive, substring, whitespace-tolerant).
  for (const c of mapping.clients) {
    if (!c.titlePattern) continue;
    if (titulo.includes(normalizeTitle(c.titlePattern))) return c;
  }
  return null;
}

function resolveGroupClient(
  group: ConsolidatedGroup,
  mapping: TortilleriaMapping,
): { codigo: string | null; rfc: string | null; entry: ClientMappingEntry | null } {
  if (group.forcedCodigo) {
    // Regla de consolidación aplicada; buscar RFC si existe entry.
    const codigo = group.forcedCodigo;
    const entry = mapping.clients.find(c => c.codigo === codigo) ?? null;
    return { codigo, rfc: entry?.rfc ?? null, entry };
  }
  // Buscar por título del primer bloque.
  const entry = findClientEntry(mapping, group.sourceBlocks[0]);
  if (entry) return { codigo: entry.codigo, rfc: entry.rfc ?? null, entry };
  // Fallback: código que detectó el parser.
  const detected = group.sourceBlocks[0].codigoCliente;
  return { codigo: detected, rfc: null, entry: null };
}

// ---- Layer 4: resolver productos ------------------------------------------

/**
 * Busca en el mapping el producto que matchea con (columna, precio). Match:
 *   - Nombre de columna case-insensitive, exact match sobre normalización.
 *   - Precio dentro del rango (o cualquier precio si el rango es null).
 */
function findProductEntry(
  mapping: TortilleriaMapping,
  columnaExcel: string,
  precioUnit: number,
): ProductMappingEntry | null {
  const col = columnaExcel.trim().toUpperCase();
  for (const p of mapping.products) {
    if (p.columnaPattern.trim().toUpperCase() !== col) continue;
    if (!p.precioRange) return p;
    if (precioUnit >= p.precioRange.min && precioUnit <= p.precioRange.max) return p;
  }
  return null;
}

/** Suma cantidades por (SKU, precioUnit) a lo largo de todos los bloques del grupo. */
function aggregateLines(
  group: ConsolidatedGroup,
  mapping: TortilleriaMapping,
  config: TortilleriaPipelineConfig,
  warnings: PipelineWarning[],
): { lines: BillingLineItem[]; unmappedColumns: Set<string> } {
  interface Bucket {
    sku: string;
    qty: number;
    unitPrice: number;
    ivaTasa: number;
    description: string;
  }
  const buckets = new Map<string, Bucket>();
  const unmapped = new Set<string>();

  for (const block of group.sourceBlocks) {
    for (const producto of block.productos) {
      if (producto.cantidadTotal <= 0) continue;
      if (producto.precioUnit == null) continue;

      const entry = findProductEntry(mapping, producto.columnaNombre, producto.precioUnit);
      let sku: string;
      let description: string;
      let ivaTasa = 0;
      if (entry) {
        sku = entry.sku;
        description = entry.nombreContpaqi ?? producto.columnaNombre;
      } else {
        // Fallback: usar clave SAT default. Mapping incompleto → warning.
        sku = producto.columnaNombre.trim().toUpperCase();
        description = producto.columnaNombre;
        unmapped.add(`${producto.columnaNombre} @ $${producto.precioUnit.toFixed(2)}`);
        warnings.push({
          tituloBloque: block.tituloBloque,
          message: `El producto "${producto.columnaNombre}" a $${producto.precioUnit.toFixed(2)} no está en tu catálogo de códigos. Agrégalo o dime a qué SKU corresponde.`,
        });
      }

      const key = `${sku}|${producto.precioUnit}`;
      const existing = buckets.get(key);
      if (existing) {
        existing.qty += producto.cantidadTotal;
      } else {
        buckets.set(key, {
          sku,
          qty:       producto.cantidadTotal,
          unitPrice: producto.precioUnit,
          ivaTasa,
          description,
        });
      }
    }
  }

  const lines: BillingLineItem[] = Array.from(buckets.values()).map(b => ({
    sku:         b.sku,
    qty:         b.qty,
    unitPrice:   b.unitPrice,
    ivaTasa:     b.ivaTasa,
    description: b.description,
  }));

  return { lines, unmappedColumns: unmapped };
}

// ---- Layer 5: buildInvoices ------------------------------------------------

/** Determina la fecha a poner en el CFDI: la más reciente de todas las remisiones del grupo. */
function pickInvoiceDate(group: ConsolidatedGroup): string {
  const dates = group.sourceBlocks
    .flatMap(b => b.remisiones.map(r => r.fecha))
    .filter(Boolean)
    .sort();
  return dates.length > 0 ? dates[dates.length - 1] : new Date().toISOString().slice(0, 10);
}

/** Determina metodoPago para el grupo: PPD si el código está en creditCodes; PUE default. */
function pickMetodoPago(codigo: string | null, mapping: TortilleriaMapping): 'PUE' | 'PPD' {
  if (!codigo) return 'PUE';
  return mapping.creditCodes.includes(codigo) ? 'PPD' : 'PUE';
}

// ---- Entry point ----------------------------------------------------------

/**
 * Convierte el output del parser en un lote de facturas listas para timbrar.
 * No hace side-effects: es una función pura sobre los inputs.
 *
 * @param blocks     Salida de `parseTortilleriaBatchXlsx`.
 * @param mapping    Mapping guardado del portal para esta org.
 * @param config     Config fiscal del emisor (RFC, régimen, CP, serie, uso CFDI).
 */
export function buildInvoicesFromBlocks(
  blocks: ParsedBlock[],
  mapping: TortilleriaMapping,
  config: TortilleriaPipelineConfig,
): PipelineResult {
  const errors: PipelineError[] = [];
  const warnings: PipelineWarning[] = [];

  // 1) Skip
  const { kept, skipped } = applySkipRules(blocks, mapping);

  // 2) Consolidar
  const groups = applyConsolidation(kept, mapping);

  // 3-5) Por cada grupo, resolver cliente + productos + armar invoice
  const invoices: BillingInvoice[] = [];
  const invoiceMeta: InvoiceMeta[] = [];
  for (const g of groups) {
    const { codigo, rfc } = resolveGroupClient(g, mapping);

    if (!codigo) {
      errors.push({
        tituloBloque: g.tituloRep,
        reason:       'No se pudo resolver código de cliente CONTPAQi (título no matchea con ningún mapping guardado y parser no detectó código).',
      });
      continue;
    }
    if (!rfc) {
      warnings.push({
        tituloBloque: g.tituloRep,
        message:      `Código ${codigo} sin RFC en mapping guardado. El adapter buscará el RFC en el catálogo CONTPAQi con este código.`,
      });
    }

    // Warnings acumulados solo para este grupo (para confidence check).
    const groupWarnings: PipelineWarning[] = [];
    const { lines } = aggregateLines(g, mapping, config, groupWarnings);
    warnings.push(...groupWarnings);
    if (lines.length === 0) {
      warnings.push({
        tituloBloque: g.tituloRep,
        message:      `Grupo sin líneas facturables (todos los productos con cantidad 0 o sin precio). Se salta.`,
      });
      continue;
    }

    const invoice: BillingInvoice = {
      // El adapter va a hacer el getClientByRFC / buscar por código; ponemos
      // el código como identificador si el RFC no vino en el mapping.
      clientRFC:     rfc ?? codigo,
      date:          pickInvoiceDate(g),
      lines,
      paymentMethod: 'transferencia',
      usoCFDI:       config.usoCFDIDefault,
      serie:         config.serieDefault,
      notes:         g.forcedCodigo
        ? `Consolidado: ${g.forcedCodigo}`
        : g.sourceBlocks[0].tituloBloque.trim().slice(0, 200),
      metodoPago:    pickMetodoPago(codigo, mapping),
      // Folios de las remisiones del bloque (para trazabilidad en UI/DB).
      sourceFolios:  g.sourceBlocks.flatMap(b => b.remisiones.map(r => r.folio).filter(f => f && f.length > 0)),
    };

    invoices.push(invoice);
    // Bloque parser warnings + pipeline warnings del grupo, para el confidence check.
    const parserWarnings = g.sourceBlocks.flatMap(b => b.warnings);
    invoiceMeta.push({
      sourceBlocks:  g.sourceBlocks,
      blockWarnings: [...parserWarnings, ...groupWarnings.map(w => w.message)],
    });
  }

  return { invoices, invoiceMeta, skipped, errors, warnings };
}
