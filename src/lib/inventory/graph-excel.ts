/**
 * Microsoft Graph — Excel workbook API wrapper.
 *
 * Wraps las operaciones de workbook que Nami necesita para operar el archivo
 * de inventario (tabla Excel oficial en SharePoint/OneDrive):
 *
 *  - Sessions con `workbook-session-id` para persistir cambios sin race
 *    conditions con Tania editando en vivo (60 min TTL).
 *  - Table row add — respeta fórmulas de la tabla (no romper Tabla6).
 *  - Range read / range patch — para hojas fuera de tabla (STOCK, BACKLOG).
 *
 * Fuente: docs.microsoft.com/en-us/graph/api/resources/excel
 *
 * Reutiliza el access_token que ya circula en integration_accounts (provider=
 * 'outlook' con capability 'email') vía createMicrosoftConnector. NO abre OAuth
 * nuevo — el mismo consent que ya autoriza Outlook/Files cubre workbook.
 */
const GRAPH = 'https://graph.microsoft.com/v1.0';

export type ExcelDriveScope =
  | { type: 'me' }                                    // /me/drive
  | { type: 'user'; userId: string }                  // /users/{userId}/drive
  | { type: 'site'; siteId: string; driveId?: string }; // /sites/{siteId}/drive[/drives/{driveId}]

export interface ExcelWorkbookLocation {
  scope:  ExcelDriveScope;
  itemId: string;
}

export interface ExcelSession {
  id:       string;
  persist:  boolean;
  location: ExcelWorkbookLocation;
}

/**
 * Construye el prefijo `/me/drive/items/{itemId}` o su equivalente para SharePoint.
 */
function itemPrefix(loc: ExcelWorkbookLocation): string {
  const { scope, itemId } = loc;
  switch (scope.type) {
    case 'me':
      return `${GRAPH}/me/drive/items/${itemId}`;
    case 'user':
      return `${GRAPH}/users/${encodeURIComponent(scope.userId)}/drive/items/${itemId}`;
    case 'site': {
      const drivePart = scope.driveId ? `/drives/${scope.driveId}` : '/drive';
      return `${GRAPH}/sites/${scope.siteId}${drivePart}/items/${itemId}`;
    }
  }
}

function headers(token: string, sessionId?: string): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  if (sessionId) h['workbook-session-id'] = sessionId;
  return h;
}

async function graphFetch(url: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text();
    throw new GraphExcelError(res.status, body, url);
  }
  if (res.status === 204) return null;
  return res.json();
}

export class GraphExcelError extends Error {
  constructor(public status: number, public body: string, public url: string) {
    super(`Graph Excel ${status}: ${body.slice(0, 500)}`);
  }
}

/**
 * Crea sesión Excel con persistencia (writes se guardan en el archivo).
 * TTL ~60 min. Cerrar con closeSession al terminar el batch.
 */
export async function createSession(
  token: string,
  loc: ExcelWorkbookLocation,
  persist = true,
): Promise<ExcelSession> {
  const data = await graphFetch(`${itemPrefix(loc)}/workbook/createSession`, {
    method: 'POST',
    headers: headers(token),
    body:   JSON.stringify({ persistChanges: persist }),
  }) as { id: string; persistChanges: boolean };
  return { id: data.id, persist: data.persistChanges, location: loc };
}

export async function closeSession(token: string, session: ExcelSession): Promise<void> {
  await graphFetch(`${itemPrefix(session.location)}/workbook/closeSession`, {
    method: 'POST',
    headers: headers(token, session.id),
  });
}

/**
 * Ejecuta un batch de operaciones dentro de una sesión y la cierra al final,
 * incluso si el batch throws. Uso preferido para escrituras.
 */
export async function withSession<T>(
  token: string,
  loc: ExcelWorkbookLocation,
  fn: (session: ExcelSession) => Promise<T>,
): Promise<T> {
  const session = await createSession(token, loc, true);
  try {
    return await fn(session);
  } finally {
    try { await closeSession(token, session); }
    catch (err) { console.error('[graph-excel] closeSession failed:', err); }
  }
}

// ─── Tables ──────────────────────────────────────────────────────────────────

export interface ExcelTableRow {
  index:  number;
  values: unknown[];
}

/**
 * Lee todas las filas de una tabla (respeta el rango dinámico de la tabla).
 * Nota: en tablas grandes considerar paginar con `$top` + `$skip` — este helper
 * lee todo de un jalón, ok para las 5289 filas del INVENTARIO de AC pero
 * revisar si el archivo crece a decenas de miles.
 */
