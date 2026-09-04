/**
 * extract.ts -- Vision AI wrapper para extraer datos de notitas de venta manuscritas.
 *
 * Historia:
 *   - v1 (Task 8): 1 foto = 1 notita. ExtractedNote flat.
 *   - v2 (2026-09-03, post-audit): fotos pueden tener múltiples remisiones
 *     apiladas. ExtractedNoteSet con `remisiones: ExtractedRemision[]`.
 *     `ExtractedNote` se preserva como alias de `ExtractedRemision` para
 *     que los callers que solo esperan 1 notita (portal /facturacion-emision)
 *     sigan funcionando via `flattenSingleRemision`.
 *   - v3 (2026-09-04): acepta VisionContext con catálogo del negocio
 *     (clientes conocidos + productos preimpresos con precios). El LLM
 *     coteja el nombre manuscrito contra la lista de clientes y valida
 *     que sum(qty × precio) ≈ total antes de devolver. Sin esto, facturar
 *     al cliente equivocado o por monto equivocado eran riesgos reales
 *     porque la lectura OCR era ambigua.
 *
 * Usa claude-sonnet-4-6 por default (configurable via BILLING_VISION_MODEL).
 */

import Anthropic from '@anthropic-ai/sdk';
import { EXTRACT_NOTE_SYSTEM, EXTRACT_NOTE_USER, buildContextBlock } from './prompt';
import { withBatchedPoolCharge } from '../pool-charge';

const DEFAULT_MODEL = 'claude-sonnet-4-6';

/**
 * Contexto opcional de facturación al pool. Cuando se pasa, cada foto
 * procesada por vision cobra `remisiones.length` ops (batched — vision es
 * UNA sola llamada Anthropic pero puede extraer N remisiones; cobramos por
 * cada una porque cada una consume un slot de trabajo del cliente).
 *
 * Sin este opts, no se cobra — útil para tests + callers legacy que aún
 * no propagan agentId. La memoria feedback_batched_consume_multi_io exige
 * batched-consume; este helper cumple con ese patrón.
 */
export interface BillingChargeOpts {
  agentId:  string;
  /** Identificador del evento origen (email_id, foto hash, request id). */
  referenceId?: string;
  /** Label descriptivo corto para el historial de consumo del cliente. */
  labelPrefix?: string;
}

// ── Shape v2 ─────────────────────────────────────────────────────────────────

export interface ExtractedProduct {
  nombre: string;
  cantidad: number | null;
  unidad: string | null;
  /** Precio unitario preimpreso en la columna P.UNIT, o manuscrito si fue modificado. */
  precio_unitario: number | null;
  /** SKU del catálogo si el LLM lo pudo resolver (v3+). */
  sku_matched: string | null;
}

export interface ExtractedRemision {
  /** Número de folio grande arriba a la derecha (típicamente 4-5 dígitos). */
  folio_remision: string | null;
  cliente_texto: string | null;
  /** RFC o código del cliente si el LLM lo pudo resolver contra el catálogo (v3+). */
  cliente_matched_rfc: string | null;
  fecha: string | null;
  productos: ExtractedProduct[];
  metodo_pago: 'efectivo' | 'transferencia' | 'cheque' | 'tarjeta' | null;
  monto_total: number | null;
  /**
   * Diferencia (en pesos) entre sum(qty × precio) y monto_total, después de
   * que el LLM ajustó las cantidades. Un valor cercano a 0 (± IVA) es señal
   * de que las cantidades cuadran con el total escrito.
   */
  aritmetica_delta: number | null;
  confianza: {
    cliente: number;
    productos: number;
    metodo_pago: number;
    aritmetica: number;
    global: number;
  };
  notas_raw: string;
}

export interface ExtractedNoteSet {
  remisiones: ExtractedRemision[];
  confianza_global: number;
  notas_raw_all: string;
}

/** Alias legacy — un caller que espera 1 notita puede seguir tipando `ExtractedNote`. */
export type ExtractedNote = ExtractedRemision;

