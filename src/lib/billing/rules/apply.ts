/**
 * apply.ts -- Aplicacion de reglas por cliente para el empleado digital de facturacion.
 *
 * applyRuleToSale(sale, ctx, basePath) es el punto de entrada:
 *   1. Consulta billing_client_rules para el RFC de la venta.
 *   2. Si no hay regla o frequency='daily' -> retorna 'daily' sin side effects.
 *   3. Si frequency='weekly' o 'monthly' -> apende la venta al archivo
 *      Pendientes.xlsx del cliente y retorna la decision.
 *   4. Si frequency no reconocida -> retorna 'no_rule' sin side effects.
 *
 * Ruta del archivo de pendientes:
 *   <basePath>/Clientes_Periodicos/<RFC_sanitized>/Pendientes.xlsx
 *
 * Sale type:
 * {
 *   rfc:       string  -- RFC del cliente
 *   date:      string  -- Fecha de la venta (YYYY-MM-DD)
 *   productos: string  -- Descripcion de productos
 *   total:     number  -- Monto total
 *   metodo:    string  -- Metodo de pago
 *   ventaNum:  number  -- Numero correlativo de la venta
 * }
 *
 * OrgCtx = { portalEmail: string, integrationId: string }
 * Consistente con Task 7 y matching/client.ts.
 *
 * Supabase: createAdminClient() de @/lib/supabase/admin (service role).
 * Snapshot: siempre antes de escribir (patron consistente con Task 8/tools.ts).
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { DropboxClient } from '../storage/dropbox';
import { SnapshotStorage } from '../storage/snapshot';
import { ExcelWorkbook } from '../excel/workbook';
import { PendingClientSchema } from '../excel/schemas';
import type { OrgCtx } from '../matching/client';
import { sanitizeRfc } from '../util/rfc';

// ---------------------------------------------------------------------------
// Tipos publicos
// ---------------------------------------------------------------------------

/**
 * Venta a evaluar contra las reglas del cliente.
 *
 * rfc:       RFC del cliente registrado en CONTPAQi.
 * date:      Fecha de la venta en formato YYYY-MM-DD.
 * productos: Descripcion de productos (texto libre).
 * total:     Monto total de la venta.
 * metodo:    Metodo de pago (efectivo, transferencia, tarjeta, etc.).
 * ventaNum:  Numero correlativo de la venta en el Excel diario.
 */
export interface BillingSale {
  rfc:       string;
  date:      string;
  productos: string;
  total:     number;
  metodo:    string;
  ventaNum:  number;
}

/** Decision de frecuencia retornada por applyRuleToSale. */
export type RuleDecision = 'daily' | 'weekly' | 'monthly' | 'no_rule';

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

/**
 * Construye la ruta absoluta del Pendientes.xlsx del cliente.
 *
 * Formato: <basePath>/Clientes_Periodicos/<RFC_sanitized>/Pendientes.xlsx
 */
function buildPendingPath(basePath: string, rfc: string): string {
  const cleanBase = basePath.replace(/\/$/, '');
  const rfcSafe   = sanitizeRfc(rfc);
  return `${cleanBase}/Clientes_Periodicos/${rfcSafe}/Pendientes.xlsx`;
}

// ---------------------------------------------------------------------------
// applyRuleToSale
// ---------------------------------------------------------------------------

/**
 * Aplica las reglas de facturacion configuradas para el cliente de una venta.
 *
 * @param sale     - Datos de la venta a procesar.
 * @param ctx      - Contexto organizacional: portalEmail + integrationId.
 * @param basePath - Ruta base en Dropbox (ej: /Facturacion/2026).
 * @returns Decision de frecuencia:
 *   - 'daily'   -> sin regla especial; el caller registra la venta en el Excel diario.
 *   - 'weekly'  -> venta acumulada en Pendientes.xlsx (facturacion semanal).
 *   - 'monthly' -> venta acumulada en Pendientes.xlsx (facturacion mensual).
 *   - 'no_rule' -> regla existe pero frequency no reconocida; caller decide.
 */
export async function applyRuleToSale(
  sale:     BillingSale,
  ctx:      OrgCtx,
  basePath: string,
): Promise<RuleDecision> {
  const supabase = createAdminClient();

  // -------------------------------------------------------------------------
  // 1. Consultar regla del cliente por RFC + integrationId
  // -------------------------------------------------------------------------
  const { data: rule, error } = await supabase
    .from('billing_client_rules')
    .select('rfc, frequency, default_payment_method')
    .eq('integration_id', ctx.integrationId)
    .eq('rfc', sale.rfc)
    .maybeSingle();

  if (error) {
    // Log y degradar a daily para no bloquear el flujo.
    console.error(`[applyRuleToSale] DB error for RFC=${sale.rfc}:`, error.message);
    return 'daily';
  }

  // -------------------------------------------------------------------------
  // 2. Sin regla -> 'daily', sin side effects
  // -------------------------------------------------------------------------
  if (!rule) {
    return 'daily';
  }

  const frequency = rule.frequency as string | null | undefined;

  // -------------------------------------------------------------------------
  // 3. Determinar decision
  // -------------------------------------------------------------------------
  if (frequency === 'daily' || !frequency) {
    return 'daily';
  }

  if (frequency !== 'weekly' && frequency !== 'monthly') {
    return 'no_rule';
  }

  // frequency es 'weekly' o 'monthly': acumular en Pendientes.xlsx
  const decision: RuleDecision = frequency;

  // -------------------------------------------------------------------------
  // 4. Acumular venta en Pendientes.xlsx
  // -------------------------------------------------------------------------
  const pendingPath = buildPendingPath(basePath, sale.rfc);
  const dropbox     = new DropboxClient(
    // El token de Dropbox se resuelve en el contexto del caller (BillingEmployee).
    // Aqui accedemos via variable de entorno como fallback de infraestructura.
    // En produccion, el caller inyecta el token via ctx o la integration config.
    process.env.BILLING_DROPBOX_TOKEN ?? '',
  );
  const snapshots = new SnapshotStorage();

  // Leer archivo existente; si no existe, inicializar workbook vacio.
  let buffer: Buffer;
  let isNew = false;
  try {
    buffer = await dropbox.readFile(pendingPath);
  } catch {
    isNew  = true;
    const wb = ExcelWorkbook.empty(PendingClientSchema);
    buffer   = await wb.toBuffer();
  }

  // Snapshot obligatorio antes de cualquier escritura.
  await snapshots.snapshot(ctx.portalEmail, pendingPath, buffer);

  // Cargar workbook y agregar la fila.
  const wb = isNew
    ? ExcelWorkbook.empty(PendingClientSchema)
    : await ExcelWorkbook.fromBuffer(buffer, PendingClientSchema);

  const existingRows = wb.getRows('Pendientes');
  const num          = existingRows.length + 1;

  wb.appendRow('Pendientes', {
    num,
    fecha:        sale.date,
    productos:    sale.productos,
    total:        sale.total,
    metodo:       sale.metodo,
    ventasSources: String(sale.ventaNum),
  });

  const newBuffer = await wb.toBuffer();
  await dropbox.writeFile(pendingPath, newBuffer);

  return decision;
}
