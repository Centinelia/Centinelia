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
import { encrypt, decrypt } from '@/lib/crypto';

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
    /**
     * Codigo postal del domicilio fiscal del emisor.
     * Se usa como LugarExpedicion en el XML de importacion a CONTPAQi.
     * Requerido para que CONTPAQi acepte el XML al timbrar.
     * Ej: '64000'.
     */
    codigo_postal_emisor: string;
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
// Token helpers (cifrado at-rest para dropbox_token en JSONB)
// ---------------------------------------------------------------------------

/**
 * Descifra el `dropbox_token` leído del JSONB de `organization_integrations`.
 *
 * Usa `decrypt` de `@/lib/crypto`, que tiene fallback graceful: si el input
 * no está en formato encriptado (o si `ENCRYPTION_KEY` no está configurada),
 * retorna el valor tal cual. Esto permite convivir con tokens legacy en
 * plaintext sin migración forzosa.
 */
export function decryptDropboxToken(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  return decrypt(raw);
}

/**
 * Cifra un `dropbox_token` en plaintext antes de escribirlo al JSONB.
 *
 * Requiere `ENCRYPTION_KEY` configurada (throw si falta). Usar desde admin
 * endpoints o scripts de seed. NO llamar desde código que corre en request
 * path del cliente final.
 */
export function encryptDropboxToken(plaintext: string): string {
  return encrypt(plaintext);
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

      if (!config.fiscal.codigo_postal_emisor) {
        throw new Error(
          'CONTPAQi adapter requires fiscal.codigo_postal_emisor (LugarExpedicion en el XML). ' +
          'Agregar el campo al JSONB config de organization_integrations. Ej: "64000".'
        );
      }

      return new CONTPAQiAdapter({
        dropboxClient: new DropboxClient(decryptDropboxToken(config.dropbox_token)!),
        basePath: config.dropbox_base_path,
        staleWarningMinutes: config.scheduled_task.stale_warning_minutes,
        staleEscalationHours: config.scheduled_task.stale_escalation_hours,
        xmlConfig: {
          serie: config.fiscal.serie_default,
          rfcEmisor: config.fiscal.rfc_emisor,
          regimenFiscal: config.fiscal.regimen_fiscal,
          lugarExpedicion: config.fiscal.codigo_postal_emisor,
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
