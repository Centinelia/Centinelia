/**
 * writer-consumer/consume.ts — Orquesta el poll de Dropbox para consumir
 * lo que el Windows agent (billing-contpaqi-writer, Day 6-8) deja en
 * <c>{basePath}/Importables_CONTPAQi/{errores,timbrados}/</c>:
 *
 *   errores/*.json   → BatchReport o FatalReport del writer
 *     - Por cada factura fallida, resuelve acción (reply / redeposit / escalate).
 *     - Mueve el .json (y el .xml original) a <c>errores/consumidos/</c>
 *       para idempotencia del siguiente barrido.
 *
 *   timbrados/*.xml  → CFDI 4.0 timbrado, uno por factura del lote original
 *     - Correlaciona basename → email_id via <c>billing_activity_log</c>.
 *     - Envía CFDI adjunto al remitente del correo original threaded.
 *     - Mueve a <c>timbrados/entregados/</c>.
 *
 * Diseño: funciones puras que reciben deps (DropboxClient, callbacks). El
 * cron endpoint (`/api/cron/nala-writer-inbox`) las cablea con el env real.
 */

import type { DropboxClient, DropboxEntry } from '../storage/dropbox';
import { parseWriterReport, type BatchReport, type FatalReport, type InvoiceResult } from './report';
import { resolveInvoiceAction, resolveFatalAction, type ResolvedAction } from './actions';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ConsumeErroresDeps {
  dropbox:  DropboxClient;
  basePath: string; // ej. '/tortilleria/Importables_CONTPAQi'
  /** Envía reply al cliente del correo que originó la factura. */
  replyToClient: (basename: string, action: Extract<ResolvedAction, { type: 'reply_to_client' }>) => Promise<void>;
  /** Re-deposita el XML original en pendientes/ para reintento (idempotente por hash). */
  redepositPending: (basename: string, action: Extract<ResolvedAction, { type: 'redeposit_pending' }>) => Promise<void>;
  /** Notifica a Nazre + operador Centinelia. */
  escalate: (basename: string, action: Extract<ResolvedAction, { type: 'escalate_to_nazre' }>) => Promise<void>;
  /** Sink de logs estructurados (typ. console + observability). */
  log: (level: 'info' | 'warn' | 'error', msg: string, ctx?: Record<string, unknown>) => void;
}

export interface ConsumeTimbradosDeps {
  dropbox:  DropboxClient;
  basePath: string;
  /** Envía CFDI al receptor del correo original. Devuelve `true` si envió, `false` si no encontró correlación (skip suave). */
  deliverCfdi: (basename: string, xmlContent: Buffer) => Promise<boolean>;
  log: (level: 'info' | 'warn' | 'error', msg: string, ctx?: Record<string, unknown>) => void;
}

export interface ConsumeResult {
  processed: number;
  skipped:   number;
  errors:    number;
}

// ── consumeErrores ────────────────────────────────────────────────────────────

/**
 * Barre <c>{basePath}/errores/</c>, procesa los .json y mueve a consumidos/.
 * NO relaza excepciones por archivo — un archivo malo no debe frenar el batch.
 */
export async function consumeErrores(deps: ConsumeErroresDeps): Promise<ConsumeResult> {
  const erroresPath   = `${deps.basePath}/errores`;
  const consumidosPath = `${erroresPath}/consumidos`;

  let entries: DropboxEntry[];
  try {
    entries = await deps.dropbox.listFolder(erroresPath);
  } catch {
    // Folder inexistente = nada que procesar. No es error.
    return { processed: 0, skipped: 0, errors: 0 };
  }

  const jsonReports = entries.filter(e => e.isFile && e.name.endsWith('.json'));
  const result: ConsumeResult = { processed: 0, skipped: 0, errors: 0 };

  for (const entry of jsonReports) {
    const basename = entry.name.replace(/\.json$/, '');
    try {
      const raw    = (await deps.dropbox.readFile(entry.path)).toString('utf8');
      const report = parseWriterReport(raw);
      if (!report) {
        deps.log('warn', 'json de reporte no parseable, mover a consumidos', { file: entry.name });
        await moveToConsumidos(deps.dropbox, entry.path, consumidosPath, entry.name);
        result.skipped++;
        continue;
      }

      // Un solo report a la vez, secuencial: mantener orden de reply/escalate.
      if ('results' in report) {
        await processBatchReport(basename, report as BatchReport, deps);
      } else {
        await processFatalReport(basename, report as FatalReport, deps);
      }

      // Mover .json + .xml original (mismo basename) a consumidos/.
      await moveToConsumidos(deps.dropbox, entry.path, consumidosPath, entry.name);
      await tryMoveOriginalXml(deps, erroresPath, consumidosPath, basename);
      result.processed++;
    } catch (err) {
      deps.log('error', 'error procesando reporte, dejo el archivo para el siguiente tick', {
        file: entry.name, err: err instanceof Error ? err.message : String(err),
      });
      result.errors++;
    }
  }
  return result;
}

