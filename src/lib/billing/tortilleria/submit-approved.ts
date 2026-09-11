/**
 * submit-approved.ts — cierra el ciclo Excel → XML para pendings aprobadas.
 *
 * Contexto: el fast-path Excel (`excel-flow.ts`) inserta 1 row en
 * `billing_pending_review` por CFDI derivado. Cuando Beatriz aprueba una card
 * desde el portal (`POST /portal/[token]/billing/pendientes/[id]`), la row
 * queda en `status='approved'` o `'edited_approved'` y el email se re-encola
 * como `process_notes`. Sin este módulo el fast-path detecta rows existentes
 * y sale sin invocar al adapter → el XML nunca llega a Dropbox y CONTPAQi
 * nunca ve la factura. Este módulo cierra ese hueco.
 *
 * Idempotencia: se guarda `xml_path` + `xml_submitted_at` dentro de
 * `extracted` (jsonb ya existente, sin migración). Rows que ya tengan
 * `xml_path` se saltan. El hash SHA256 del XML dentro del adapter ya provee
 * idempotencia adicional al lado de Dropbox — mismo contenido = misma ruta.
 *
 * Corrections (`status='edited_approved'`): si la row trae `corrections`
 * jsonb con `productos`, `rfc_matched`, `fecha`, `metodo_pago`, `uso_cfdi`,
 * `serie` o `forma_pago`, esos overrides se aplican encima de los valores
 * originales. Cualquier campo no presente conserva el valor extraído.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  BillingAdapter,
  BillingInvoice,
  BillingLineItem,
  PaymentMethod,
} from '../adapter';

// ---- Public types ---------------------------------------------------------

export interface SubmitApprovedInput {
  portalEmail: string;
  emailId:     string;
  adapter:     BillingAdapter;
  supabase:    SupabaseClient;
}

export interface SubmittedPending {
  pendingId: string;
  xmlPath:   string;
  clientRFC: string;
  total:     number;
}

export interface SubmitApprovedResult {
  /** Pendings encontradas en estado approved/edited_approved sin xml_path. */
  candidateCount: number;
  /** Pendings efectivamente enviadas al adapter en esta invocación. */
  submitted: SubmittedPending[];
  /** Pendings que quedaron omitidas por datos insuficientes. */
  skipped: Array<{ pendingId: string; reason: string }>;
  /** Errores no fatales durante el submit (una row por error). */
  errors: Array<{ pendingId?: string; reason: string }>;
}

// ---- Internal types -------------------------------------------------------

interface PendingRow {
  id:            string;
  status:        string;
  productos:     unknown;
  rfc_matched:   string | null;
  fecha:         string | null;
  extracted:     Record<string, unknown> | null;
  corrections:   Record<string, unknown> | null;
}

// ---- Helpers --------------------------------------------------------------

function isProductoArray(v: unknown): v is Array<Record<string, unknown>> {
  return Array.isArray(v) && v.every((x) => typeof x === 'object' && x !== null);
}

/**
 * Convierte el array `productos` (formato en DB, ver excel-flow.ts:141) en
 * BillingLineItem[]. Tolerante a llaves alternativas por si vienen de
 * corrections con nombres humanos ("cantidad" en vez de "qty", etc).
 */
interface ProductRejected { sku: string; reason: string; }

