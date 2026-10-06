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
 *       folio_compra: 'FOLIO FACTURA', fecha_compra: 'FECHA FACTURA',
 *       usd: 'USD', tc: 'TC', costo_mx: 'COSTO MX',
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
  /**
   * Contactos externos para los correos operativos que Nami manda a nombre de la
   * org. Introducido 2026-10-02 para AC Proyectos: Nami notifica a Isabel de
   * TRANE cuando Camila crea una OC o pide la entrega. Si está ausente, los
   * tools requieren `destinatario_email` en cada llamada.
   */
  trane_contacts?: {
    registro_oc?: string;        // email para "regístrame la OC"
    solicitar_entrega?: string;  // email para "mándame los equipos"
  };
}

export interface InventoryContext {
  portalEmail: string;
  token:       string;
  config:      InventoryExcelConfig;
  /**
   * Excel sheet row (1-based) where the historico data body starts.
   * = dataBodyRange.rowIndex + 1
   * Para `AC Proyectos`: header en row 2, data desde row 3 → = 3.
   * Para la mayoría de clientes: header en row 1, data desde row 2 → = 2.
   * Añadido 2026-10-06 porque AC tiene offset=3 y antes toda la codebase
   * asumía 2, metiendo writes 1 fila arriba (off-by-one).
   */
  historicoBodyStartRow: number;
}

export type InventoryResolveError =
  | { error: 'not_configured'; message: string }
  | { error: 'microsoft_disconnected'; message: string }
  | { error: 'refresh_failed'; message: string };

/**
 * Resuelve config + token para operar el inventario Excel de una org.
 * Retorna null en cualquier fallo con un objeto de error tipado.
 *
 * `agentId` opcional: si se pasa, el token Microsoft se resuelve primero
 * desde `email_integrations` (OAuth per-agent del inbox-processor flow).
 * Sin agentId, cae a `integration_accounts` org-level. El fix 2026-10-01
 * (bug AC Proyectos: Nami tenía Outlook en email_integrations pero el
 * adapter solo miraba integration_accounts) requiere este parámetro.
 */
export async function resolveInventoryContext(
  portalEmail: string,
  supabase: SupabaseClient,
  agentId?: string,
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

  const token = await resolveMicrosoftAccessToken(portalEmail, supabase, agentId);
  if ('error' in token) return token;

  // Determina el offset real de donde empiezan los datos en el sheet. Para AC
  // Proyectos el header está en row 2 (data desde row 3). Para otros clientes
  // típicamente row 1 (data desde row 2). Antes esto se asumía fijo = 2 lo
  // que metía bugs off-by-one en AC. Fetch barato (<200ms) + cached en ctx.
  let historicoBodyStartRow = 2;  // default razonable si falla
  try {
    const historico = config.sheets?.historico;
    if (historico?.table) {
      const body = await GraphExcel.getTableDataBodyRange(token.access_token, config.location, historico.table);
      if (body?.rowIndex != null) historicoBodyStartRow = body.rowIndex + 1;
    }
  } catch { /* silent fallback a 2 */ }

  return { portalEmail, token: token.access_token, config, historicoBodyStartRow };
}

/**
 * Circula token Microsoft en orden de scope-adequado para Graph /drives API:
 *   1. `integration_accounts` capability='storage_microsoft' per-agent — OAuth
 *      dedicado del empleado para OneDrive/SharePoint (incluye Files.ReadWrite).
 *   2. `integration_accounts` capability='storage_microsoft' por portal_email —
 *      storage OAuth org-level.
 *   3. `email_integrations` provider='outlook' per-agent — fallback last-resort.
 *      Nota: el scope email (Mail.*, Contacts.*) NO incluye Files.* por diseño
 *      Fase 1 (2026-09-04). Graph /shares devolverá 403 para SharePoint real
 *      aunque pueda funcionar con OneDrive personal del usuario. Preserve el
 *      fallback por si una org tiene config legacy, pero prefiere storage_microsoft.
 *   4. `integration_accounts` capability='email' org-level — path muy legacy.
 */
