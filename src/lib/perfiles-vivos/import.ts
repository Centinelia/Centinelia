// Importer genérico de cartera de contactos para el pack perfiles_vivos.
//
// Recibe un buffer (CSV o XLSX) + column mapping definido por el cliente en el
// portal y hace upsert masivo en contactos_vivos. Al terminar, auto-activa el
// feature `perfiles_vivos` en organizations.features si es la primera cartera.
//
// Cobro: batched — N contactos importados = 1 cobro count=N (regla
// batched-consume-multi-io). Solo se cobra si viene agentId.

import * as XLSX from 'xlsx';
import { createAdminClient } from '@/lib/supabase/admin';
import { consumeAiOp } from '@/lib/ai/ops-guard';

export interface ColumnMapping {
  external_id?:   string;    // nombre de la columna del CSV que contiene el external_id
  nombre:         string;    // obligatorio: la columna con el nombre del contacto
  telefono?:      string;
  correo?:        string;
  notas?:         string;
  estado_inicial?: string;   // ej. 'activo', 'promesa_pendiente'. Si viene, se aplica a todos
  // Todo lo demás va a datos_operacionales JSONB. Ej: { monto_adeudado: 'MONTO',
  // dias_mora: 'DIAS', tipo_credito: 'PRODUCTO' } → cada fila queda con
  // { monto_adeudado: <valor>, dias_mora: <valor>, tipo_credito: <valor> }
  datos_operacionales?: Record<string, string>;
}

export interface ImportOpts {
  portalEmail:   string;
  filename:      string;
  columnMapping: ColumnMapping;
  uploadedBy?:   string;
  agentId?:      string;     // para cobro batched
}

export interface ImportResult {
  total_rows_leidas:    number;
  contactos_creados:    number;
  contactos_actualizados: number;
  rows_saltadas:        number;
  errores:              Array<{ row: number; error: string }>;
  auto_activated:       boolean;
}

// Normaliza teléfono: quita todo lo que no sea dígito. Si viene con +, lo
// preserva al inicio. Preferimos guardar 10 dígitos raw + prefijo si viene.
function normalizePhone(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const digitsOnly = s.replace(/[^0-9+]/g, '');
  if (digitsOnly.length === 0) return null;
  return digitsOnly;
}

function normalizeEmail(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s || !s.includes('@')) return null;
  return s;
}

function coerceNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const s = String(raw).replace(/[$,\s]/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

// Detecta si el buffer es CSV o XLSX por magic bytes y extensión.
function parseBufferToRows(buffer: Buffer, filename: string): Record<string, unknown>[] {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  const isXlsx = ext === 'xlsx' || ext === 'xls' || ext === 'ods';

  if (isXlsx) {
    const wb    = XLSX.read(buffer, { type: 'buffer', cellDates: false });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return [];
    return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  }

  // Asumimos CSV. XLSX.read soporta CSV nativamente.
  const wb    = XLSX.read(buffer, { type: 'buffer', codepage: 65001 /* UTF-8 */ });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
}

export async function importCarteraContactos(buffer: Buffer, opts: ImportOpts): Promise<ImportResult> {
  const { portalEmail, filename, columnMapping } = opts;
  const supabase = createAdminClient();

  if (!columnMapping.nombre) {
    throw new Error('Import: la columna "nombre" es obligatoria en el column mapping');
  }

  const rows = parseBufferToRows(buffer, filename);
  const result: ImportResult = {
    total_rows_leidas:      rows.length,
    contactos_creados:      0,
    contactos_actualizados: 0,
    rows_saltadas:          0,
    errores:                [],
    auto_activated:         false,
  };
  if (rows.length === 0) return result;

  // Auto-activación del feature (idempotente)
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('features')
    .eq('portal_email', portalEmail)
    .maybeSingle();
  if (orgErr) throw new Error(`Import: query organizations error: ${orgErr.message}`);
  if (!org) throw new Error(`Import: organización ${portalEmail} no existe`);
  const currentFeatures = (org.features as Record<string, unknown> | undefined) ?? {};
  if (currentFeatures.perfiles_vivos !== true) {
    const newFeatures = { ...currentFeatures, perfiles_vivos: true };
    await supabase.from('organizations').update({ features: newFeatures }).eq('portal_email', portalEmail);
    result.auto_activated = true;
  }

  // Preparar filas para upsert. Cualquier fila sin `nombre` se descarta como
  // saltada (evita insertar contactos vacíos por columnas en blanco).
  const toUpsert: Array<Record<string, unknown>> = [];
  for (let i = 0; i < rows.length; i++) {
    const row  = rows[i];
    const rowN = i + 2; // fila 1 es header en Excel/CSV

    const nombre = String(row[columnMapping.nombre] ?? '').trim();
    if (!nombre) { result.rows_saltadas++; continue; }

    const externalId = columnMapping.external_id
      ? String(row[columnMapping.external_id] ?? '').trim() || null
      : null;
    const telefono   = columnMapping.telefono ? normalizePhone(row[columnMapping.telefono] as string) : null;
    const correo     = columnMapping.correo   ? normalizeEmail(row[columnMapping.correo] as string)   : null;
    const notas      = columnMapping.notas
      ? (String(row[columnMapping.notas] ?? '').trim() || null)
      : null;

    // Datos operacionales flexibles
    const datosOp: Record<string, unknown> = {};
    if (columnMapping.datos_operacionales) {
      for (const [dbKey, csvCol] of Object.entries(columnMapping.datos_operacionales)) {
        const raw = row[csvCol];
        if (raw === undefined || raw === '') continue;
        // Intentar coerce a number si el nombre sugiere numérico
        const looksNumeric = /monto|deuda|precio|balance|saldo|dias|edad|puntos|score|cantidad/i.test(dbKey);
        datosOp[dbKey] = looksNumeric ? (coerceNumber(raw) ?? String(raw).trim()) : String(raw).trim();
      }
    }

    toUpsert.push({
      portal_email:        portalEmail,
      external_id:         externalId,
      nombre,
      telefono,
      correo,
      notas,
      datos_operacionales: datosOp,
      estado_actual:       columnMapping.estado_inicial ?? 'activo',
      uploaded_by:         opts.uploadedBy ?? 'portal',
      metadata:            { source_file: filename, source_row: rowN },
    });
  }

  if (toUpsert.length === 0) return result;

  // Upsert por lotes de 200 para no reventar el payload de Supabase.
  const BATCH = 200;
  for (let i = 0; i < toUpsert.length; i += BATCH) {
    const slice = toUpsert.slice(i, i + BATCH);
    const hasExternalId = slice.every((r) => r.external_id);
    const conflictCol   = hasExternalId ? 'portal_email,external_id' : undefined;

    if (conflictCol) {
      const { data, error } = await supabase
        .from('contactos_vivos')
        .upsert(slice, { onConflict: conflictCol, ignoreDuplicates: false })
        .select('id, created_at, updated_at');
      if (error) {
        result.errores.push({ row: i, error: `Batch upsert error: ${error.message}` });
        continue;
      }
      for (const r of data ?? []) {
        // Comparar created_at vs updated_at con tolerancia de 1 segundo para
        // distinguir insert de update reciente.
        const created = new Date(r.created_at as string).getTime();
        const updated = new Date(r.updated_at as string).getTime();
        if (Math.abs(updated - created) < 1000) result.contactos_creados++;
        else result.contactos_actualizados++;
      }
    } else {
      // Sin external_id no podemos upsertear por conflict. Insertamos todo y
      // los duplicados por (telefono/correo) los detectaría un dedupe posterior.
      const { data, error } = await supabase.from('contactos_vivos').insert(slice).select('id');
      if (error) {
        result.errores.push({ row: i, error: `Batch insert error: ${error.message}` });
        continue;
      }
      result.contactos_creados += (data ?? []).length;
    }
  }

  // Cobro batched: 1 por cada contacto (creado o actualizado)
  const totalCargable = result.contactos_creados + result.contactos_actualizados;
  if (opts.agentId && totalCargable > 0) {
    await consumeAiOp(opts.agentId, totalCargable, {
      source: 'import_cartera_contactos',
      label:  `Cartera importada: ${totalCargable} contactos (${filename})`,
    });
  }

  return result;
}