function productsToLines(raw: unknown): { lines: BillingLineItem[]; rejected: ProductRejected[] } {
  const rejected: ProductRejected[] = [];
  if (!isProductoArray(raw)) return { lines: [], rejected };
  const lines: BillingLineItem[] = [];
  for (const p of raw) {
    const sku = String(p['sku'] ?? p['SKU'] ?? '').trim();
    const desc = String(p['description'] ?? p['descripcion'] ?? p['nombre'] ?? '').trim();
    if (!sku) {
      // Sin SKU no podemos timbrar. Falla loud (no silent skip como antes).
      rejected.push({ sku: '(sin sku)', reason: `Producto "${desc || 'sin descripción'}" no tiene SKU. Agrégalo o quítalo antes de aprobar.` });
      continue;
    }
    const qty = Number(p['qty'] ?? p['cantidad'] ?? p['cant'] ?? 0);
    const unitPrice = Number(
      p['unitPrice'] ?? p['precio'] ?? p['precio_unitario'] ?? p['p_unit'] ?? 0,
    );
    if (!Number.isFinite(qty) || qty <= 0) {
      rejected.push({ sku, reason: `SKU ${sku}: cantidad inválida (${qty}).` });
      continue;
    }
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      rejected.push({ sku, reason: `SKU ${sku}: precio inválido (${unitPrice}).` });
      continue;
    }
    const ivaRaw = p['ivaTasa'] ?? p['iva_tasa'] ?? 0;
    const ivaTasa = Number(ivaRaw);
    lines.push({
      sku,
      qty,
      unitPrice,
      ivaTasa:     Number.isFinite(ivaTasa) ? ivaTasa : 0,
      ...(desc ? { description: desc } : {}),
    });
  }
  return { lines, rejected };
}

const VALID_PAYMENT_METHODS = new Set<PaymentMethod>([
  'efectivo', 'transferencia', 'cheque', 'tarjeta',
]);

function coercePaymentMethod(v: unknown): PaymentMethod {
  if (typeof v === 'string' && VALID_PAYMENT_METHODS.has(v as PaymentMethod)) {
    return v as PaymentMethod;
  }
  return 'transferencia';
}

function coerceMetodoPago(v: unknown): 'PUE' | 'PPD' {
  return v === 'PPD' ? 'PPD' : 'PUE';
}

/**
 * Aplica overrides de corrections sobre los campos base de la pending.
 * `corrections` es opt-in y parcial: solo las llaves presentes se aplican.
 *
 * Regla de precedencia unificada: `corrections` gana SIEMPRE si la llave está
 * presente (incluso con valor null/vacío). Si la llave falta, cae al valor
 * base (`extracted` o columna directa). Esto evita ambigüedad entre "Beatriz
 * borró intencionalmente" vs "Beatriz no tocó el campo".
 */
