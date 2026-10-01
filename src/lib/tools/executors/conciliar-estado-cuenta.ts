// Handler de la tool conciliar_estado_cuenta.
//
// Flow:
//   1. Validar feature flag (bank_reconciliation_enabled)
//   2. Descargar CSV/XLSX del storage path
//   3. Parsear a RawBankTxn[] con autodetect bank + encoding
//   4. Query CFDIs emitidos pendientes de centinelia_billing
//   5. Reconciliar y generar Excel 3 hojas
//   6. Upload Excel + INSERT bank_reconciliations
//   7. Cobrar 1 operación (feedback-batched-consume-multi-io)
//
// La función es "orquestación pura": motor en src/lib/bank/, I/O aquí.
// Testeable con mocks de Supabase (ver __tests__/conciliar-estado-cuenta.test.ts).

import type { createAdminClient } from '@/lib/supabase/admin';
import { parseBankStatementBuffer } from '@/lib/bank/parsers';
import { reconcile } from '@/lib/bank/reconciler';
import type {
  BankSlug, InvoiceCandidate, MatchResult, RawBankTxn,
} from '@/lib/bank/types';
import { CANDIDATE_WINDOW_DAYS } from '@/lib/bank/types';
import { generateExcel, type ExcelSheet } from '@/lib/documents/excel';
import { consumeAiOp } from '@/lib/ai/ops-guard';
import { randomUUID } from 'crypto';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export interface ConciliarInput {
  attachment_storage_path?: unknown;
  bank_hint?: unknown;
}

export interface ConciliarCtx {
  agentId: string;
  portalEmail: string;
  supabase: SupabaseClient;
  channel?: 'voice' | 'chat' | 'email';
}

export interface ConciliarResult {
  ok: boolean;
  error?: string;
  batch_id?: string;
  result_file_path?: string;
  totals?: {
    txns: number;
    auto: number;
    review: number;
    unmatched: number;
  };
  message?: string;
}

const STORAGE_BUCKET = 'agent-files';

