/**
 * Auto-templatize: convierte un .docx pre-lleno (con datos hardcoded) en un
 * template docxtemplater-ready con {{placeholders}}, sin que el usuario tenga
 * que editarlo manualmente.
 *
 * Flujo:
 *   1. Extraer texto del docx con mammoth
 *   2. Pedirle a Sonnet que identifique CADA valor con su rol semántico
 *   3. Aplicar reemplazos en el XML del docx:
 *      - Single-run: replaceText(from → {{placeholder}})
 *      - Multi-run:  rewriteParagraph(>needle< → {{placeholder}})
 *   4. Detectar la fila de items (por clave_prodserv u otro valor único),
 *      reescribir sus celdas con placeholders y envolver con {{#items}}...{{/items}}
 *   5. Eliminar filas hermanas post-loop (ejemplos hardcoded del sample)
 */

import PizZip from 'pizzip';
import mammoth from 'mammoth';
import Anthropic from '@anthropic-ai/sdk';
import { logLlmCall } from '@/lib/observability/llm-log';

export type DocType = 'factura' | 'orden' | 'cotizacion' | 'nota_venta';

export interface IdentifiedField {
  key:        string;
  value:      string;
  method:     'single_run' | 'multi_run_paragraph' | 'item_row_cell';
  applied:    boolean;
}

export interface AutoTemplatizeResult {
  ok:              boolean;
  docxBuffer:      Buffer;
  placeholders:    string[];
  identifiedFields: IdentifiedField[];
  llmRawResponse?: string;
  error?:          string;
}

// ── LLM prompts per doc type ────────────────────────────────────────────────

interface ItemSchema {
  descripcion:     string;
  cantidad:        string;
  precio_unitario: string;
  importe:         string;
  clave_unidad?:   string;
  clave_prodserv?: string;
  descuento?:      string;
  unidad?:         string;
  cliente_equipo?: string;
}

interface LLMResult {
  // Comunes
  folio?:             string;
  fecha?:             string;
  subtotal?:          string;
  iva?:               string;
  total?:             string;
  total_letras?:      string;
  condiciones_pago?:  string;
  // Facturas
  cliente_nombre?:    string;
  cliente_rfc?:       string;
  cliente_email?:     string;
  cliente_direccion?: string;
  // Órdenes
  proveedor_nombre?:  string;
  proveedor_rfc?:     string;
  proveedor_email?:   string;
  terminos_entrega?:  string;
  // Nota venta
  forma_pago?:        string;
  // Items array — SOLO el primer item (representa el schema de la fila)
  first_item?:        ItemSchema;
}