function buildInvoice(row: PendingRow): { invoice: BillingInvoice | null; reason?: string } {
  const extracted = row.extracted ?? {};
  const corrections = row.corrections ?? {};

  // Merge unificado: extracted + corrections (corrections gana por presencia
  // de llave, no por truthiness).
  const merged: Record<string, unknown> = { ...extracted };
  for (const key of Object.keys(corrections)) {
    merged[key] = corrections[key];
  }

  // Productos: corrections gana si la llave está presente. Si no, usa el
  // productos de columna directa (row.productos) que es el fallback legacy.
  const productosSrc = 'productos' in corrections ? corrections['productos'] : row.productos;
  const { lines, rejected } = productsToLines(productosSrc);
  if (lines.length === 0) {
    const detail = rejected.length > 0 ? ` — ${rejected[0].reason}` : '';
    return { invoice: null, reason: `sin líneas facturables (productos vacío o inválido)${detail}` };
  }
  // Si algunas líneas se rechazaron pero otras pasaron, reportamos el problema
  // sin bloquear. El caller decidirá con base en la reason.
  if (rejected.length > 0) {
    return {
      invoice: null,
      reason:  `Hay ${rejected.length} producto(s) con problema: ${rejected.map(r => r.reason).join('; ').slice(0, 300)}. Corrige antes de aprobar.`,
    };
  }

  // RFC: usa el merged (corrections gana), luego fallback a columna directa.
  const rfcFromMerged =
    (typeof merged['rfc_matched'] === 'string' && (merged['rfc_matched'] as string).trim()) ||
    (typeof merged['rfc'] === 'string' && (merged['rfc'] as string).trim()) || '';
  const rfc = rfcFromMerged || (typeof row.rfc_matched === 'string' && row.rfc_matched.trim()) || '';
  if (!rfc) {
    return { invoice: null, reason: 'falta RFC del cliente' };
  }
  // Guard: no timbrar con "RFC" que en realidad es un código de cliente. Esto
  // pasaría si Beatriz aprueba una card en revisión sin corregir el RFC — el
  // adapter lo rechazaría o (peor) generaría un CFDI inválido.
  if (!/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i.test(rfc)) {
    return {
      invoice: null,
      reason:  `RFC "${rfc}" no tiene formato válido (12-13 caracteres SAT). Actualiza el RFC en la card antes de aprobar.`,
    };
  }

  // Fecha: merged (corrections gana) > row.fecha > hoy. Preserva YYYY-MM-DD.
  const fechaRaw =
    (typeof merged['fecha'] === 'string' && (merged['fecha'] as string)) ||
    row.fecha ||
    new Date().toISOString().slice(0, 10);

  // notes → <Observaciones> del CFDI (visible al cliente). Ramón Leang lo
  // usa (Beatriz PV escribe en la columna Observaciones del Excel y llega
  // verbatim). Tortillería OG lo llenaba con trazabilidad interna
  // ("Consolidado: DCA" / tituloBloque) que ahora se filtraría. Distinguimos
  // por origin: ramon_leang_pipeline confía en extracted.notes; el resto solo
  // emite si hay un extracted.customer_notes explícito.
  const origin = typeof extracted['origin'] === 'string' ? extracted['origin'] : undefined;
  const rawNotes = typeof extracted['notes'] === 'string' ? extracted['notes'] : undefined;
  const explicitCustomer = typeof extracted['customer_notes'] === 'string'
    ? extracted['customer_notes']
    : undefined;
  const invoiceNotes = explicitCustomer
    ?? (origin === 'ramon_leang_pipeline' ? rawNotes : undefined);

  const invoice: BillingInvoice = {
    clientRFC:     rfc,
    date:          fechaRaw.slice(0, 10),
    lines,
    paymentMethod: coercePaymentMethod(merged['forma_pago']),
    usoCFDI:       String(merged['uso_cfdi'] ?? 'G03'),
    serie:         String(merged['serie'] ?? 'T'),
    metodoPago:    coerceMetodoPago(merged['metodo_pago']),
    notes:         invoiceNotes,
  };
  return { invoice };
}

// ---- Public API -----------------------------------------------------------

/**
 * Procesa todas las pendings approved/edited_approved de un email que aún no
 * tengan XML emitido. Llama al adapter una vez por pending (1 CFDI = 1 XML =
 * 1 archivo en Dropbox), persiste el path retornado en `extracted.xml_path`.
 *
 * No hace throw: cualquier error se acumula en `errors` para que la caller
 * decida cómo reportar. Retorna aun cuando 0 pendings estén approved.
 */