async function resolveMicrosoftAccessToken(
  portalEmail: string,
  supabase: SupabaseClient,
  agentId?: string,
): Promise<{ access_token: string } | InventoryResolveError> {
  // Path 1: storage OAuth per-agent (scope Files.ReadWrite)
  if (agentId) {
    const { data: perAgent } = await supabase
      .from('integration_accounts')
      .select('access_token, refresh_token, expires_at, status')
      .eq('agent_id', agentId)
      .eq('capability', 'storage_microsoft')
      .neq('status', 'disconnected')
      .maybeSingle();
    if (perAgent?.access_token) {
      return maybeRefreshOutlook({
        accessToken:        perAgent.access_token as string,
        refreshToken:       perAgent.refresh_token as string | null,
        expiresAt:          perAgent.expires_at as string | null,
        refreshIsEncrypted: true,
      }, async (refreshed) => {
        await supabase.from('integration_accounts')
          .update({ access_token: refreshed.access_token, expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(), status: 'active' })
          .eq('agent_id', agentId)
          .eq('capability', 'storage_microsoft');
      });
    }
  }

  // Path 2: storage OAuth org-level
  const { data: orgStorage } = await supabase
    .from('integration_accounts')
    .select('access_token, refresh_token, expires_at, status')
    .eq('portal_email', portalEmail)
    .eq('capability', 'storage_microsoft')
    .neq('status', 'disconnected')
    .maybeSingle();
  if (orgStorage?.access_token) {
    return maybeRefreshOutlook({
      accessToken:        orgStorage.access_token as string,
      refreshToken:       orgStorage.refresh_token as string | null,
      expiresAt:          orgStorage.expires_at as string | null,
      refreshIsEncrypted: true,
    }, async (refreshed) => {
      await supabase.from('integration_accounts')
        .update({ access_token: refreshed.access_token, expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(), status: 'active' })
        .eq('portal_email', portalEmail)
        .eq('capability', 'storage_microsoft');
    });
  }

  // Path 3: email_integrations per-agent (fallback last-resort)
  // Scope email no incluye Files.*: funciona para OneDrive personal del user en
  // casos limitados pero NO para SharePoint. Si falla, el error de Graph llega
  // al caller con mensaje claro.
  if (agentId) {
    const { data: emailInt } = await supabase
      .from('email_integrations')
      .select('access_token, refresh_token, token_expires_at')
      .eq('agent_id', agentId)
      .eq('provider', 'outlook')
      .maybeSingle();
    if (emailInt?.access_token) {
      return maybeRefreshOutlook({
        accessToken:        emailInt.access_token as string,
        refreshToken:       emailInt.refresh_token as string | null,
        expiresAt:          emailInt.token_expires_at as string | null,
        refreshIsEncrypted: true,
      }, async (refreshed) => {
        await supabase.from('email_integrations')
          .update({ access_token: refreshed.access_token, token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString() })
          .eq('agent_id', agentId).eq('provider', 'outlook');
      });
    }
  }

  // Path 4: integration_accounts capability='email' org-level (muy legacy)
  const { data: legacy } = await supabase
    .from('integration_accounts')
    .select('access_token, refresh_token, expires_at, status')
    .eq('portal_email', portalEmail)
    .eq('capability', 'email')
    .eq('provider', 'outlook')
    .neq('status', 'disconnected')
    .maybeSingle();
  if (!legacy) {
    return {
      error:   'microsoft_disconnected',
      message: 'OneDrive/SharePoint no conectado para este empleado. Conéctalo desde el portal → Empleado → Almacenamiento → Microsoft/OneDrive. El OAuth de correo no incluye permisos de archivos.',
    };
  }
  return maybeRefreshOutlook({
    accessToken:        legacy.access_token as string,
    refreshToken:       legacy.refresh_token as string | null,
    expiresAt:          legacy.expires_at as string | null,
    refreshIsEncrypted: true,
  }, async (refreshed) => {
    await supabase.from('integration_accounts')
      .update({ access_token: refreshed.access_token, expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(), status: 'active' })
      .eq('portal_email', portalEmail).eq('provider', 'outlook').eq('capability', 'email');
  });
}