export async function listTableRows(
  token: string,
  loc: ExcelWorkbookLocation,
  tableName: string,
  sessionId?: string,
): Promise<ExcelTableRow[]> {
  const data = await graphFetch(
    `${itemPrefix(loc)}/workbook/tables/${encodeURIComponent(tableName)}/rows`,
    { method: 'GET', headers: headers(token, sessionId) },
  ) as { value: Array<{ index: number; values: unknown[][] }> };
  return (data.value ?? []).map(r => ({
    index:  r.index,
    values: r.values[0] ?? [],
  }));
}

export async function getTableHeader(
  token: string,
  loc: ExcelWorkbookLocation,
  tableName: string,
  sessionId?: string,
): Promise<string[]> {
  const data = await graphFetch(
    `${itemPrefix(loc)}/workbook/tables/${encodeURIComponent(tableName)}/headerRowRange`,
    { method: 'GET', headers: headers(token, sessionId) },
  ) as { values: string[][] };
  return (data.values?.[0] ?? []).map(String);
}

/**
 * Agrega una fila a la tabla. Graph replica las fórmulas de la columna al
 * insertar la fila — por eso los slots calculados van como null en `values`,
 * los llena Excel automáticamente.
 */
export async function addTableRow(
  token: string,
  session: ExcelSession,
  tableName: string,
  values: unknown[],
): Promise<{ index: number }> {
  const data = await graphFetch(
    `${itemPrefix(session.location)}/workbook/tables/${encodeURIComponent(tableName)}/rows/add`,
    {
      method:  'POST',
      headers: headers(token, session.id),
      body:    JSON.stringify({ values: [values] }),
    },
  ) as { index: number };
  return { index: data.index };
}

// ─── Ranges ──────────────────────────────────────────────────────────────────

export interface ExcelRange {
  address: string;
  values:  unknown[][];
  formulas?: string[][];
}

export async function readRange(
  token: string,
  loc: ExcelWorkbookLocation,
  sheet: string,
  address: string,
  sessionId?: string,
): Promise<ExcelRange> {
  const data = await graphFetch(
    `${itemPrefix(loc)}/workbook/worksheets/${encodeURIComponent(sheet)}/range(address='${encodeURIComponent(address)}')`,
    { method: 'GET', headers: headers(token, sessionId) },
  ) as { address: string; values: unknown[][]; formulas: string[][] };
  return { address: data.address, values: data.values ?? [], formulas: data.formulas ?? [] };
}

/**
 * Escribe valores en un rango específico. NO usar sobre celdas con fórmula
 * (revisar `readRange().formulas` primero si hay duda). Rompes lo calculado.
 */
export async function patchRange(
  token: string,
  session: ExcelSession,
  sheet: string,
  address: string,
  values: unknown[][],
): Promise<void> {
  await graphFetch(
    `${itemPrefix(session.location)}/workbook/worksheets/${encodeURIComponent(sheet)}/range(address='${encodeURIComponent(address)}')`,
    {
      method:  'PATCH',
      headers: headers(token, session.id),
      body:    JSON.stringify({ values }),
    },
  );
}

/**
 * Escribe un único valor en una celda por dirección (ej. 'T15'). Wrapper
 * pragmático sobre patchRange para actualizaciones puntuales que dominan el
 * uso de Nami (cambio de status, transferencia de bodega).
 */
export async function patchCell(
  token: string,
  session: ExcelSession,
  sheet: string,
  address: string,
  value: unknown,
): Promise<void> {
  await patchRange(token, session, sheet, address, [[value]]);
}

// ─── Worksheets discovery ────────────────────────────────────────────────────

export async function listWorksheets(
  token: string,
  loc: ExcelWorkbookLocation,
  sessionId?: string,
): Promise<Array<{ id: string; name: string; position: number }>> {
  const data = await graphFetch(
    `${itemPrefix(loc)}/workbook/worksheets?$select=id,name,position`,
    { method: 'GET', headers: headers(token, sessionId) },
  ) as { value: Array<{ id: string; name: string; position: number }> };
  return data.value ?? [];
}

export async function listTables(
  token: string,
  loc: ExcelWorkbookLocation,
  sessionId?: string,
): Promise<Array<{ id: string; name: string }>> {
  const data = await graphFetch(
    `${itemPrefix(loc)}/workbook/tables?$select=id,name`,
    { method: 'GET', headers: headers(token, sessionId) },
  ) as { value: Array<{ id: string; name: string }> };
  return data.value ?? [];
}
