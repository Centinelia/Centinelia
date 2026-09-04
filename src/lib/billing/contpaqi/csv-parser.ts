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
 * Divide el contenido CSV en filas RFC 4180 respetando comillas dobles
 * (los campos entre "..." pueden contener \n embebido). Antes se hacía
 * split naive por \r?\n; una razón social con newline embebido rompía la
 * fila en dos y corrompía el catálogo silenciosamente. Auditoría 2026-09-04.
 */
function splitLines(content: string): string[] {
  const rows: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === '"') {
      // Manejar "" (escape). Si estamos en quotes y siguiente char es ", es escape.
      if (inQuotes && content[i + 1] === '"') {
        cur += '""';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      cur += ch;
      continue;
    }
    if (!inQuotes && (ch === '\n' || (ch === '\r' && content[i + 1] === '\n'))) {
      if (ch === '\r') i++;
      if (cur.length > 0) rows.push(cur);
      cur = '';
      continue;
    }
    if (!inQuotes && ch === '\r') {
      if (cur.length > 0) rows.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.length > 0) rows.push(cur);
  return rows;
}

/**
 * Normaliza un RFC leído del catálogo: trim, uppercase. CONTPAQi (Windows)
 * suele guardar con case mixto y a veces trailing spaces por columnas CHAR
 * fixed-length de versiones viejas. Este normalize + case-insensitive lookup
 * en callers evita "cliente no encontrado" en clientes que SÍ existen.
 * Auditoría 2026-09-04.
 */
function normalizeRfc(raw: string): string {
  return raw.trim().toUpperCase();
}

/**
 * Parsea un número decimal con separador tanto punto como coma. CONTPAQi
 * exportado con locale es-MX puede escribir "18,00" en vez de "18.00";
 * parseFloat naive convierte "18,00" a 18 (truncando decimales). Peor:
 * "1,500" en locale MX (mil quinientos) se convertía a 1. Auditoría 2026-09-04.
 */
function parseDecimal(raw: string | undefined): number {
  if (!raw) return 0;
  const s = raw.trim();
  if (s.length === 0) return 0;
  // Si tiene , y . asumimos formato en-US con , como thousands (2,500.00 → 2500.00).
  // Si tiene solo , asumimos coma decimal (18,00 → 18.00).
  const normalized = s.includes('.') && s.includes(',')
    ? s.replace(/,/g, '')
    : s.replace(',', '.');
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : 0;
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
/** Columnas mínimas esperadas del CSV de clientes. Rows con menos = malformada. */
const CLIENT_MIN_COLS = 6;

export function parseClientsCsv(csvContent: string): BillingClient[] {
  const lines = splitLines(stripBom(csvContent));
  if (lines.length <= 1) return []; // Solo cabecera o vacio

  const [, ...rows] = lines; // Ignorar linea de cabecera

  const out: BillingClient[] = [];
  for (const line of rows) {
    const fields = parseCsvRow(line);
    // Fila con menos columnas = malformada. Antes: se aceptaba silencioso →
    // cliente cargado con usoCFDI vacío → CFDI rechazado por SAT (código
    // CFDI40147). Ahora: skip + warn. Auditoría 2026-09-04.
    if (fields.length < CLIENT_MIN_COLS) {
      console.warn(
        `[csv-parser] fila cliente descartada por menos de ${CLIENT_MIN_COLS} columnas (tenía ${fields.length}): "${line.slice(0, 100)}"`,
      );
      continue;
    }
    const [rfc, adapterId, razonSocial, usoCFDI, regimen, codigoPostal] = fields;
    out.push({
      rfc: normalizeRfc(rfc ?? ''),
      adapterId: (adapterId ?? '').trim(),
      razonSocial: (razonSocial ?? '').trim(),
      usoCFDI: (usoCFDI ?? '').trim(),
      regimen: (regimen ?? '').trim(),
      codigoPostal: (codigoPostal ?? '').trim(),
    });
  }
  return out;
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
const PRODUCT_MIN_COLS = 6;

export function parseProductsCsv(csvContent: string): BillingProduct[] {
  const lines = splitLines(stripBom(csvContent));
  if (lines.length <= 1) return [];

  const [, ...rows] = lines;

  const out: BillingProduct[] = [];
  for (const line of rows) {
    const fields = parseCsvRow(line);
    if (fields.length < PRODUCT_MIN_COLS) {
      console.warn(
        `[csv-parser] fila producto descartada por menos de ${PRODUCT_MIN_COLS} columnas: "${line.slice(0, 100)}"`,
      );
      continue;
    }
    const [sku, nombre, unidad, precioStr, claveSAT, ivaTasaStr] = fields;
    out.push({
      sku: (sku ?? '').trim(),
      nombre: (nombre ?? '').trim(),
      unidad: (unidad ?? '').trim(),
      precio: parseDecimal(precioStr),
      claveSAT: (claveSAT ?? '').trim(),
      ivaTasa: parseDecimal(ivaTasaStr),
    });
  }
  return out;
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