async function maybeRefreshOutlook(
  tok:         { accessToken: string; refreshToken: string | null; expiresAt: string | null; refreshIsEncrypted: boolean },
  persistFresh: (refreshed: { access_token: string; expires_in: number }) => Promise<void>,
): Promise<{ access_token: string } | InventoryResolveError> {
  const expiresAt = tok.expiresAt ? new Date(tok.expiresAt) : null;
  const needsRefresh = !expiresAt || expiresAt.getTime() - Date.now() < 5 * 60 * 1000;
  if (!needsRefresh) return { access_token: tok.accessToken };
  if (!tok.refreshToken) return { access_token: tok.accessToken };

  const { decrypt } = await import('@/lib/crypto');
  const { outlookRefreshToken } = await import('@/lib/email/outlook');
  try {
    const plainRefresh = tok.refreshIsEncrypted ? decrypt(tok.refreshToken) : tok.refreshToken;
    const refreshed = await outlookRefreshToken(plainRefresh);
    await persistFresh(refreshed);
    return { access_token: refreshed.access_token };
  } catch (err) {
    return { error: 'refresh_failed', message: `Refresh outlook falló: ${err instanceof Error ? err.message : 'unknown'}` };
  }
}

// ─── Row lookup helper ───────────────────────────────────────────────────────

export interface RowIndexHit {
  tableRowIndex: number;
  row:           unknown[];
  headersMap:    Record<string, number>;
}

/**
 * Localiza la primera fila del histórico cuya columna SERIE coincide con
 * `serie` (normalizado trim+toUpperCase en ambos lados).
 * Retorna `{tableRowIndex, row, headersMap}` o `null` si no existe.
 *
 * Prerequisito para los patch helpers de Fase 1 (patchEstatusBySerie, etc.)
 * que necesitan resolver índice + headers antes de escribir.
 *
 * Las claves de `headersMap` están normalizadas a mayúsculas (toUpperCase());
 * los callers deben uppercase sus lookups.
 */
export async function findRowIndexBySerie(
  ctx: InventoryContext,
  serie: string,
): Promise<RowIndexHit | null> {
  const [headers, rows] = await Promise.all([
    GraphExcel.getTableHeader(ctx.token, ctx.config.location, ctx.config.sheets.historico.table),
    GraphExcel.listTableRows(ctx.token, ctx.config.location, ctx.config.sheets.historico.table),
  ]);

  const headersMap: Record<string, number> = {};
  headers.forEach((h, i) => { headersMap[String(h).trim().toUpperCase()] = i; });

  const serieColumn = ctx.config.columns_historico.serie;
  const serieColIdx = headersMap[serieColumn.toUpperCase()];
  if (serieColIdx == null) return null;

  const needle = serie.trim().toUpperCase();
  for (const r of rows) {
    const cell = String((r.values as unknown[])[serieColIdx] ?? '').trim().toUpperCase();
    if (cell === needle) {
      return { tableRowIndex: r.index, row: r.values as unknown[], headersMap };
    }
  }
  return null;
}

// ─── Writer helpers ──────────────────────────────────────────────────────────

export interface AddEquipoInput {
  oc:            string;
  modelo:        string;
  serie:         string;
  bodega?:       string;
  tonelada?:     number;
  descripcion?:  string;
  ref?:          string;
  seer?:         string;
  volts?:        string;
  usd?:          number;
  tc?:           number;
  fecha_compra?: string;
  folio_factura?: string;
  fecha_factura?: string;
}

export type AddEquipoResult =
  | { ok: true;  serie: string; bodega_asignada: string | null; row_index: number; after_state: Record<string, unknown> }
  | { ok: false; code: 'serie_already_exists'; existing_row_index: number }
  | { ok: false; code: 'invalid_input'; message: string };

function assignBodegaByTonelada(ton: number | undefined, canonical: string[]): string | null {
  if (ton == null) return null;
  if (ton <= 5 && canonical.includes('FLETEROS')) return 'FLETEROS';
  if (ton >  5 && canonical.includes('CENIZO'))   return 'CENIZO';
  return null;
}

