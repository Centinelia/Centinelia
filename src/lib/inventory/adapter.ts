/**
 * Inventory adapter — high-level API sobre graph-excel.ts.
 *
 * Resuelve la config org-level de inventario (ubicación del archivo,
 * mapeo de columnas, listas canónicas de bodegas/encargados) + circulación
 * del access_token Microsoft. Los tools de Nami en el executor solo dependen
 * de esta capa, no de Graph directo.
 *
 * Config vive en `organizations.inventory_excel_config` (JSONB). Schema:
 *
 *   {
 *     location: { scope: { type: 'site', siteId: '...', driveId: '...' }, itemId: '...' },
 *     sheets: {
 *       historico: { name: 'INVENTARIO', table: 'Tabla6' },
 *       stock:     { name: 'STOCK', header_row: 1, ideal_column: 'T', stock_column: 'J', modelo_column: 'H', propuesta_column: 'W' },
 *       backlog:   { name: 'BACKLOG', start_row: 5 }
 *     },
 *     columns_historico: {
 *       oc: 'OC', modelo: 'MODELO', serie: 'SERIE', estatus: 'ESTATUS',
 *       bodega: 'BODEGA', vendedor: 'VEND', cliente: 'CLIENTE',
 *       folio_venta: 'FOLIO', fecha_venta: 'FECHA DE VENTA',
 *       factura_venta: 'FACTURA', costo_venta_mx: 'COSTO VTA (MX)'
 *     },
 *     estatus_validos: ['ALMACEN', 'SEPARADO', 'ENTREGADO', 'PENDIENTE', 'PEDIDO', 'DEVUELTO', 'DESHABILITADO'],
 *     bodegas_canonicas: ['FLETEROS', 'CENIZO', 'PORTEO', 'TRANE'],
 *     bodegas_aliases: { 'FLETERO': 'FLETEROS' },
 *     encargados_reposicion: ['angeles@acproyectos.com']
 *   }
 *
 * El schema es intencionalmente flexible: cada org mapea sus propios headers.
 * Piloto AC Proyectos define los defaults documentados en
 * [[handoff-ac-proyectos-inventarios]].
 */
import type { createAdminClient } from '@/lib/supabase/admin';
import type { ExcelWorkbookLocation } from './graph-excel';
import * as GraphExcel from './graph-excel';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export interface InventoryExcelConfig {
  location: ExcelWorkbookLocation;
  sheets: {
    historico: { name: string; table: string };
    stock:     { name: string; header_row: number; ideal_column: string; stock_column: string; modelo_column: string; propuesta_column: string };
    backlog?:  { name: string; start_row: number };
  };
  columns_historico: Record<string, string>;
  estatus_validos: string[];
  bodegas_canonicas: string[];
  bodegas_aliases?: Record<string, string>;
  encargados_reposicion?: string[];
}

export interface InventoryContext {
  portalEmail: string;
  token:       string;
  config:      InventoryExcelConfig;
}

export type InventoryResolveError =
  | { error: 'not_configured'; message: string }
  | { error: 'microsoft_disconnected'; message: string }
  | { error: 'refresh_failed'; message: string };

/**
 * Resuelve config + token para operar el inventario Excel de una org.
 * Retorna null en cualquier fallo con un objeto de error tipado.
 */
export async function resolveInventoryContext(
  portalEmail: string,
  supabase: SupabaseClient,
): Promise<InventoryContext | InventoryResolveError> {
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('inventory_excel_config')
    .eq('portal_email', portalEmail)
    .maybeSingle();
  if (orgErr) return { error: 'not_configured', message: `Query organizations falló: ${orgErr.message}` };
  const config = org?.inventory_excel_config as InventoryExcelConfig | null;
  if (!config?.location?.itemId) {
    return { error: 'not_configured', message: 'La organización no tiene inventory_excel_config seteado. Configura el archivo Excel en el portal → Integraciones → Inventario.' };
  }

  const token = await resolveMicrosoftAccessToken(portalEmail, supabase);
  if ('error' in token) return token;

  return { portalEmail, token: token.access_token, config };
}

/**
 * Circula token Microsoft (outlook) desde integration_accounts. Mismo patrón
 * que src/lib/catalog/providers.ts — refresca si está por vencer.
 */
async function resolveMicrosoftAccessToken(
  portalEmail: string,
  supabase: SupabaseClient,
): Promise<{ access_token: string } | InventoryResolveError> {
  const { data: acct } = await supabase
    .from('integration_accounts')
    .select('access_token, refresh_token, expires_at, status')
    .eq('portal_email', portalEmail)
    .eq('capability', 'email')
    .eq('provider', 'outlook')
    .neq('status', 'disconnected')
    .maybeSingle();
  if (!acct) return { error: 'microsoft_disconnected', message: 'Outlook/Microsoft no conectado. Conéctalo desde el portal para operar el inventario en SharePoint.' };

  let accessToken = acct.access_token as string;
  const expiresAt = acct.expires_at ? new Date(acct.expires_at as string) : null;
  const needsRefresh = !expiresAt || expiresAt.getTime() - Date.now() < 5 * 60 * 1000;
  if (needsRefresh && acct.refresh_token) {
    const { decrypt } = await import('@/lib/crypto');
    const plainRefresh = decrypt(acct.refresh_token as string);
    const { outlookRefreshToken } = await import('@/lib/email/outlook');
    try {
      const refreshed = await outlookRefreshToken(plainRefresh);
      accessToken = refreshed.access_token;
      await supabase.from('integration_accounts')
        .update({
          access_token: refreshed.access_token,
          expires_at:   new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
          status:       'active',
        })
        .eq('portal_email', portalEmail)
        .eq('provider', 'outlook')
        .eq('capability', 'email');
    } catch (err) {
      return { error: 'refresh_failed', message: `Refresh outlook falló: ${err instanceof Error ? err.message : 'unknown'}` };
    }
  }
  return { access_token: accessToken };
}