const PROMPTS: Record<DocType, string> = {
  factura: `Eres un experto en documentos fiscales mexicanos (CFDI 4.0). Analiza el siguiente texto extraído de una FACTURA y devuelve JSON puro (sin markdown, sin explicaciones) con los valores literales que encuentres.

Campos a identificar (usa null si no aparece):
- cliente_nombre: razón social del RECEPTOR (NO del emisor)
- cliente_rfc: RFC del receptor (formato XAXX010101000)
- cliente_email: correo del receptor si aparece
- cliente_direccion: dirección completa del receptor en 1 línea
- folio: número de factura del emisor (NO el folio fiscal UUID, NO el timbre SAT)
- fecha: fecha de emisión de la factura (formato tal como aparece)
- subtotal: monto del subtotal (formato tal como aparece, ej. "66,358.76")
- iva: monto del IVA
- total: monto total
- total_letras: el total escrito con palabras (ej. "SETENTA Y SEIS MIL...")
- condiciones_pago: condiciones textuales (ej. "CREDITO", "30 dias")
- first_item: primer concepto de la tabla con: descripcion, cantidad, precio_unitario, importe. Si tiene clave_unidad, clave_prodserv o descuento, inclúyelos.

IMPORTANTE:
- Devuelve los valores EXACTAMENTE como aparecen en el texto (mismos números, mismas comas, misma capitalización).
- NO inventes valores. Si no encuentras el campo, pon null.
- Distingue emisor de receptor. El emisor es el negocio que EMITE la factura, el receptor es el cliente que la RECIBE.
- Para first_item, toma solo el PRIMER renglón de la tabla de conceptos.`,

  orden: `Eres un experto en órdenes de compra corporativas. Analiza el siguiente texto de una ORDEN DE COMPRA y devuelve JSON puro con los valores literales.

Campos a identificar (null si no aparece):
- proveedor_nombre: razón social del PROVEEDOR (a quién le compra el negocio)
- proveedor_rfc: RFC del proveedor si aparece
- proveedor_email: correo del proveedor si aparece
- folio: número de la OC (ej. "6622", "PO-1234")
- fecha: fecha de emisión
- subtotal, iva (si aplica), total
- condiciones_pago: (ej. "30 dias", "Contado", "Crédito")
- terminos_entrega: (ej. "Entrega en 5 días hábiles")
- first_item: primer renglón de la tabla con descripcion, cantidad, precio_unitario, importe. Incluye clave_unidad, clave_prodserv, cliente_equipo, unidad, descuento si existen.

IMPORTANTE:
- Devuelve valores EXACTAMENTE como aparecen.
- Distingue EMISOR (el negocio que hace la OC) del PROVEEDOR (a quien le compra).
- Para first_item, solo la PRIMERA fila de la tabla de items.`,

  cotizacion: `Eres un experto en cotizaciones comerciales. Analiza el texto de una COTIZACIÓN y devuelve JSON puro.

Campos (null si no aparece):
- cliente_nombre, cliente_rfc, cliente_email, cliente_direccion
- folio (número de cotización), fecha
- subtotal, iva, total
- condiciones_pago (ej. "50% anticipo, 50% al entregar")
- first_item: primer concepto con descripcion, cantidad, precio_unitario, importe.

Devuelve valores EXACTAMENTE como aparecen. No inventes.`,

  nota_venta: `Eres un experto en notas de venta / recibos. Analiza el texto y devuelve JSON puro.

Campos (null si no aparece):
- cliente_nombre, cliente_email
- folio (número de nota), fecha
- subtotal, iva, total
- forma_pago (ej. "Efectivo", "Transferencia")
- first_item: primer concepto con descripcion, cantidad, precio_unitario, importe.

Devuelve valores EXACTAMENTE como aparecen. No inventes.`,
};

// ── Helpers para manipular el XML del docx ─────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Reemplaza una substring que vive completa dentro de un solo <w:t>...</w:t>. */
function replaceInSingleRun(xml: string, from: string, to: string): { xml: string; count: number } {
  let count = 0;
  const re = new RegExp(`(<w:t[^>]*>)([^<]*?)${escapeRegex(from)}([^<]*?)(<\\/w:t>)`, 'g');
  const out = xml.replace(re, (_, o, pre, post, c) => { count++; return `${o}${pre}${to}${post}${c}`; });
  return { xml: out, count };
}

/**
 * Cuando `needle` está split entre runs (ej. "Coil" + "Cleaner" + "Porrón" en <w:r> distintos),
 * usa un substring del XML tipo ">Coil<" que SÍ esté completo en un <w:t>. Luego reescribe
 * TODO el <w:p> que contenga ese fragmento, preservando <w:pPr> pero colapsando runs a uno
 * solo con el placeholder.
 */
function rewriteFirstParagraphMatching(xml: string, xmlSubstr: string, placeholder: string): { xml: string; hit: boolean } {
  let hit = false;
  const out = xml.replace(/<w:p\b[^>]*>(?:(?!<w:p\b)[\s\S])*?<\/w:p>/g, (para) => {
    if (hit) return para;
    if (!para.includes(xmlSubstr)) return para;
    hit = true;
    const pPr     = para.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] ?? '';
    const openTag = para.match(/<w:p\b[^>]*>/)?.[0] ?? '<w:p>';
    return `${openTag}${pPr}<w:r><w:t xml:space="preserve">${placeholder}</w:t></w:r></w:p>`;
  });
  return { xml: out, hit };
}