async function processBatchReport(
  basename: string, report: BatchReport, deps: ConsumeErroresDeps,
): Promise<void> {
  const failed = report.results.filter((r: InvoiceResult) => !r.ok);

  // CRITICAL: dedup pacError POR BATCH (no por factura). El writer procesa 1
  // XML por tick, no N; N pacError en el mismo reporte cuentan como UN intento
  // de red, no N. Sin este dedup, un batch de 4 facturas con pacError elevaba
  // attempts 0→4 en un solo tick y disparaba exhausted inmediato — retries
  // efectivos = 0. Este bug se detectó en la auditoría 2026-09-04.
  //
  // Ejecutamos redepositPending una sola vez, con la primera acción pacError
  // encontrada. Las otras acciones (reply_to_client, escalate) SÍ se ejecutan
  // por factura porque cada RFC/SKU distinto merece su propio reply.
  let pacHandled = false;

  for (const inv of failed) {
    const action = resolveInvoiceAction(inv);
    try {
      if (action.type === 'reply_to_client') {
        await deps.replyToClient(basename, action);
      } else if (action.type === 'redeposit_pending') {
        if (!pacHandled) {
          await deps.redepositPending(basename, action);
          pacHandled = true;
        } else {
          deps.log('info', 'pacError adicional en el mismo lote — skipping (ya bump-eado)', {
            basename, index: inv.index,
          });
        }
      } else if (action.type === 'escalate_to_nazre') {
        await deps.escalate(basename, action);
      }
    } catch (err) {
      deps.log('error', 'acción falló, se mueve el reporte igual para no loopear', {
        basename, index: inv.index, actionType: action.type,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

async function processFatalReport(
  basename: string, report: FatalReport, deps: ConsumeErroresDeps,
): Promise<void> {
  const action = resolveFatalAction(report);
  if (action.type === 'escalate_to_nazre') {
    try { await deps.escalate(basename, action); }
    catch (err) {
      deps.log('error', 'escalate falló para reporte fatal, se mueve igual', {
        basename, err: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

// ── consumeTimbrados ──────────────────────────────────────────────────────────

/**
 * Barre <c>{basePath}/timbrados/</c>, envía cada CFDI al receptor via
 * <c>deliverCfdi</c>. Los que no encuentran correlación (deliverCfdi
 * devuelve false) quedan en la carpeta para reintento futuro; los enviados
 * pasan a <c>timbrados/entregados/</c>.
 */
export async function consumeTimbrados(deps: ConsumeTimbradosDeps): Promise<ConsumeResult> {
  const timbradosPath  = `${deps.basePath}/timbrados`;
  const entregadosPath = `${timbradosPath}/entregados`;

  let entries: DropboxEntry[];
  try {
    entries = await deps.dropbox.listFolder(timbradosPath);
  } catch {
    return { processed: 0, skipped: 0, errors: 0 };
  }

  const xmlFiles = entries.filter(e => e.isFile && e.name.endsWith('.xml'));
  const result: ConsumeResult = { processed: 0, skipped: 0, errors: 0 };

  for (const entry of xmlFiles) {
    const basename = extractBasenameFromTimbrado(entry.name);
    try {
      const content = await deps.dropbox.readFile(entry.path);
      const sent    = await deps.deliverCfdi(basename, content);
      if (sent) {
        await deps.dropbox.moveFile(entry.path, `${entregadosPath}/${entry.name}`);
        deps.log('info', 'CFDI entregado al receptor', { file: entry.name, basename });
        result.processed++;
      } else {
        deps.log('warn', 'sin correlación email_id, dejo el CFDI para el siguiente tick', {
          file: entry.name, basename,
        });
        result.skipped++;
      }
    } catch (err) {
      deps.log('error', 'error entregando CFDI, dejo el archivo para el siguiente tick', {
        file: entry.name, err: err instanceof Error ? err.message : String(err),
      });
      result.errors++;
    }
  }
  return result;
}

// ── Helpers privados ──────────────────────────────────────────────────────────

/**
 * Del nombre <c>facturas_2026-09-03_abc12345_FTEN12.xml</c> extrae el
 * <c>facturas_2026-09-03_abc12345</c> para hacer la correlación. El sufijo
 * es el naming que agrega el writer: <c>{basename}_{serie}{folio}.xml</c>.
 */
export function extractBasenameFromTimbrado(filename: string): string {
  // Regex: quita `_<serie no vacía><folio numérico>.xml` al final.
  return filename.replace(/_[A-Z0-9]+\d+\.xml$/i, '');
}

async function moveToConsumidos(
  dropbox: DropboxClient, srcPath: string, consumidosBase: string, filename: string,
): Promise<void> {
  await dropbox.moveFile(srcPath, `${consumidosBase}/${filename}`);
}

async function tryMoveOriginalXml(
  deps: ConsumeErroresDeps, erroresPath: string, consumidosPath: string, basename: string,
): Promise<void> {
  const xmlName = `${basename}.xml`;
  try {
    // No hay stat() en el helper; intentamos mover y silenciamos si no existe.
    await deps.dropbox.moveFile(`${erroresPath}/${xmlName}`, `${consumidosPath}/${xmlName}`);
  } catch {
    // XML original ya fue movido o nunca existió (reporte fatal sin lote parcial).
    // No es error.
  }
}