// ── Vision context (catálogo del negocio) ────────────────────────────────────

export interface VisionContextClient {
  /** RFC del cliente (13 char persona física, 12 moral). Se usa para resolver el match. */
  rfc: string;
  /** Razón social o nombre comercial como aparecería escrito en la notita. */
  nombre: string;
  /** Nombres alternativos aprendidos previamente (billing_client_rules.aliases). */
  aliases?: string[];
}

export interface VisionContextProduct {
  sku: string;
  /** Descripción como aparece preimpresa en la notita. */
  nombre: string;
  /** Precio unitario canónico del catálogo. */
  precio_unitario: number;
}

export interface VisionContext {
  clientes: VisionContextClient[];
  productos: VisionContextProduct[];
  /** Emisor (dueño del negocio); ayuda al LLM a NO confundirlo con un cliente. */
  emisor?: { nombre?: string; rfc?: string };
}

// ── Vision call ──────────────────────────────────────────────────────────────

/**
 * Extrae UNA o VARIAS remisiones de una foto. Si la foto solo tiene una
 * remisión, `remisiones` será array de 1.
 *
 * Cuando se pasa `context`, el LLM coteja el nombre manuscrito contra el
 * catálogo de clientes (resolviendo a RFC si hay match razonable) y valida
 * que sum(qty × precio_unitario) ≈ monto_total, ajustando cantidades
 * ambiguas si es necesario.
 */
export async function extractRemisionesFromImage(
  imageBuffer: Buffer,
  mimeType: string,
  context?: VisionContext,
  billing?: BillingChargeOpts,
): Promise<ExtractedNoteSet> {
  const doExtract = async (): Promise<ExtractedNoteSet> => {
    const model = process.env.BILLING_VISION_MODEL ?? DEFAULT_MODEL;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // Con contexto de catálogo el prompt crece; damos más presupuesto de output
    // para que el LLM pueda incluir aritmética de reconciliación por remisión.
    const maxTokens = context ? 8192 : 4096;

    const userText = context
      ? `${buildContextBlock(context)}\n\n${EXTRACT_NOTE_USER}`
      : EXTRACT_NOTE_USER;

    // Retry con backoff exponencial para 429 rate limit y 529 overloaded.
    // Sin esto, Beatriz subiendo 20 fotos a la vez podía perder 1-2 por
    // rate limit sin causa útil visible. Auditoría 2026-09-04.
    const response = await callAnthropicWithRetry(() => client.messages.create({
      model,
      max_tokens: maxTokens,
      system: EXTRACT_NOTE_SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                data: imageBuffer.toString('base64'),
              },
            },
            {
              type: 'text',
              text: userText,
            },
          ],
        },
      ],
    }));

    const textBlock = response.content.find((b) => b.type === 'text');
    const raw = textBlock?.type === 'text' ? textBlock.text.trim() : '';

    const parsed = extractFirstJsonObject(raw);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { remisiones?: unknown }).remisiones)) {
      throw new Error('Vision model returned non-JSON or missing remisiones[] array');
    }
    const set = parsed as ExtractedNoteSet;

    // Validar que cualquier cliente_matched_rfc devuelto por el LLM realmente
    // exista en el catálogo. Sin este guard, el LLM podía alucinar un RFC
    // "plausible" que no está en catálogo, y los callers downstream
    // facturarían a RFC inexistente. Auditoría 2026-09-04.
    if (context && context.clientes.length > 0) {
      const validRfcs = new Set(context.clientes.map((c) => c.rfc.trim().toUpperCase()));
      for (const r of set.remisiones) {
        if (r.cliente_matched_rfc) {
          const rfc = r.cliente_matched_rfc.trim().toUpperCase();
          if (!validRfcs.has(rfc)) {
            // Anulamos el match alucinado; caller cae a fuzzy fallback.
            r.cliente_matched_rfc = null;
            if (r.confianza) r.confianza.cliente = Math.min(r.confianza.cliente, 0.3);
          }
        }
      }
    }
    // Igual para sku_matched — no aceptar SKUs que no existen.
    if (context && context.productos.length > 0) {
      const validSkus = new Set(context.productos.map((p) => p.sku));
      for (const r of set.remisiones) {
        for (const p of r.productos) {
          if (p.sku_matched && !validSkus.has(p.sku_matched)) {
            p.sku_matched = null;
          }
        }
      }
    }
    return set;
  };

  // Sin billing opts, no cobramos (dev + tests + callers legacy).
  if (!billing) return doExtract();

  // Con billing: cobramos batched — 1 op por cada remisión que el LLM
  // extrajo. Una foto con 3 remisiones = 3 ops (representan 3 unidades de
  // trabajo que Nala hizo por el cliente). Si el LLM devuelve 0 remisiones,
  // no cobramos (foto ilegible = no hubo trabajo entregable).
  return withBatchedPoolCharge(
    {
      agentId:      billing.agentId,
      source:       'nala_vision_extract',
      reference_id: billing.referenceId,
      label:        billing.labelPrefix ?? 'Leer notita manuscrita',
      context:      `Vision LLM (${DEFAULT_MODEL}) extrajo remisiones de una foto`,
    },
    async () => {
      const result = await doExtract();
      return { count: result.remisiones.length, result };
    },
  );
}