/**
 * Intenta aplicar un reemplazo: primero como single-run. Si falla, prueba como
 * multi-run usando el primer word del value (que probablemente esté en su propio <w:t>).
 */
function smartReplace(xml: string, value: string, placeholder: string): { xml: string; method: IdentifiedField['method']; applied: boolean } {
  // Intento 1: single-run replacement
  const single = replaceInSingleRun(xml, value, placeholder);
  if (single.count > 0) return { xml: single.xml, method: 'single_run', applied: true };

  // Intento 2: multi-run — usa el primer word del value con pattern >WORD<
  const firstWord = value.trim().split(/[\s|]/)[0]?.slice(0, 30);
  if (firstWord && firstWord.length >= 3) {
    const substr = `>${firstWord}<`;
    const para = rewriteFirstParagraphMatching(xml, substr, placeholder);
    if (para.hit) return { xml: para.xml, method: 'multi_run_paragraph', applied: true };
  }

  return { xml, method: 'single_run', applied: false };
}

/**
 * Encuentra la fila <w:tr> que contiene un valor único del primer item (ej. su
 * clave_prodserv o su cantidad+precio_unitario combinados) y reescribe sus celdas
 * con placeholders, luego wrapea con {{#items}}...{{/items}} y borra las filas
 * hermanas post-loop (ejemplos del sample).
 */
function templatizeItemRow(xml: string, item: ItemSchema, docType: DocType): { xml: string; wrapped: boolean } {
  // Necesitamos un needle único para encontrar la fila. Preferencia:
  //   1. clave_prodserv (si existe, casi siempre único como "82101507")
  //   2. descripcion (primer word)
  //   3. combinación cantidad+precio_unitario (menos único)
  const needleCandidates = [
    item.clave_prodserv,
    item.descripcion?.trim().split(/\s+/)[0],
  ].filter((s): s is string => !!s && s.length >= 3);
  if (needleCandidates.length === 0) return { xml, wrapped: false };

  let row: string | null = null;
  let rowRe: RegExp | null = null;
  for (const n of needleCandidates) {
    const re = new RegExp(`<w:tr\\b[^>]*>(?:(?!<w:tr\\b)[\\s\\S])*?${escapeRegex(n)}(?:(?!<w:tr\\b)[\\s\\S])*?<\\/w:tr>`);
    const m = xml.match(re);
    if (m) { row = m[0]; rowRe = re; break; }
  }
  if (!row || !rowRe) return { xml, wrapped: false };

  let newRow = row;

  // Reemplazar cada campo del item dentro de la fila
  const cellReplacements: Array<[string | undefined, string]> = [
    [item.clave_prodserv, '{{clave_prodserv}}'],
    [item.clave_unidad,   '{{clave_unidad}}'],
    [item.cliente_equipo, '{{cliente_equipo}}'],
    [item.descuento,      '{{descuento}}'],
    [item.unidad,         '{{unidad}}'],
    [item.cantidad,       '{{cantidad}}'],
    [item.precio_unitario,'{{precio_unitario}}'],
    [item.importe,        '{{importe}}'],
  ];
  for (const [val, ph] of cellReplacements) {
    if (!val) continue;
    // Single run first
    const s = replaceInSingleRun(newRow, val, ph);
    if (s.count > 0) { newRow = s.xml; continue; }
    // Multi-run: use first word
    const first = val.trim().split(/\s+/)[0];
    if (first && first.length >= 3) {
      const substr = `>${first}<`;
      // Manual rewrite inside row only
      let hit = false;
      newRow = newRow.replace(/<w:p\b[^>]*>(?:(?!<w:p\b)[\s\S])*?<\/w:p>/g, (para) => {
        if (hit || !para.includes(substr)) return para;
        hit = true;
        const pPr     = para.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] ?? '';
        const openTag = para.match(/<w:p\b[^>]*>/)?.[0] ?? '<w:p>';
        return `${openTag}${pPr}<w:r><w:t xml:space="preserve">${ph}</w:t></w:r></w:p>`;
      });
    }
  }

  // Descripcion: si no se aplicó como single-run, intentar multi-run
  if (item.descripcion && !newRow.includes('{{descripcion}}')) {
    const first = item.descripcion.trim().split(/\s+/)[0];
    if (first && first.length >= 3) {
      let hit = false;
      const substr = `>${first}<`;
      newRow = newRow.replace(/<w:p\b[^>]*>(?:(?!<w:p\b)[\s\S])*?<\/w:p>/g, (para) => {
        if (hit || !para.includes(substr)) return para;
        hit = true;
        const pPr     = para.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] ?? '';
        const openTag = para.match(/<w:p\b[^>]*>/)?.[0] ?? '<w:p>';
        return `${openTag}${pPr}<w:r><w:t xml:space="preserve">{{descripcion}}</w:t></w:r></w:p>`;
      });
    }
  }

  // Wrap con {{#items}}...{{/items}}. IMPORTANTE: <w:t\b (no matchear <w:tcW>)
  newRow = newRow.replace(/(<w:tc\b[^>]*>[\s\S]*?<w:t\b[^>]*>)/, '$1{{#items}}');
  newRow = newRow.replace(/(<w:t\b[^>]*>[^<]*?)(<\/w:t>(?:(?!<w:t\b)[\s\S])*<\/w:tr>)/, '$1{{/items}}$2');

  xml = xml.replace(rowRe, newRow);

  // Eliminar filas hermanas post-loop dentro de la misma <w:tbl>
  xml = xml.replace(/<w:tbl\b[^>]*>[\s\S]*?<\/w:tbl>/g, (tbl) => {
    if (!tbl.includes('{{#items}}')) return tbl;
    let seenLoop = false;
    return tbl.replace(/<w:tr\b[^>]*>(?:(?!<w:tr\b)[\s\S])*?<\/w:tr>/g, (tr) => {
      const isLoopRow = tr.includes('{{#items}}') || tr.includes('{{/items}}');
      if (isLoopRow) { seenLoop = true; return tr; }
      if (!seenLoop) return tr;
      return '';
    });
  });

  return { xml, wrapped: true };
}

