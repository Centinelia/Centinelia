/**
 * writer-consumer/report.ts — Contrato del reporte JSON que el Windows agent
 * (billing-contpaqi-writer, Day 8) deposita en `errores/` cuando procesa un
 * archivo pendiente y algo falla.
 *
 * IMPORTANTE: este shape lo produce el writer .NET. Si cambia, hay que
 * sincronizar aquí (buscar `writer-consumer` cross-repo) y en
 * `windows-agent/billing-contpaqi-writer/src/Watch/BatchProcessor.cs`.
 *
 * Dos flavors:
 *   - BatchReport: lote parcialmente fallido (allOk=false + results[]).
 *   - FatalReport: parse falló antes de tocar facturas (fatalKind + fatalMessage).
 */

export type ErrorKind =
  | 'rfcNotFound'
  | 'skuNotFound'
  | 'pacError'
  | 'invalidData'
  | 'catalogAccess'
  | 'other';

export interface InvoiceResult {
  index: number;
  rfc: string;
  ok: boolean;
  serie: string;
  folio: number;
  uuid: string | null;
  timbradoPath: string | null;
  kind: ErrorKind;
  humanMessage: string | null;
  error: string | null;
}

export interface BatchReport {
  sourceFile: string;
  processedAt: string; // ISO UTC
  results: InvoiceResult[];
  allOk: boolean;
}

export interface FatalReport {
  sourceFile: string;
  processedAt: string;
  fatalKind: ErrorKind;
  fatalMessage: string;
  fatalError: string;
}

/** Discriminates by presence of `results` (BatchReport) vs `fatalKind` (FatalReport). */
export function isBatchReport(v: unknown): v is BatchReport {
  return (
    typeof v === 'object' &&
    v !== null &&
    Array.isArray((v as { results?: unknown }).results)
  );
}

export function isFatalReport(v: unknown): v is FatalReport {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as { fatalKind?: unknown }).fatalKind === 'string'
  );
}

/**
 * Parsea un reporte JSON (string) del writer y lo tipa. Devuelve un union
 * discriminado o `null` si el shape es inválido (no crashea — el caller
 * decide si loguear o escalar).
 */
export function parseWriterReport(rawJson: string): BatchReport | FatalReport | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return null;
  }
  if (isBatchReport(parsed)) return parsed;
  if (isFatalReport(parsed)) return parsed;
  return null;
}
