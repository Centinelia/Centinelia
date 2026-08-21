/**
 * paths.ts -- Rutas Dropbox compartidas del subsistema de reglas de facturacion.
 *
 * Punto unico de verdad para donde viven los archivos del ciclo de facturacion
 * por cliente. Cualquier codigo que lea o escriba estos archivos DEBE importar
 * de aqui — nunca construir el path a mano.
 */

import { sanitizeRfc } from '../util/rfc';

/**
 * Ruta absoluta del archivo `Pendientes.xlsx` de un cliente periodico.
 *
 * Formato: `<basePath>/Clientes_Periodicos/<RFC_sanitized>/Pendientes.xlsx`
 *
 * Un unico archivo por RFC acumula todas las ventas pendientes de facturacion
 * (semanales o mensuales) hasta que el cron `billing-periodic-cuts` consolida
 * y limpia. Consumido por:
 *   - `applyRuleToSale` en `src/lib/billing/rules/apply.ts` (rule engine)
 *   - `append_pending_client_sale` tool en `src/lib/billing/employee/tools.ts` (LLM)
 *   - `processPeriodicCutForClient` en `src/app/api/cron/billing-periodic-cuts/route.ts` (cron)
 *
 * Los tres call sites deben producir el mismo path para el mismo (basePath, RFC).
 */
export function buildPendingPath(basePath: string, rfc: string): string {
  const cleanBase = basePath.replace(/\/$/, '');
  const rfcSafe   = sanitizeRfc(rfc);
  return `${cleanBase}/Clientes_Periodicos/${rfcSafe}/Pendientes.xlsx`;
}