export async function submitApprovedForEmail(
  input: SubmitApprovedInput,
): Promise<SubmitApprovedResult> {
  const result: SubmitApprovedResult = {
    candidateCount: 0,
    submitted:      [],
    skipped:        [],
    errors:         [],
  };

  const { data: rows, error } = await input.supabase
    .from('billing_pending_review')
    .select('id, status, productos, rfc_matched, fecha, extracted, corrections')
    .eq('portal_email', input.portalEmail)
    .eq('email_id', input.emailId)
    .in('status', ['approved', 'edited_approved']);

  if (error) {
    result.errors.push({ reason: `query billing_pending_review: ${error.message}` });
    return result;
  }

  const candidates = (rows as PendingRow[] | null ?? []).filter((r) => {
    const xmlPath = r.extracted?.['xml_path'];
    return !(typeof xmlPath === 'string' && xmlPath.length > 0);
  });
  result.candidateCount = candidates.length;
  if (candidates.length === 0) return result;

  for (const row of candidates) {
    const { invoice, reason } = buildInvoice(row);
    if (!invoice) {
      result.skipped.push({ pendingId: row.id, reason: reason ?? 'buildInvoice retornó null' });
      continue;
    }

    // Claim atómico: marca extracted.submit_started_at si no hay claim vigente
    // ni xml_path. Si retorna vacío, otro worker ya la reclamó o ya terminó
    // (race window entre el SELECT arriba y este UPDATE). p_stale_seconds=300
    // (5 min) trata como zombie a claims que llevan más de eso (worker killed
    // mid-run por Vercel timeout).
    const { data: claimed, error: claimErr } = await input.supabase
      .rpc('claim_pending_for_submit', { p_id: row.id, p_stale_seconds: 300 }) as
        { data: Array<{ id: string; extracted: Record<string, unknown> }> | null; error: { message: string } | null };
    if (claimErr) {
      result.errors.push({ pendingId: row.id, reason: `claim_pending_for_submit: ${claimErr.message}` });
      continue;
    }
    if (!claimed || claimed.length === 0) {
      // Otro worker ya la tiene o la row cambió entre el SELECT y el claim.
      result.skipped.push({ pendingId: row.id, reason: 'ya reclamada por otro worker o ya sometida' });
      continue;
    }
    const claimedExtracted = claimed[0].extracted ?? {};

    let batchResult;
    try {
      batchResult = await input.adapter.submitInvoiceBatch([invoice]);
    } catch (submitErr) {
      const msg = submitErr instanceof Error ? submitErr.message : String(submitErr);
      result.errors.push({ pendingId: row.id, reason: `adapter.submitInvoiceBatch: ${msg}` });
      // Best-effort: liberar el claim para que el retry no espere 5 min por el
      // TTL de zombie. Si falla, el TTL lo maneja.
      await releaseClaim(input.supabase, row.id, claimedExtracted).catch(() => {});
      continue;
    }

    if (batchResult.errors.length > 0) {
      const msg = batchResult.errors.map((e) => e.reason).join('; ');
      result.errors.push({ pendingId: row.id, reason: `adapter reported errors: ${msg}` });
      await releaseClaim(input.supabase, row.id, claimedExtracted).catch(() => {});
      continue;
    }

    const xmlPath = Array.isArray(batchResult.ref) ? batchResult.ref[0] : batchResult.ref;
    if (!xmlPath) {
      result.errors.push({ pendingId: row.id, reason: 'adapter no retornó path del XML' });
      await releaseClaim(input.supabase, row.id, claimedExtracted).catch(() => {});
      continue;
    }

    const total = invoice.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
    const nextExtracted = {
      ...claimedExtracted,
      xml_path:         xmlPath,
      xml_submitted_at: new Date().toISOString(),
    };
    const { error: updErr } = await input.supabase
      .from('billing_pending_review')
      .update({ extracted: nextExtracted })
      .eq('id', row.id);
    if (updErr) {
      // El XML ya está en Dropbox — pero no pudimos marcar la row. En el próximo
      // run, la RPC de claim detectará que xml_path sigue null y submit_started_at
      // es reciente (< 5 min), y devolverá empty → NO se re-submitea inmediato.
      // Cuando el TTL expire (5 min), el retry va (adapter idempotente por hash
      // devuelve el mismo path, la UPDATE persiste esta vez).
      result.errors.push({
        pendingId: row.id,
        reason:    `XML escrito a ${xmlPath} pero update DB falló: ${updErr.message}. Retry en ~5min.`,
      });
      continue;
    }

    result.submitted.push({
      pendingId: row.id,
      xmlPath,
      clientRFC: invoice.clientRFC,
      total:     Math.round(total * 100) / 100,
    });
  }

  return result;
}

/**
 * Libera el claim (borra extracted.submit_started_at) para permitir retry
 * inmediato en la próxima corrida sin esperar el TTL de 5 min. Se llama
 * cuando el submit falló ANTES de escribir el XML — no hay side-effect
 * externo que preservar.
 */
async function releaseClaim(
  supabase: SupabaseClient,
  rowId: string,
  extracted: Record<string, unknown>,
): Promise<void> {
  const next = { ...extracted };
  delete next['submit_started_at'];
  await supabase
    .from('billing_pending_review')
    .update({ extracted: next })
    .eq('id', rowId);
}