// ── CFDI-specific cleanup (deletes SAT-stamped stuff that Centinelia can't produce) ─
const CFDI_DELETE_FRAGMENTS = [
  'Cadena Original del Complemento',
  'Sello Digital',
  'Certificado SAT',
  'Fecha de certificación',
  'Folio Fiscal',
];

function deleteParagraphsContaining(xml: string, needle: string): string {
  return xml.replace(/<w:p\b[^>]*>(?:(?!<w:p\b)[\s\S])*?<\/w:p>/g, (p) => (p.includes(needle) ? '' : p));
}

// ── Main entry point ────────────────────────────────────────────────────────

export async function autoTemplatize(
  docxBuffer: Buffer,
  docType:    DocType,
): Promise<AutoTemplatizeResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, docxBuffer, placeholders: [], identifiedFields: [], error: 'ANTHROPIC_API_KEY no configurada.' };
  }

  // 1. Extract text with mammoth
  let text = '';
  try {
    text = (await mammoth.extractRawText({ buffer: docxBuffer })).value;
  } catch (err) {
    return { ok: false, docxBuffer, placeholders: [], identifiedFields: [], error: `No pude leer el docx: ${String(err)}` };
  }
  if (text.trim().length < 30) {
    return { ok: false, docxBuffer, placeholders: [], identifiedFields: [], error: 'El documento tiene poco texto (¿tal vez es imagen?). Sube uno con texto real.' };
  }

  // 2. Call Sonnet to identify field values
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let llmRaw = '';
  let parsed: LLMResult | null = null;
  const __t = Date.now();
  const __m = 'claude-sonnet-4-5-20250929';
  try {
    const res = await client.messages.create({
      model:      __m,
      max_tokens: 1500,
      messages:   [{ role: 'user', content: `${PROMPTS[docType]}\n\nDOCUMENTO:\n${text.slice(0, 8000)}\n\nResponde SOLO con JSON válido.` }],
    });
    void logLlmCall({ source: 'auto_templatize', model: __m, usage: res.usage, latencyMs: Date.now() - __t, meta: { docType } });
    llmRaw = res.content[0]?.type === 'text' ? res.content[0].text.trim() : '';
    const match = llmRaw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Sonnet no devolvió JSON');
    parsed = JSON.parse(match[0]) as LLMResult;
  } catch (err) {
    void logLlmCall({ source: 'auto_templatize', model: __m, usage: { input_tokens: 0, output_tokens: 0 }, latencyMs: Date.now() - __t, error: err instanceof Error ? err.message : String(err), meta: { docType } });
    return { ok: false, docxBuffer, placeholders: [], identifiedFields: [], llmRawResponse: llmRaw, error: `LLM falló: ${String(err)}` };
  }

  // 3. Apply replacements
  const zip = new PizZip(docxBuffer);
  let xml = zip.files['word/document.xml']!.asText();

  // 3a. CFDI cleanup (siempre — para facturas y también inofensivo para otros)
  for (const frag of CFDI_DELETE_FRAGMENTS) xml = deleteParagraphsContaining(xml, frag);
  // Also delete UUIDs (formato CFDI: 8-4-4-4-12 hex chars)
  xml = xml.replace(/<w:p\b[^>]*>(?:(?!<w:p\b)[\s\S])*?<\/w:p>/g, (p) => {
    return /[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/i.test(p) ? '' : p;
  });

  // 3b. Field replacements
  const fields: IdentifiedField[] = [];
  const fieldMap: Array<[keyof LLMResult, string]> = [
    ['folio',              '{{folio}}'],
    ['fecha',              '{{fecha}}'],
    ['cliente_nombre',     '{{cliente_nombre}}'],
    ['cliente_rfc',        '{{cliente_rfc}}'],
    ['cliente_email',      '{{cliente_email}}'],
    ['cliente_direccion',  '{{cliente_direccion}}'],
    ['proveedor_nombre',   '{{proveedor_nombre}}'],
    ['proveedor_rfc',      '{{proveedor_rfc}}'],
    ['proveedor_email',    '{{proveedor_email}}'],
    ['condiciones_pago',   '{{condiciones_pago}}'],
    ['terminos_entrega',   '{{terminos_entrega}}'],
    ['forma_pago',         '{{forma_pago}}'],
    ['total_letras',       '{{total_letras}}'],
    // Currency values last (subtotal/iva/total pueden aparecer varias veces)
    ['subtotal',           '{{subtotal}}'],
    ['iva',                '{{iva}}'],
    ['total',              '{{total}}'],
  ];
  for (const [key, ph] of fieldMap) {
    const value = parsed[key];
    if (typeof value !== 'string' || !value.trim()) continue;
    const r = smartReplace(xml, value, ph);
    fields.push({ key: String(key), value, method: r.method, applied: r.applied });
    if (r.applied) xml = r.xml;
  }

  // 3c. Item row wrapping
  if (parsed.first_item) {
    const r = templatizeItemRow(xml, parsed.first_item, docType);
    if (r.wrapped) {
      xml = r.xml;
      // Record item fields as applied
      for (const [k, v] of Object.entries(parsed.first_item)) {
        if (typeof v === 'string' && v.trim()) {
          fields.push({ key: `item.${k}`, value: v, method: 'item_row_cell', applied: true });
        }
      }
    } else {
      fields.push({ key: 'items', value: JSON.stringify(parsed.first_item).slice(0, 100), method: 'item_row_cell', applied: false });
    }
  }

  // 4. Save
  zip.file('word/document.xml', xml);
  const out = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });

  const placeholders = Array.from(new Set(xml.match(/\{\{[^}]+\}\}/g) ?? [])).sort();
  return { ok: true, docxBuffer: out, placeholders, identifiedFields: fields, llmRawResponse: llmRaw };
}