/**
 * Wrapper legacy: extrae una foto y devuelve la primera (y esperada única)
 * remisión. Útil para callers que asumen 1 foto = 1 notita (ej. portal de
 * facturación-emisión, tool `extract_note` del employee cuando el usuario
 * garantiza upload individual).
 *
 * Si la foto tiene múltiples remisiones, tira error para que el caller
 * decida si escalar o iterar. NO devuelve silenciosamente la primera —
 * ese sería un bug silencioso donde se pierden ventas.
 */
export async function extractNoteFromImage(
  imageBuffer: Buffer,
  mimeType: string,
  context?: VisionContext,
  billing?: BillingChargeOpts,
): Promise<ExtractedRemision> {
  const set = await extractRemisionesFromImage(imageBuffer, mimeType, context, billing);
  if (set.remisiones.length === 0) {
    throw new Error('Vision model devolvió 0 remisiones — imagen ilegible o no es una notita');
  }
  if (set.remisiones.length > 1) {
    throw new Error(
      `Vision model detectó ${set.remisiones.length} remisiones en la imagen; ` +
      `usar extractRemisionesFromImage() en lugar de extractNoteFromImage() para procesarlas todas`,
    );
  }
  return set.remisiones[0];
}

// ── JSON helper ──────────────────────────────────────────────────────────────

/**
 * Extrae el primer objeto JSON balanceado de un string. Tolera texto antes o
 * después (código markdown, explicaciones libres). Ignora llaves dentro de
 * strings (respeta escapes).
 */
/**
 * Retry helper para Anthropic: reintenta ante 429 (rate limit) y 529
 * (overloaded) con backoff exponencial. Otras excepciones se propagan
 * inmediato (bugs de request, credenciales, etc.).
 */
async function callAnthropicWithRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 1000,
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = (err as { status?: number })?.status ?? 0;
      const isRetryable = status === 429 || status === 529;
      if (!isRetryable || attempt >= maxAttempts) throw err;
      const delay = baseDelayMs * Math.pow(4, attempt - 1); // 1s, 4s, 16s
      console.warn(`[vision/extract] Anthropic ${status} attempt ${attempt}/${maxAttempts}, retry en ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  // Unreachable but appeases TS.
  throw new Error('callAnthropicWithRetry: unreachable');
}

function extractFirstJsonObject(s: string): unknown | null {
  const first = s.indexOf('{');
  if (first === -1) return null;

  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = first; i < s.length; i++) {
    const c = s[i];
    if (esc) { esc = false; continue; }
    if (inStr) {
      if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(s.slice(first, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}
