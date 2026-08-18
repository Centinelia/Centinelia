/**
 * csv-parser.ts -- Parsers de archivos CSV y JSON generados por el agente CONTPAQi.
 *
 * Maneja:
 *   - contpaqi_clientes.csv  (UTF-8 BOM, RFC 4180)
 *   - contpaqi_productos.csv (UTF-8 BOM, RFC 4180)
 *   - last_sync.json         (frescura del ultimo sync del agente local)
 *
 * No depende de librerias externas. El parser RFC 4180 es inline para evitar
 * dependencias innecesarias en el bundle del empleado digital.
 */

import type { BillingClient, BillingProduct } from '../adapter';

// ---------------------------------------------------------------------------
// FreshnessData
// ---------------------------------------------------------------------------

export interface FreshnessData {
  lastSyncAt: string;
  status: 'ok' | 'partial' | 'error';
  records: { clients: number; products: number };
  durationMs: number;
  agentVersion: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// RFC 4180 parser (inline, sin dependencias)
// ---------------------------------------------------------------------------

/**
 * Elimina el BOM UTF-8 si esta presente al inicio del string.
 */
function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/**
 * Parsea una linea CSV respetando el estandar RFC 4180:
 * - Campos entre comillas dobles pueden contener comas y saltos de linea.
 * - Dos comillas consecutivas dentro de un campo entre comillas = una comilla literal.
 */
function parseCsvRow(line: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        // Comilla escapada dentro de campo entre comillas
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
  }

  fields.push(cur);
  return fields;
}

/**
 * Divide el contenido CSV en lineas ignorando las vacias.
 * Soporta CRLF y LF.
 */
function splitLines(content: string): string[] {
  return content.split(/\r?\n/).filter((l) => l.length > 0);
}

// ---------------------------------------------------------------------------
// parseClientsCsv
// ---------------------------------------------------------------------------

/**
 * Parsea el contenido de contpaqi_clientes.csv y retorna una lista de BillingClient.
 *
 * Columnas esperadas (en orden):
 *   rfc, adapter_client_id, razon_social, uso_cfdi, regimen_fiscal,
 *   codigo_postal, email, telefono
 *
 * Los campos email y telefono se ignoran (no forman parte de BillingClient).
 * Los campos vacios se mantienen como string vacio.
 */
export function parseClientsCsv(csvContent: string): BillingClient[] {
  const lines = splitLines(stripBom(csvContent));
  if (lines.length <= 1) return []; // Solo cabecera o vacio

  const [, ...rows] = lines; // Ignorar linea de cabecera

  return rows.map((line) => {
    const [rfc, adapterId, razonSocial, usoCFDI, regimen, codigoPostal] = parseCsvRow(line);
    return {
      rfc: rfc ?? '',
      adapterId: adapterId ?? '',
      razonSocial: razonSocial ?? '',
      usoCFDI: usoCFDI ?? '',
      regimen: regimen ?? '',
      codigoPostal: codigoPostal ?? '',
    };
  });
}

// ---------------------------------------------------------------------------
// parseProductsCsv
// ---------------------------------------------------------------------------

/**
 * Parsea el contenido de contpaqi_productos.csv y retorna una lista de BillingProduct.
 *
 * Columnas esperadas (en orden):
 *   sku, nombre, unidad, precio, clave_sat, iva_tasa
 *
 * precio e iva_tasa se convierten a number con parseFloat.
 */
export function parseProductsCsv(csvContent: string): BillingProduct[] {
  const lines = splitLines(stripBom(csvContent));
  if (lines.length <= 1) return [];

  const [, ...rows] = lines;

  return rows.map((line) => {
    const [sku, nombre, unidad, precioStr, claveSAT, ivaTasaStr] = parseCsvRow(line);
    return {
      sku: sku ?? '',
      nombre: nombre ?? '',
      unidad: unidad ?? '',
      precio: parseFloat(precioStr ?? '0'),
      claveSAT: claveSAT ?? '',
      ivaTasa: parseFloat(ivaTasaStr ?? '0'),
    };
  });
}

// ---------------------------------------------------------------------------
// parseFreshnessJson
// ---------------------------------------------------------------------------

/**
 * Valida la presencia y tipo de un campo en el objeto raw del JSON de frescura.
 * Lanza un error descriptivo si el campo falta o tiene tipo incorrecto.
 */
function assertField(
  raw: Record<string, unknown>,
  field: string,
  expectedType: 'string' | 'number' | 'object',
): void {
  if (!(field in raw) || raw[field] === null || raw[field] === undefined) {
    throw new Error(
      `parseFreshnessJson: malformed freshness data - missing/invalid field: ${field}`,
    );
  }
  // eslint-disable-next-line valid-typeof
  if (typeof raw[field] !== expectedType) {
    throw new Error(
      `parseFreshnessJson: malformed freshness data - missing/invalid field: ${field}`,
    );
  }
}

/**
 * Parsea el contenido de last_sync.json generado por el agente CONTPAQi local.
 *
 * Valida que todos los campos requeridos existan y tengan el tipo correcto.
 * Si el JSON esta malformado o faltan campos, lanza un Error con mensaje
 * explicito: "parseFreshnessJson: malformed freshness data - missing/invalid field: <campo>".
 *
 * Mapeo snake_case -> camelCase:
 *   last_sync_at   -> lastSyncAt
 *   duration_ms    -> durationMs
 *   agent_version  -> agentVersion
 *   error_message  -> error (solo presente si status = 'error')
 */
export function parseFreshnessJson(json: string): FreshnessData {
  const raw = JSON.parse(json) as Record<string, unknown>;

  // Validate required fields presence and type.
  assertField(raw, 'last_sync_at', 'string');
  assertField(raw, 'status', 'string');
  assertField(raw, 'records', 'object');
  assertField(raw, 'duration_ms', 'number');
  assertField(raw, 'agent_version', 'string');

  // Validate records sub-fields.
  const records = raw['records'] as Record<string, unknown>;
  if (typeof records['clients'] !== 'number' || typeof records['products'] !== 'number') {
    throw new Error(
      'parseFreshnessJson: malformed freshness data - missing/invalid field: records.clients or records.products',
    );
  }

  const result: FreshnessData = {
    lastSyncAt: raw['last_sync_at'] as string,
    status: raw['status'] as 'ok' | 'partial' | 'error',
    records: { clients: records['clients'] as number, products: records['products'] as number },
    durationMs: raw['duration_ms'] as number,
    agentVersion: raw['agent_version'] as string,
  };

  if (raw['error_message'] !== undefined) {
    result.error = raw['error_message'] as string;
  }

  return result;
}