export async function addEquipoRow(
  ctx: InventoryContext,
  input: AddEquipoInput,
): Promise<AddEquipoResult> {
  if (!input.serie?.trim()) return { ok: false, code: 'invalid_input', message: 'serie es requerida' };

  const existing = await findRowIndexBySerie(ctx, input.serie);
  if (existing) return { ok: false, code: 'serie_already_exists', existing_row_index: existing.tableRowIndex };

  const headers = await GraphExcel.getTableHeader(ctx.token, ctx.config.location, ctx.config.sheets.historico.table);
  const idx: Record<string, number> = {};
  headers.forEach((h, i) => { idx[String(h).trim().toUpperCase()] = i; });

  const bodega = input.bodega ?? assignBodegaByTonelada(input.tonelada, ctx.config.bodegas_canonicas);
  const costoMx = (input.usd != null && input.tc != null)
    ? Math.round(input.usd * input.tc * 100) / 100
    : null;

  const col = ctx.config.columns_historico;
  const row: unknown[] = new Array(headers.length).fill('');
  const put = (key: string, val: unknown) => {
    const colName = (col as Record<string, string>)[key];
    if (!colName) return;
    const i = idx[colName.toUpperCase()];
    if (i != null && val != null) row[i] = val;
  };

  put('oc',            input.oc);
  put('modelo',        input.modelo);
  put('serie',         input.serie);
  put('estatus',       'ALMACEN');
  put('bodega',        bodega);
  put('tonelada',      input.tonelada);
  put('descripcion',   input.descripcion);
  put('ref',           input.ref);
  put('seer',          input.seer);
  put('volts',         input.volts);
  put('usd',           input.usd);
  put('tc',            input.tc);
  put('costo_mx',      costoMx);
  put('fecha_compra',  input.fecha_compra ?? new Date().toISOString().slice(0, 10));
  put('folio_factura', input.folio_factura);
  put('fecha_factura', input.fecha_factura);

  const added = await GraphExcel.withSession(ctx.token, ctx.config.location, (session) =>
    GraphExcel.addTableRow(ctx.token, session, ctx.config.sheets.historico.table, row),
  );

  const after_state: Record<string, unknown> = {};
  headers.forEach((h, i) => { after_state[String(h).trim().toUpperCase()] = row[i]; });

  return { ok: true, serie: input.serie.trim(), bodega_asignada: bodega, row_index: (added as { index: number }).index, after_state };
}

// ─── Patch helpers ───────────────────────────────────────────────────────────

export type PatchEstatusResult =
  | { ok: true;  no_op?: boolean; serie: string; estatus_anterior: string; estatus_nuevo: string; before_state: Record<string, unknown>; after_state: Record<string, unknown>; patched_columns: string[]; table_row_index: number }
  | { ok: false; code: 'serie_not_found' };

function cellLetter(colIdx: number): string {
  let s = '';
  let n = colIdx;
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

function rowToState(headers: string[], row: unknown[]): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  headers.forEach((h, i) => { o[String(h).trim().toUpperCase()] = row[i]; });
  return o;
}