export async function runConciliarEstadoCuenta(
  input: ConciliarInput,
  ctx: ConciliarCtx,
): Promise<ConciliarResult> {
  const path = typeof input.attachment_storage_path === 'string' ? input.attachment_storage_path.trim() : '';
  if (!path) {
    return { ok: false, error: 'Falta attachment_storage_path (la ruta del archivo subido al portal o adjunto del correo).' };
  }

  const bankHint = normalizeBankHint(input.bank_hint);
  const { supabase, agentId, portalEmail } = ctx;

  // ── 1. Feature flag + resolve organization_id ──────────────────────────────
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id, bank_reconciliation_enabled')
    .eq('portal_email', portalEmail)
    .maybeSingle();
  if (orgErr || !org) {
    return { ok: false, error: 'No se encontró la organización asociada al portal.' };
  }
  if (!org.bank_reconciliation_enabled) {
    return {
      ok: false,
      error: 'La conciliación bancaria no está activa para este negocio. Pide a Centinelia activarla antes de volver a intentar.',
    };
  }
  const organizationId = org.id as string;

  // ── 2. Descargar archivo ────────────────────────────────────────────────────
  const { data: fileBlob, error: dlErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .download(path);
  if (dlErr || !fileBlob) {
    return { ok: false, error: `No pude descargar el archivo del portal: ${dlErr?.message ?? 'archivo no encontrado'}` };
  }
  const buf = Buffer.from(await fileBlob.arrayBuffer());

  // ── 3. Parse ────────────────────────────────────────────────────────────────
  const parsed = await parseBankStatementBuffer(buf, bankHint);
  if (parsed.bankSlug === 'unknown' || parsed.txns.length === 0) {
    return {
      ok: false,
      error: 'No reconocí el formato del archivo. Soportamos BBVA y Banorte en CSV o XLSX. Si usas otro banco avísanos.',
    };
  }
  if (!parsed.statementPeriodStart || !parsed.statementPeriodEnd) {
    return { ok: false, error: 'El archivo no tiene fechas válidas en los movimientos.' };
  }

  // ── 4. Query CFDIs candidatos ───────────────────────────────────────────────
  const candidates = await fetchInvoiceCandidates(
    supabase,
    organizationId,
    parsed.statementPeriodStart,
    parsed.statementPeriodEnd,
  );

  // ── 5. Reconciliar ──────────────────────────────────────────────────────────
  const results = reconcile(parsed.txns, candidates);
  const totals = countTotals(results);

  // ── 6. Generar Excel 3 hojas + upload ───────────────────────────────────────
  const excelBuf = await buildResultExcel(results, parsed.bankSlug as BankSlug);
  const resultPath = `bank-reconciliations/${organizationId}/${randomUUID()}.xlsx`;
  const { error: upErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(resultPath, excelBuf, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: false,
    });
  if (upErr) {
    return { ok: false, error: `No pude subir el reporte: ${upErr.message}` };
  }

  // ── 7. INSERT batch ─────────────────────────────────────────────────────────
  const { data: inserted, error: insErr } = await supabase
    .from('bank_reconciliations')
    .insert({
      organization_id: organizationId,
      agent_id: agentId,
      processed_by: 'nalu',
      bank_slug: parsed.bankSlug,
      statement_period_start: toIsoDate(parsed.statementPeriodStart),
      statement_period_end: toIsoDate(parsed.statementPeriodEnd),
      source_file_path: path,
      result_file_path: resultPath,
      txns_total: totals.txns,
      txns_matched: totals.auto,
      txns_review: totals.review,
      txns_unmatched: totals.unmatched,
      matches: results.map(serializeMatch),
    })
    .select('id')
    .single();
  if (insErr || !inserted) {
    return { ok: false, error: `No pude registrar el batch: ${insErr?.message ?? 'insert vacío'}` };
  }
  const batchId = inserted.id as string;

  // ── 8. Cobrar 1 op (batched-consume: N txns procesadas = 1 op) ──────────────
  await consumeAiOp(agentId, 1, {
    reason: 'tool_execution',
    reference_id: batchId,
    label: 'conciliación bancaria',
    context: JSON.stringify({
      bank: parsed.bankSlug,
      txns: totals.txns,
      auto: totals.auto,
      review: totals.review,
    }),
  });

  return {
    ok: true,
    batch_id: batchId,
    result_file_path: resultPath,
    totals,
    message: `Procesé ${totals.txns} movimientos: ${totals.auto} con match automático, ${totals.review} para revisar, ${totals.unmatched} sin CFDI pendiente. El reporte está listo en el portal.`,
  };
}

// ── helpers ───────────────────────────────────────────────────────────────────

function normalizeBankHint(raw: unknown): BankSlug | undefined {
  if (raw === 'bbva' || raw === 'banorte') return raw;
  return undefined;
}

async function fetchInvoiceCandidates(
  supabase: SupabaseClient,
  organizationId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<InvoiceCandidate[]> {
  const fromDate = new Date(periodStart.getTime() - CANDIDATE_WINDOW_DAYS.BEFORE * 86400000);
  const toDate = new Date(periodEnd.getTime() + CANDIDATE_WINDOW_DAYS.AFTER * 86400000);

  const { data, error } = await supabase
    .from('centinelia_billing')
    .select('uuid_fiscal, folio, total, fecha_emision, metodo_pago_cfdi, paid_at, cliente_rfc, cliente_razon_social')
    .eq('organization_id', organizationId)
    .eq('type', 'cfdi_emitido')
    .is('paid_at', null)
    .gte('fecha_emision', toIsoDate(fromDate))
    .lte('fecha_emision', toIsoDate(toDate));

  if (error || !data) return [];

  return data.map((row): InvoiceCandidate => ({
    uuid: String(row.uuid_fiscal ?? ''),
    folio: (row.folio as string | null) ?? null,
    total: Number(row.total ?? 0),
    issuedAt: new Date((row.fecha_emision as string) + 'T00:00:00Z'),
    metodoPago: (row.metodo_pago_cfdi as 'PUE' | 'PPD') ?? 'PUE',
    clienteRfc: (row.cliente_rfc as string | null) ?? null,
    clienteNombre: (row.cliente_razon_social as string | null) ?? null,
    paidSoFar: 0,
  }));
}

function countTotals(results: MatchResult[]) {
  const totals = { txns: results.length, auto: 0, review: 0, unmatched: 0 };
  for (const r of results) {
    if (r.status === 'auto') totals.auto++;
    else if (r.status === 'review') totals.review++;
    else totals.unmatched++;
  }
  return totals;
}

function serializeMatch(r: MatchResult) {
  return {
    txn_source_row: r.txnSourceRow,
    txn_date: toIsoDate(r.txn.date),
    txn_amount: r.txn.amount,
    txn_description: r.txn.description,
    cfdi_uuid: r.invoice?.uuid ?? null,
    cfdi_folio: r.invoice?.folio ?? null,
    score: r.score,
    status: r.status,
    reason: r.reason,
    breakdown: r.breakdown,
  };
}

function toIsoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

async function buildResultExcel(results: MatchResult[], bank: BankSlug): Promise<Buffer> {
  const matched: ExcelSheet = {
    name: 'Conciliados',
    headers: ['Fila', 'Fecha', 'Monto', 'Descripción', 'CFDI UUID', 'Folio', 'Score', 'Monto score', 'Fecha score', 'Ref score'],
    rows: results
      .filter((r) => r.status === 'auto')
      .map((r) => [
        r.txnSourceRow,
        toIsoDate(r.txn.date),
        r.txn.amount,
        r.txn.description,
        r.invoice?.uuid ?? '',
        r.invoice?.folio ?? '',
        r.score,
        r.breakdown.amount,
        r.breakdown.date,
        r.breakdown.reference,
      ]),
  };
  const review: ExcelSheet = {
    name: 'Para revisar',
    headers: ['Fila', 'Fecha', 'Monto', 'Descripción', 'CFDI UUID sugerido', 'Folio sugerido', 'Score', 'Razón'],
    rows: results
      .filter((r) => r.status === 'review')
      .map((r) => [
        r.txnSourceRow,
        toIsoDate(r.txn.date),
        r.txn.amount,
        r.txn.description,
        r.invoice?.uuid ?? '',
        r.invoice?.folio ?? '',
        r.score,
        r.reason,
      ]),
  };
  const unmatched: ExcelSheet = {
    name: 'Sin conciliar',
    headers: ['Fila', 'Fecha', 'Monto', 'Descripción', 'Razón'],
    rows: results
      .filter((r) => r.status === 'unmatched')
      .map((r) => [
        r.txnSourceRow,
        toIsoDate(r.txn.date),
        r.txn.amount,
        r.txn.description,
        r.reason,
      ]),
  };
  return await generateExcel([matched, review, unmatched], {
    title: `Conciliación bancaria · ${bank.toUpperCase()}`,
    subtitle: `Generado ${toIsoDate(new Date())}`,
  });
}

// Re-export used only for ensuring the only type uses are reachable in tests.
export type { RawBankTxn } from '@/lib/bank/types';