// ─── Historico (Excel Table) helpers ─────────────────────────────────────────

export interface HistoricoRowMapped {
  index:   number;                    // Fila absoluta dentro de la tabla
  values:  Record<string, unknown>;   // Campo lógico → valor
  raw:     unknown[];                 // Fila cruda por si el consumer necesita índices
}

/**
 * Lista todas las filas del histórico mapeadas por nombre lógico de campo.
 * Devuelve `values.{campo_logico}` según config.columns_historico.
 */
export async function listHistorico(ctx: InventoryContext): Promise<HistoricoRowMapped[]> {
  const { token, config } = ctx;
  const { historico } = config.sheets;
  const [headers, rows] = await Promise.all([
    GraphExcel.getTableHeader(token, config.location, historico.table),
    GraphExcel.listTableRows(token, config.location, historico.table),
  ]);
  const headerIndex = new Map(headers.map((h, i) => [h, i]));
  const invertedCols = Object.entries(config.columns_historico); // [logicName, headerName]
  return rows.map(r => {
    const values: Record<string, unknown> = {};
    for (const [logicName, headerName] of invertedCols) {
      const idx = headerIndex.get(headerName);
      if (idx !== undefined) values[logicName] = r.values[idx];
    }
    return { index: r.index, values, raw: r.values };
  });
}

/**
 * Busca por número de serie (campo lógico 'serie'). Devuelve la primera coincidencia.
 */
export async function findBySerie(ctx: InventoryContext, serie: string): Promise<HistoricoRowMapped | null> {
  const rows = await listHistorico(ctx);
  const target = String(serie).trim().toUpperCase();
  return rows.find(r => String(r.values.serie ?? '').trim().toUpperCase() === target) ?? null;
}

/**
 * Lista todas las filas de un MODELO específico (útil para "cuánto tienes de X").
 */
export async function findByModelo(ctx: InventoryContext, modelo: string): Promise<HistoricoRowMapped[]> {
  const rows = await listHistorico(ctx);
  const target = String(modelo).trim().toUpperCase();
  return rows.filter(r => String(r.values.modelo ?? '').trim().toUpperCase() === target);
}

// ─── Stock sheet helpers ─────────────────────────────────────────────────────

export interface StockRow {
  row:              number;
  modelo:           string;
  stock_actual:     number;
  ideal:            number;
  propuesta_pedir:  number | null;
}

/**
 * Lee la hoja STOCK completa mapeando modelo/stock/ideal según config.
 * El rango se calcula desde `header_row + 1` hasta que se agota `modelo`.
 */
export async function readStock(ctx: InventoryContext, maxRows = 500): Promise<StockRow[]> {
  const { token, config } = ctx;
  const { stock } = config.sheets;
  const startRow = stock.header_row + 1;
  const endRow   = startRow + maxRows - 1;
  const cols = [stock.modelo_column, stock.stock_column, stock.ideal_column, stock.propuesta_column].sort();
  const first = cols[0];
  const last  = cols[cols.length - 1];
  const range = `${first}${startRow}:${last}${endRow}`;
  const { values } = await GraphExcel.readRange(token, config.location, stock.name, range);
  const relIdx = (colLetter: string) => colLetter.charCodeAt(0) - first.charCodeAt(0);
  const out: StockRow[] = [];
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const modelo = String(row[relIdx(stock.modelo_column)] ?? '').trim();
    if (!modelo) continue;
    const stockActual  = Number(row[relIdx(stock.stock_column)] ?? 0);
    const idealVal     = Number(row[relIdx(stock.ideal_column)] ?? 0);
    const propuesta    = row[relIdx(stock.propuesta_column)];
    out.push({
      row:              startRow + i,
      modelo,
      stock_actual:     isNaN(stockActual) ? 0 : stockActual,
      ideal:            isNaN(idealVal) ? 0 : idealVal,
      propuesta_pedir:  propuesta == null || propuesta === '' ? null : Number(propuesta),
    });
  }
  return out;
}

/**
 * Modelos bajo el IDEAL. Devuelve el faltante (ideal - stock_actual) por modelo.
 * Cuando `faltante <= 0`, el modelo se excluye.
 */
export function computeReposiciones(stock: StockRow[]): Array<{ modelo: string; faltante: number; stock_actual: number; ideal: number }> {
  return stock
    .map(s => ({
      modelo:       s.modelo,
      faltante:     Math.max(0, s.ideal - s.stock_actual),
      stock_actual: s.stock_actual,
      ideal:        s.ideal,
    }))
    .filter(x => x.faltante > 0)
    .sort((a, b) => b.faltante - a.faltante);
}

// ─── Bodegas canónicas ──────────────────────────────────────────────────────

/**
 * Normaliza un nombre de bodega contra el catálogo canónico + aliases del config.
 * Retorna `{ canonical, was_alias }` o `null` si no está en el catálogo.
 */
export function normalizeBodega(ctx: InventoryContext, raw: string): { canonical: string; was_alias: boolean } | null {
  const cleaned = String(raw ?? '').trim().toUpperCase();
  if (!cleaned) return null;
  if (ctx.config.bodegas_canonicas.includes(cleaned)) return { canonical: cleaned, was_alias: false };
  const aliasTarget = ctx.config.bodegas_aliases?.[cleaned];
  if (aliasTarget && ctx.config.bodegas_canonicas.includes(aliasTarget)) return { canonical: aliasTarget, was_alias: true };
  return null;
}

// ─── Re-export de piezas Graph que los tools quizá necesiten ─────────────────
export { GraphExcel };