export async function patchEstatusBySerie(
  ctx: InventoryContext,
  serie: string,
  nuevo_estatus: string,
): Promise<PatchEstatusResult> {
  const hit = await findRowIndexBySerie(ctx, serie);
  if (!hit) return { ok: false, code: 'serie_not_found' };

  const estatusColName = ctx.config.columns_historico.estatus;
  const estatusIdx = hit.headersMap[estatusColName.toUpperCase()];
  if (estatusIdx === undefined) {
    throw new Error(`Columna de estatus '${estatusColName}' no encontrada en headersMap. Revisa inventory_excel_config.columns_historico.`);
  }
  const estatus_anterior = String(hit.row[estatusIdx] ?? '').toUpperCase();
  const estatus_nuevo = nuevo_estatus.trim().toUpperCase();

  const headers = Object.entries(hit.headersMap).sort((a, b) => a[1] - b[1]).map(([h]) => h);
  const before_state = rowToState(headers, hit.row);

  if (estatus_anterior === estatus_nuevo) {
    return {
      ok: true, no_op: true, serie: serie.trim().toUpperCase(),
      estatus_anterior, estatus_nuevo,
      before_state, after_state: before_state,
      patched_columns: [], table_row_index: hit.tableRowIndex,
    };
  }

  await GraphExcel.withSession(ctx.token, ctx.config.location, async session => {
    const sheet = ctx.config.sheets.historico.name;
    const abs = hit.tableRowIndex + ctx.historicoBodyStartRow;
    await GraphExcel.patchCell(ctx.token, session, sheet, `${cellLetter(estatusIdx)}${abs}`, estatus_nuevo);
  });

  const after_row = [...hit.row]; after_row[estatusIdx] = estatus_nuevo;
  return {
    ok: true, serie: serie.trim().toUpperCase(),
    estatus_anterior, estatus_nuevo,
    before_state, after_state: rowToState(headers, after_row),
    patched_columns: [estatusColName.toUpperCase()],
    table_row_index: hit.tableRowIndex,
  };
}

/**
 * Trata el valor de la columna CLIENTE como "disponible" (equivalente a vacío)
 * si está en blanco o es el placeholder "STOCK" que AC Proyectos usa para
 * marcar equipos aún no asignados. Confirmado por Camila 2026-10-02 en WhatsApp.
 * Case-insensitive y tolera espacios.
 */
function isClienteDisponible(v: unknown): boolean {
  const s = String(v ?? '').trim().toUpperCase();
  return s === '' || s === 'STOCK';
}

export interface PatchClienteInput {
  cliente_nombre:   string;
  vendedor_codigo?: string;
  marcar_separado?: boolean; // default true
  force?:           boolean; // default false
}

export type PatchClienteResult =
  | { ok: true;  serie: string; cliente_asignado: string; vendedor: string | null; estatus_resultante: string; before_state: Record<string, unknown>; after_state: Record<string, unknown>; patched_columns: string[]; table_row_index: number }
  | { ok: false; code: 'serie_not_found' }
  | { ok: false; code: 'cliente_assigned_conflict'; current_cliente: string };

export async function patchClienteBySerie(
  ctx: InventoryContext,
  serie: string,
  input: PatchClienteInput,
): Promise<PatchClienteResult> {
  const hit = await findRowIndexBySerie(ctx, serie);
  if (!hit) return { ok: false, code: 'serie_not_found' };

  const col = ctx.config.columns_historico;
  const clienteIdx = hit.headersMap[col.cliente.toUpperCase()];
  const vendedorIdx = col.vendedor ? hit.headersMap[col.vendedor.toUpperCase()] : undefined;
  const estatusIdx = hit.headersMap[col.estatus.toUpperCase()];

  if (clienteIdx === undefined) {
    throw new Error(`Columna de cliente '${col.cliente}' no encontrada en headersMap. Revisa inventory_excel_config.columns_historico.`);
  }
  if (estatusIdx === undefined) {
    throw new Error(`Columna de estatus '${col.estatus}' no encontrada en headersMap. Revisa inventory_excel_config.columns_historico.`);
  }

  const currentCliente = String(hit.row[clienteIdx] ?? '').trim();
  if (!isClienteDisponible(currentCliente) && !input.force) {
    return { ok: false, code: 'cliente_assigned_conflict', current_cliente: currentCliente };
  }

  const marcar = input.marcar_separado !== false;
  const estatusActual = String(hit.row[estatusIdx] ?? '').toUpperCase();
  const willPatchEstatus = marcar && estatusActual === 'ALMACEN';

  const headers = Object.entries(hit.headersMap).sort((a, b) => a[1] - b[1]).map(([h]) => h);
  const before_state = rowToState(headers, hit.row);

  const patched: string[] = [col.cliente.toUpperCase()];
  const after_row = [...hit.row];
  after_row[clienteIdx] = input.cliente_nombre;
  if (vendedorIdx != null && input.vendedor_codigo) {
    after_row[vendedorIdx] = input.vendedor_codigo;
    patched.push(col.vendedor!.toUpperCase());
  }
  if (willPatchEstatus) {
    after_row[estatusIdx] = 'SEPARADO';
    patched.push(col.estatus.toUpperCase());
  }

  await GraphExcel.withSession(ctx.token, ctx.config.location, async session => {
    const sheet = ctx.config.sheets.historico.name;
    const abs = hit.tableRowIndex + ctx.historicoBodyStartRow;
    await GraphExcel.patchCell(ctx.token, session, sheet, `${cellLetter(clienteIdx)}${abs}`, input.cliente_nombre);
    if (vendedorIdx != null && input.vendedor_codigo) {
      await GraphExcel.patchCell(ctx.token, session, sheet, `${cellLetter(vendedorIdx)}${abs}`, input.vendedor_codigo);
    }
    if (willPatchEstatus) {
      await GraphExcel.patchCell(ctx.token, session, sheet, `${cellLetter(estatusIdx)}${abs}`, 'SEPARADO');
    }
  });

  return {
    ok: true, serie: serie.trim().toUpperCase(),
    cliente_asignado: input.cliente_nombre, vendedor: input.vendedor_codigo ?? null,
    estatus_resultante: willPatchEstatus ? 'SEPARADO' : estatusActual,
    before_state, after_state: rowToState(headers, after_row),
    patched_columns: patched, table_row_index: hit.tableRowIndex,
  };
}

