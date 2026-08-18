/**
 * index.ts -- Adapter registry para el sistema de facturacion.
 *
 * `buildAdapter(config)` es el punto de entrada unico que mapea la config
 * JSONB de organization_integrations a una instancia de BillingAdapter.
 *
 * Tipos soportados:
 *   - 'contpaqi': CONTPAQiAdapter (lee CSVs desde Dropbox, escribe XML para importacion).
 *   - 'mock': MockBillingAdapter (datos en memoria, solo para tests).
 *
 * Lanza Error para tipos desconocidos o config incompleta.
 */

import type { BillingAdapter } from '../adapter';
import { CONTPAQiAdapter } from './contpaqi';
import { MockBillingAdapter } from './mock';
import { DropboxClient } from '../storage/dropbox';

// ---------------------------------------------------------------------------
// OrganizationIntegrationConfig
// ---------------------------------------------------------------------------

/**
 * Forma que toma la columna JSONB `config` en `organization_integrations`.
 * Refleja el schema acordado en el plan B.
 */
export interface OrganizationIntegrationConfig {
  /** Tipo de adaptador a instanciar. */
  type: 'contpaqi' | 'mock';

  // --- Dropbox (requerido para type='contpaqi') ---
  /** Token de acceso a la cuenta Dropbox de la organizacion. */
  dropbox_token?: string;
  /** Ruta raiz en Dropbox donde viven los archivos de la organizacion. Ej: '/acme/contpaqi'. */
  dropbox_base_path?: string;

  // --- Datos fiscales del emisor (requerido para type='contpaqi') ---
  fiscal?: {
    /** RFC del emisor (empresa que factura). */
    rfc_emisor: string;
    /** Clave de regimen fiscal del emisor (SAT). Ej: '601', '612'. */
    regimen_fiscal: string;
    /** Serie del comprobante por defecto. Ej: 'A'. */
    serie_default: string;
    /** Clave de uso CFDI por defecto. Ej: 'G03'. */
    uso_cfdi_default: string;
    /** Clave de producto SAT por defecto. Ej: '50161509'. */
    clave_sat_default_producto: string;
  };

  // --- Parametros del agente de sincronizacion (requerido para type='contpaqi') ---
  scheduled_task?: {
    /** Cada cuantos minutos se espera que el agente sincronice. */
    expected_sync_interval_minutes: number;
    /** Minutos de staleness antes de emitir advertencia (sin cortar operacion). */
    stale_warning_minutes: number;
    /** Horas de staleness que marcan el adaptador como no saludable. */
    stale_escalation_hours: number;
  };
}

// ---------------------------------------------------------------------------
// buildAdapter
// ---------------------------------------------------------------------------

/**
 * Factory que resuelve `config.type` a una instancia de BillingAdapter.
 *
 * @param config Config JSONB de organization_integrations.
 * @returns Instancia lista para usar.
 * @throws {Error} Si type='contpaqi' y falta dropbox_token, dropbox_base_path, fiscal o scheduled_task.
 * @throws {Error} Si `type` no es un valor reconocido.
 */
export function buildAdapter(config: OrganizationIntegrationConfig): BillingAdapter {
  switch (config.type) {
    case 'contpaqi': {
      if (
        !config.dropbox_token ||
        !config.dropbox_base_path ||
        !config.fiscal ||
        !config.scheduled_task
      ) {
        throw new Error(
          'CONTPAQi adapter requires dropbox_token, dropbox_base_path, fiscal, scheduled_task'
        );
      }

      return new CONTPAQiAdapter({
        dropboxClient: new DropboxClient(config.dropbox_token),
        basePath: config.dropbox_base_path,
        staleWarningMinutes: config.scheduled_task.stale_warning_minutes,
        staleEscalationHours: config.scheduled_task.stale_escalation_hours,
        xmlConfig: {
          serie: config.fiscal.serie_default,
          rfcEmisor: config.fiscal.rfc_emisor,
          regimenFiscal: config.fiscal.regimen_fiscal,
          // lugarExpedicion no esta en el config JSONB actual; se pasa vacio.
          // Follow-up: agregar codigo_postal_emisor al schema JSONB.
          lugarExpedicion: '',
          usoCFDIDefault: config.fiscal.uso_cfdi_default,
        },
      });
    }

    case 'mock':
      return new MockBillingAdapter({ clients: [], products: [] });

    default:
      throw new Error(`Unknown adapter type: ${(config as { type: string }).type}`);
  }
}
