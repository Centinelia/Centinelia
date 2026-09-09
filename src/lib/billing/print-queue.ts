/**
 * print-queue.ts — encolado de trabajos de impresión de CFDIs via Dropbox.
 *
 * Contexto: Beatriz eventualmente pedirá "imprime la factura X". La impresora
 * está en la red local de la Tortillería, no accesible desde el server. La
 * única pieza que sí ve la impresora es el Windows Writer (misma máquina).
 *
 * Contract con el Writer (post-piloto):
 *
 *   Nala (server) → escribe JSON job a
 *     /{basePath}/print_queue/{YYYY}/{MM}/{ts}_{ref}.json
 *
 *   Writer local:
 *     1. Poll cada N segundos /{basePath}/print_queue/**\/*.json (recursivo)
 *     2. Lee el JSON, resuelve el CFDI en CONTPAQi por folio/UUID
 *     3. Exporta PDF (CONTPAQi API nativa)
 *     4. Manda al print spooler local (default o `printer_name` del job)
 *     5. Mueve el job a /{basePath}/print_queue/done/{ts}_{ref}.json con
 *        campos añadidos: printed_at, printer_used, status ("ok" | "error"),
 *        error_message si aplica.
 *
 * MVP intencionalmente delgado: sin persistencia en DB, sin cola distribuida.
 * Es un archivo JSON en Dropbox. El Writer local es el único consumer y
 * agrega idempotencia con el filename ({ts}_{ref} es único por request).
 */

import type { DropboxClient } from './storage/dropbox';
import type { LocalFilesStorage } from './storage/local-files';

type FileStorage = Pick<DropboxClient, 'writeFile'> | LocalFilesStorage;

/** Referencia a un CFDI a imprimir. Se pasa lo que se sepa; el Writer resuelve. */
export interface CfdiPrintRef {
  /** UUID SAT (128 chars). El más preciso. */
  uuid?: string;
  /** Serie + folio (ej. "FTEN-1234"). Ambos requeridos si UUID no viene. */
  serie?: string;
  folio?: string;
  /** RFC receptor + rango de fechas como fallback si folio no está. */
  clienteRfc?:  string;
  fechaDesde?:  string;
  fechaHasta?:  string;
}

export interface EnqueuePrintJobInput {
  storage:      FileStorage;
  basePath:     string;
  ref:          CfdiPrintRef;
  copies?:      number;
  printerName?: string | null;
  requestedBy:  string;
}

export interface EnqueuedPrintJob {
  jobId:        string;
  path:         string;
  requestedAt:  string;
}

/** Escribe un job de impresión a Dropbox. Retorna la ruta y el jobId. */
export async function enqueuePrintJob(input: EnqueuePrintJobInput): Promise<EnqueuedPrintJob> {
  validateRef(input.ref);
  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, '-'); // safe para filename
  const shortRef = input.ref.uuid?.slice(0, 8)
    ?? (input.ref.folio ? `${input.ref.serie ?? 'S'}-${input.ref.folio}` : `cli-${input.ref.clienteRfc ?? 'x'}`);
  const jobId = `prn_${ts}_${shortRef}`;

  const yyyy = now.toISOString().slice(0, 4);
  const mm   = now.toISOString().slice(5, 7);
  const path = `${input.basePath}/print_queue/${yyyy}/${mm}/${jobId}.json`;

  const job = {
    job_id:       jobId,
    requested_at: now.toISOString(),
    requested_by: input.requestedBy,
    cfdi_ref: {
      uuid:        input.ref.uuid       ?? null,
      serie:       input.ref.serie      ?? null,
      folio:       input.ref.folio      ?? null,
      cliente_rfc: input.ref.clienteRfc ?? null,
      fecha_desde: input.ref.fechaDesde ?? null,
      fecha_hasta: input.ref.fechaHasta ?? null,
    },
    copies:       Math.max(1, Math.floor(input.copies ?? 1)),
    printer_name: input.printerName ?? null,
    status:       'pending',
  };

  await input.storage.writeFile(path, Buffer.from(JSON.stringify(job, null, 2), 'utf-8'));
  return { jobId, path, requestedAt: job.requested_at };
}

function validateRef(ref: CfdiPrintRef): void {
  const hasUuid = !!ref.uuid?.trim();
  const hasFolio = !!(ref.serie?.trim() && ref.folio?.trim());
  const hasRfcRange = !!(ref.clienteRfc?.trim() && ref.fechaDesde?.trim() && ref.fechaHasta?.trim());
  if (!hasUuid && !hasFolio && !hasRfcRange) {
    throw new Error(
      'CfdiPrintRef requiere al menos uno de: uuid, (serie+folio), o (clienteRfc+fechaDesde+fechaHasta) para que el Writer pueda encontrar el CFDI en CONTPAQi.',
    );
  }
}