export interface PatchVentaInput {
  folio_venta:         string;
  fecha_venta:         string;
  factura_venta?:      string;
  precio_unitario_mx:  number;
  factor?:             number;
}

export type PatchVentaResult =
  | { ok: true; serie: string; folio_venta: string; precio_unitario_mx: number; factor_calculado: number; before_state: Record<string, unknown>; after_state: Record<string, unknown>; patched_columns: string[]; table_row_index: number }
  | { ok: false; code: 'serie_not_found' }
  | { ok: false; code: 'cannot_compute_factor' };

export async function patchVentaBySerie(
  ctx: InventoryContext,
  serie: string,
  input: PatchVentaInput,
): Promise<PatchVentaResult> {
  const hit = await findRowIndexBySerie(ctx, serie);
  if (!hit) return { ok: false, code: 'serie_not_found' };

  const col = ctx.config.columns_historico;
  const costoMxIdx = col.costo_mx ? hit.headersMap[col.costo_mx.toUpperCase()] : undefined;
  const costoMxVal = costoMxIdx != null ? Number(hit.row[costoMxIdx]) : NaN;

  let factor = input.factor;
  if (factor == null) {
    if (!Number.isFinite(costoMxVal) || costoMxVal <= 0) return { ok: false, code: 'cannot_compute_factor' };
    factor = Math.round((input.precio_unitario_mx / costoMxVal) * 10000) / 10000;
  }

  const folioIdx = hit.headersMap[col.folio_venta.toUpperCase()];
  if (folioIdx === undefined) {
    throw new Error(`Columna de folio_venta '${col.folio_venta}' no encontrada en headersMap. Revisa inventory_excel_config.columns_historico.`);
  }
  const fechaIdx = hit.headersMap[col.fecha_venta.toUpperCase()];
  if (fechaIdx === undefined) {
    throw new Error(`Columna de fecha_venta '${col.fecha_venta}' no encontrada en headersMap. Revisa inventory_excel_config.columns_historico.`);
  }
  const facturaIdx = col.factura_venta ? hit.headersMap[col.factura_venta.toUpperCase()] : undefined;
  const costoVtaIdx = col.costo_venta_mx ? hit.headersMap[col.costo_venta_mx.toUpperCase()] : undefined;

  const headers = Object.entries(hit.headersMap).sort((a, b) => a[1] - b[1]).map(([h]) => h);
  const before_state = rowToState(headers, hit.row);
  const after_row = [...hit.row];

  const patched: string[] = [];
  const sheet = ctx.config.sheets.historico.name;
  const abs = hit.tableRowIndex + ctx.historicoBodyStartRow;

  await GraphExcel.withSession(ctx.token, ctx.config.location, async session => {
    await GraphExcel.patchCell(ctx.token, session, sheet, `${cellLetter(folioIdx)}${abs}`, input.folio_venta);
    after_row[folioIdx] = input.folio_venta; patched.push(col.folio_venta.toUpperCase());

    await GraphExcel.patchCell(ctx.token, session, sheet, `${cellLetter(fechaIdx)}${abs}`, input.fecha_venta);
    after_row[fechaIdx] = input.fecha_venta; patched.push(col.fecha_venta.toUpperCase());

    if (facturaIdx != null && input.factura_venta) {
      await GraphExcel.patchCell(ctx.token, session, sheet, `${cellLetter(facturaIdx)}${abs}`, input.factura_venta);
      after_row[facturaIdx] = input.factura_venta; patched.push(col.factura_venta!.toUpperCase());
    }
    if (costoVtaIdx != null) {
      await GraphExcel.patchCell(ctx.token, session, sheet, `${cellLetter(costoVtaIdx)}${abs}`, input.precio_unitario_mx);
      after_row[costoVtaIdx] = input.precio_unitario_mx; patched.push(col.costo_venta_mx!.toUpperCase());
    }
  });

  return {
    ok: true, serie: serie.trim().toUpperCase(),
    folio_venta: input.folio_venta, precio_unitario_mx: input.precio_unitario_mx,
    factor_calculado: factor,
    before_state, after_state: rowToState(headers, after_row),
    patched_columns: patched, table_row_index: hit.tableRowIndex,
  };
}

