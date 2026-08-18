/**
 * reassign.ts -- Reasignacion de ventas "No facturado" a un cliente destino.
 *
 * reassignSales() es invocado cuando la contadora responde el correo indicando
 * que una o mas ventas deben facturarse a un RFC diferente del registrado en el
 * Excel diario.
 *
 * Flujo:
 * 1. Valida RFC destino con adapter.getClientByRFC. Si null -> throw.
 * 2. Lee el Excel diario desde Dropbox.
 * 3. Snapshot obligatorio antes de cualquier escritura.
 * 4. Aplica updateRow con matcher: num en saleNums Y status === 'No facturado'.
 *    Actualiza cliente, RFC y status a 'Pendiente'.
 * 5. Escribe Excel de vuelta a Dropbox.
 * 6. Para cada fila reasignada invoca applyRuleToSale con el RFC destino.
 * 7. Registra en billing_activity_log.
 * 8. Retorna resumen: reassigned, missing, errors, targetClient.
 *
 * Los numeros solicitados que no aparecen en el Excel (o que tienen un status
 * distinto a 'No facturado') se registran en missing[] sin lanzar error.
 *
 * OrgCtx = { portalEmail: string, integrationId: string }
 * createAdminClient() de @/lib/supabase/admin (service role).
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { DropboxClient } from '../storage/dropbox';
import { SnapshotStorage } from '../storage/snapshot';
import { ExcelWorkbook } from '../excel/workbook';
import { DailySalesSchema } from '../excel/schemas';
import { applyRuleToSale } from '../rules/apply';
import type { BillingAdapter, BillingClient } from '../adapter';
import type { OrgCtx } from '../matching/client';

// ---------------------------------------------------------------------------
// Tipos publicos
// ---------------------------------------------------------------------------

export interface ReassignParams {
  /** Ruta absoluta del Excel diario en Dropbox. */
  dailyExcelPath: string;
  /** Numeros de venta a reasignar (campo "num" en la hoja Ventas). */
  saleNums:       number[];
  /** RFC del cliente destino validado por el adaptador. */
  targetRFC:      string;
  /** Contexto organizacional: portalEmail + integrationId. */
  ctx:            OrgCtx;
  /** Adaptador del sistema contable para validar el cliente destino. */
  adapter:        BillingAdapter;
  /** Ruta base en Dropbox (ej: /Facturacion/2026). */
  basePath:       string;
}

export interface ReassignResult {
  /** Cantidad de ventas efectivamente reasignadas. */
  reassigned:   number;
  /** Numeros de venta solicitados que no se encontraron o ya tenian otro status. */
  missing:      number[];
  /** Errores ocurridos durante applyRuleToSale para ventas especificas. */
  errors:       Array<{ saleNum: number; reason: string }>;
  /** Datos completos del cliente destino. */
  targetClient: BillingClient;
}

// ---------------------------------------------------------------------------
// reassignSales
// ---------------------------------------------------------------------------

/**
 * Reasigna ventas "No facturado" del Excel diario a un cliente destino.
 *
 * @param params - Parametros de reasignacion.
 * @returns Resumen de la operacion.
 * @throws Error si el RFC destino no existe en el adaptador.
 */