export interface PatchSalidaInput {
  folio_hoja:      string;
  cliente_nombre:  string;
  vendedor_codigo?: string;
  fecha?:          string;
  proyecto?:       string;
}

export type SalidaMutation = {
  serie:           string;
  table_row_index: number;
  before_state:    Record<string, unknown>;
  after_state:     Record<string, unknown>;
  patched_columns: string[];
  conflict?:       string;
};

export type PatchSalidaResult =
  | { ok: true; folio_hoja: string; series_registradas: string[]; series_not_found: string[]; conflicts: string[]; mutations: SalidaMutation[]; message: string }
  | { ok: false; code: 'invalid_input'; message: string };

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function patchSalidaBySeries(
  ctx: InventoryContext,
  series: string[],
  input: PatchSalidaInput,
): Promise<PatchSalidaResult> {
  if (input.fecha && !ISO_DATE_RE.test(input.fecha)) {
    return { ok: false, code: 'invalid_input', message: `fecha debe ser YYYY-MM-DD; recibí "${input.fecha}"` };
  }
  const fecha = input.fecha ?? new Date().toISOString().slice(0, 10);
  if (!series.length) return { ok: false, code: 'invalid_input', message: 'series requiere al menos 1 elemento' };

  const col = ctx.config.columns_historico;
  const series_registradas: string[] = [];
  const series_not_found:   string[] = [];
  const conflicts:          string[] = [];
  const mutations:          SalidaMutation[] = [];

  await GraphExcel.withSession(ctx.token, ctx.config.location, async session => {
    const sheet = ctx.config.sheets.historico.name;
    for (const s of series) {
      const hit = await findRowIndexBySerie(ctx, s);
      if (!hit) { series_not_found.push(s); continue; }

      const estatusIdx = hit.headersMap[col.estatus.toUpperCase()];
      if (estatusIdx === undefined) {
        throw new Error(`Columna de estatus '${col.estatus}' no encontrada en headersMap. Revisa inventory_excel_config.columns_historico.`);
      }
      const clienteIdx = hit.headersMap[col.cliente.toUpperCase()];
      if (clienteIdx === undefined) {
        throw new Error(`Columna de cliente '${col.cliente}' no encontrada en headersMap. Revisa inventory_excel_config.columns_historico.`);
      }
      const fechaIdx = hit.headersMap[col.fecha_venta.toUpperCase()];
      if (fechaIdx === undefined) {
        throw new Error(`Columna de fecha_venta '${col.fecha_venta}' no encontrada en headersMap. Revisa inventory_excel_config.columns_historico.`);
      }
      const vendedorIdx = col.vendedor ? hit.headersMap[col.vendedor.toUpperCase()] : undefined;
      const folioSalidaIdx = hit.headersMap['FOLIO SALIDA'];

      const headers = Object.entries(hit.headersMap).sort((a, b) => a[1] - b[1]).map(([h]) => h);
      const before_state = rowToState(headers, hit.row);
      const after_row = [...hit.row];
      const patched: string[] = [];
      let conflictMsg: string | undefined;

      const abs = hit.tableRowIndex + ctx.historicoBodyStartRow;

      await GraphExcel.patchCell(ctx.token, session, sheet, `${cellLetter(estatusIdx)}${abs}`, 'ENTREGADO');
      after_row[estatusIdx] = 'ENTREGADO'; patched.push(col.estatus.toUpperCase());

      const currentCliente = String(hit.row[clienteIdx] ?? '').trim();
      if (isClienteDisponible(currentCliente)) {
        await GraphExcel.patchCell(ctx.token, session, sheet, `${cellLetter(clienteIdx)}${abs}`, input.cliente_nombre);
        after_row[clienteIdx] = input.cliente_nombre; patched.push(col.cliente.toUpperCase());
      } else if (currentCliente.toLowerCase() !== input.cliente_nombre.toLowerCase()) {
        conflictMsg = `serie ${s} ya estaba asignada a "${currentCliente}" (no sobre-escribí)`;
        conflicts.push(conflictMsg);
      }

      if (vendedorIdx != null && input.vendedor_codigo) {
        const currentVend = String(hit.row[vendedorIdx] ?? '').trim();
        if (!currentVend) {
          await GraphExcel.patchCell(ctx.token, session, sheet, `${cellLetter(vendedorIdx)}${abs}`, input.vendedor_codigo);
          after_row[vendedorIdx] = input.vendedor_codigo; patched.push(col.vendedor!.toUpperCase());
        }
      }

      // Overwrite intencional: la fecha de la hoja de salida ES el evento de entrega;
      // cualquier fecha_venta previa (de registros parciales) se corrige con esta.
      await GraphExcel.patchCell(ctx.token, session, sheet, `${cellLetter(fechaIdx)}${abs}`, fecha);
      after_row[fechaIdx] = fecha; patched.push(col.fecha_venta.toUpperCase());

      if (folioSalidaIdx != null && input.folio_hoja) {
        await GraphExcel.patchCell(ctx.token, session, sheet, `${cellLetter(folioSalidaIdx)}${abs}`, input.folio_hoja);
        after_row[folioSalidaIdx] = input.folio_hoja; patched.push('FOLIO SALIDA');
      }

      series_registradas.push(hit.row[hit.headersMap[col.serie.toUpperCase()]] as string);
      mutations.push({ serie: s, table_row_index: hit.tableRowIndex, before_state, after_state: rowToState(headers, after_row), patched_columns: patched, ...(conflictMsg ? { conflict: conflictMsg } : {}) });
    }
  });

  const message = `Hoja de salida ${input.folio_hoja} registrada: ${series_registradas.length} equipos entregados a ${input.cliente_nombre}.${series_not_found.length ? ` Series no encontradas: ${series_not_found.join(', ')}.` : ''}`;
  return { ok: true, folio_hoja: input.folio_hoja, series_registradas, series_not_found, conflicts, mutations, message };
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

// ─── Audit log ───────────────────────────────────────────────────────────────

export async function insertMutationLog(
  supabase: SupabaseClient,
  entry: {
    portal_email:    string;
    agent_id:        string | null;
    tool_name:       string;
    serie:           string | null;
    table_row_index: number | null;
    before_state:    Record<string, unknown> | null;
    after_state:     Record<string, unknown>;
    patched_columns: string[];
    metadata:        Record<string, unknown> | null;
    ops_charged:     number;
    success:         boolean;
    error_code:      string | null;
  },
): Promise<void> {
  const { error } = await supabase.from('inventory_mutations_log').insert(entry);
  if (error) console.error('[inventory-mutations-log] insert failed:', error.message);
}

// ─── Re-export de piezas Graph que los tools quizá necesiten ─────────────────
export { GraphExcel };