export async function reassignSales(params: ReassignParams): Promise<ReassignResult> {
  const { dailyExcelPath, saleNums, targetRFC, ctx, adapter, basePath } = params;

  // -------------------------------------------------------------------------
  // 1. Validar RFC destino
  // -------------------------------------------------------------------------
  const targetClient = await adapter.getClientByRFC(targetRFC);
  if (!targetClient) {
    throw new Error(
      `[reassignSales] RFC destino no encontrado en el catalogo: ${targetRFC}`,
    );
  }

  // -------------------------------------------------------------------------
  // 2. Leer Excel diario desde Dropbox
  // -------------------------------------------------------------------------
  const dropbox   = new DropboxClient(process.env.DROPBOX_ACCESS_TOKEN ?? '');
  const snapshots = new SnapshotStorage();

  const buffer = await dropbox.readFile(dailyExcelPath);

  // -------------------------------------------------------------------------
  // 3. Snapshot obligatorio antes de escribir
  // -------------------------------------------------------------------------
  await snapshots.snapshot(ctx.portalEmail, dailyExcelPath, buffer);

  // -------------------------------------------------------------------------
  // 4. Cargar workbook y aplicar updateRow
  // -------------------------------------------------------------------------
  const wb = await ExcelWorkbook.fromBuffer(buffer, DailySalesSchema);

  // Registrar cuales nums se reasignaron en la pasada de updateRow
  const reassignedNums = new Set<number>();

  wb.updateRow(
    'Ventas',
    (row) => {
      const num    = typeof row.num === 'number' ? row.num : Number(row.num);
      const status = String(row.status ?? '');
      if (saleNums.includes(num) && status === 'No facturado') {
        reassignedNums.add(num);
        return true;
      }
      return false;
    },
    {
      cliente: targetClient.razonSocial,
      rfc:     targetRFC,
      status:  'Pendiente',
    },
  );

  // Calcular missing: nums solicitados que no quedaron en reassignedNums
  const missing = saleNums.filter(n => !reassignedNums.has(n));

  // -------------------------------------------------------------------------
  // 5. Escribir Excel de vuelta a Dropbox
  // -------------------------------------------------------------------------
  const updatedBuffer = await wb.toBuffer();
  await dropbox.writeFile(dailyExcelPath, updatedBuffer);

  // -------------------------------------------------------------------------
  // 6. Aplicar regla del cliente destino a cada venta reasignada
  // -------------------------------------------------------------------------
  const errors: Array<{ saleNum: number; reason: string }> = [];

  // Extraer fecha YYYY-MM-DD del nombre de archivo del Excel diario.
  // El campo row.hora contiene la hora del turno (ej: '10:00'), no la fecha.
  const dateFromPath = /(\d{4}-\d{2}-\d{2})/.exec(dailyExcelPath)?.[1] ?? '';

  // Obtener los datos de las filas reasignadas para pasarlas a applyRuleToSale
  const allRows = wb.getRows('Ventas');
  const reassignedRows = allRows.filter((row) => {
    const num = typeof row.num === 'number' ? row.num : Number(row.num);
    return reassignedNums.has(num);
  });

  for (const row of reassignedRows) {
    const saleNum = typeof row.num === 'number' ? row.num : Number(row.num);
    try {
      await applyRuleToSale(
        {
          rfc:       targetRFC,
          date:      dateFromPath,
          productos: String(row.productos ?? ''),
          total:     typeof row.total === 'number' ? row.total : Number(row.total ?? 0),
          metodo:    String(row.metodo ?? ''),
          ventaNum:  saleNum,
        },
        ctx,
        basePath,
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      errors.push({ saleNum, reason });
    }
  }

  // -------------------------------------------------------------------------
  // 7. Registrar en billing_activity_log
  // -------------------------------------------------------------------------
  const supabase = createAdminClient();
  const { error: logError } = await supabase.from('billing_activity_log').insert({
    portal_email:   ctx.portalEmail,
    integration_id: ctx.integrationId,
    action_type:    'ventas_reasignadas',
    severity:       'info',
    entity_ref:     targetRFC,
    context:        {
      dailyExcelPath,
      saleNums,
      reassigned:  reassignedNums.size,
      missing,
      errors:      errors.length,
      targetRazonSocial: targetClient.razonSocial,
    },
  });

  if (logError) {
    // No bloquear el flujo por un fallo de logging
    console.error('[reassignSales] billing_activity_log insert error:', logError.message);
  }

  // -------------------------------------------------------------------------
  // 8. Retornar resumen
  // -------------------------------------------------------------------------
  return {
    reassigned:  reassignedNums.size,
    missing,
    errors,
    targetClient,
  };
}
