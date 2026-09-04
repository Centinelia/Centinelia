/**
 * Cloud catalog lookup — el meerkat consulta un documento Excel/CSV que el
 * cliente mantiene en Dropbox, Google Drive u OneDrive para llenar OCs, facturas
 * y cotizaciones con el código correcto por pieza.
 *
 * Fuente de verdad: organizations.catalog_config JSONB con
 *   { provider: 'dropbox' | 'google' | 'microsoft',
 *     doc_path: string,   // Dropbox usa path '/x/y.xlsx', Google/Microsoft usa fileId
 *     sku_column, desc_column, price_column? }
 *
 * Cache in-memory por org+path, TTL 60s. Al vencer, verifica metadata para
 * invalidar sin re-descargar si el archivo no cambió.
 *
 * Requiere feature flag organizations.features.cloud_catalog = true y una
 * integration_accounts activa con el provider elegido.
 */
import { Dropbox } from 'dropbox';
import * as XLSX from 'xlsx';
import { decrypt } from '@/lib/crypto';
import { dropboxRefreshToken } from '@/lib/dropbox/oauth';
import type { createAdminClient } from '@/lib/supabase/admin';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export type CatalogProvider = 'dropbox' | 'google' | 'microsoft';

export interface CatalogConfig {
  provider:     CatalogProvider;
  doc_path:     string;
  sku_column:   string;
  desc_column:  string;
  price_column?: string | null;
}

export interface CatalogMatch {
  sku:         string;
  descripcion: string;
  precio?:     string;
  row:         number;
}

interface CacheEntry {
  fingerprint: string;   // rev (Dropbox) o etag/modifiedTime (Google/Microsoft)
  entries:     CatalogMatch[];
  cachedAt:    number;
}

const CACHE = new Map<string, CacheEntry>();
const TTL_MS = 60 * 1000;

/** Devuelve access_token válido de Dropbox, refrescando si expiró. */
export async function getDropboxAccessToken(portalEmail: string, supabase: SupabaseClient): Promise<string | null> {
  const { data: row } = await supabase
    .from('integration_accounts')
    .select('access_token, refresh_token, expires_at, status')
    .eq('portal_email', portalEmail)
    .eq('provider', 'dropbox')
    .maybeSingle();

  if (!row || row.status === 'disconnected') return null;
  if (!row.access_token) return null;

  const expiresAt = row.expires_at ? new Date(row.expires_at) : null;
  const needsRefresh = !expiresAt || expiresAt.getTime() - Date.now() < 5 * 60 * 1000;
  if (!needsRefresh) return row.access_token;
  if (!row.refresh_token) return row.access_token;

  try {
    const plainRefresh = decrypt(row.refresh_token);
    const refreshed = await dropboxRefreshToken(plainRefresh);
    const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
    await supabase.from('integration_accounts')
      .update({ access_token: refreshed.access_token, expires_at: newExpiresAt, status: 'active' })
      .eq('portal_email', portalEmail)
      .eq('provider', 'dropbox');
    return refreshed.access_token;
  } catch (err) {
    console.error('[catalog/lookup] dropbox refresh failed:', err);
    await supabase.from('integration_accounts')
      .update({ status: 'needs_reauth' })
      .eq('portal_email', portalEmail)
      .eq('provider', 'dropbox');
    return null;
  }
}

/** Baja el archivo + devuelve fingerprint para caché — routed por provider. */
async function downloadWithFingerprint(portalEmail: string, config: CatalogConfig, supabase: SupabaseClient, agentId?: string): Promise<{ fingerprint: string; buffer: Buffer } | { error: string }> {
  if (config.provider === 'dropbox') {
    const token = await getDropboxAccessToken(portalEmail, supabase);
    if (!token) return { error: 'Dropbox no conectado o token invalido' };
    const dbx = new Dropbox({ accessToken: token, fetch });
    try {
      const res = await dbx.filesDownload({ path: config.doc_path });
      const fingerprint = (res.result as { rev: string }).rev;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bin = (res.result as any).fileBinary as ArrayBuffer | Buffer;
      const buffer = Buffer.isBuffer(bin) ? bin : Buffer.from(bin);
      return { fingerprint, buffer };
    } catch (err) {
      return { error: `Dropbox: ${err instanceof Error ? err.message : 'unknown'}` };
    }
  }

  // Google / Microsoft: usar FilesConnector genérico via resolveFilesConnector.
  // fileId es el doc_path del config (para Drive es un fileId opaco, para OneDrive un item id).
  // agentId opcional habilita lookup per-agent capability='storage_google'/'storage_microsoft' (Fase 2).
  const { resolveFilesConnector } = await import('./providers');
  const connResult = await resolveFilesConnector(portalEmail, config.provider, supabase, agentId);
  if ('error' in connResult) return connResult;
  const dl = await connResult.files.download(config.doc_path, '');
  if (!dl) return { error: 'No se pudo descargar el archivo. Verifica el ID.' };
  // Fingerprint aproximado: hash del buffer size + primer/último kb. Cheap y estable.
  const fingerprint = `${dl.buffer.byteLength}:${dl.buffer.subarray(0, 32).toString('hex')}:${dl.buffer.subarray(-32).toString('hex')}`;
  return { fingerprint, buffer: dl.buffer };
}

/** Verifica si el archivo cambió (via rev/metadata) sin re-descargar. */
async function checkFingerprint(portalEmail: string, config: CatalogConfig, supabase: SupabaseClient): Promise<string | null> {
  if (config.provider === 'dropbox') {
    const token = await getDropboxAccessToken(portalEmail, supabase);
    if (!token) return null;
    const dbx = new Dropbox({ accessToken: token, fetch });
    try {
      const meta = await dbx.filesGetMetadata({ path: config.doc_path });
      return (meta.result as { rev?: string }).rev ?? null;
    } catch { return null; }
  }
  // Google/Microsoft: metadata check no está implementado en FilesConnector,
  // así que retornamos null y el flujo cae a re-download.
  return null;
}

function parseXlsx(buffer: Buffer): Record<string, unknown>[] {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

function parseCsv(buffer: Buffer): Record<string, unknown>[] {
  const text = buffer.toString('utf-8');
  const wb = XLSX.read(text, { type: 'string' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  return XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
}

function rowsToEntries(rows: Record<string, unknown>[], config: CatalogConfig): CatalogMatch[] {
  const out: CatalogMatch[] = [];
  rows.forEach((row, i) => {
    const sku = String(row[config.sku_column] ?? '').trim();
    const desc = String(row[config.desc_column] ?? '').trim();
    if (!sku && !desc) return;
    const entry: CatalogMatch = { sku, descripcion: desc, row: i + 2 };
    if (config.price_column) {
      const p = row[config.price_column];
      if (p !== '' && p != null) entry.precio = String(p);
    }
    out.push(entry);
  });
  return out;
}

/** Lee headers del doc (para dropdowns de config en portal). */
export async function getCatalogHeaders(portalEmail: string, provider: CatalogProvider, docPath: string, supabase: SupabaseClient): Promise<string[] | { error: string }> {
  const config: CatalogConfig = { provider, doc_path: docPath, sku_column: '', desc_column: '' };
  const dl = await downloadWithFingerprint(portalEmail, config, supabase);
  if ('error' in dl) return dl;
  const ext = docPath.toLowerCase().split('.').pop() ?? '';
  const rows = ext === 'csv' ? parseCsv(dl.buffer) : parseXlsx(dl.buffer);
  const first = rows[0];
  return first ? Object.keys(first) : [];
}

/** Busca en el catálogo. Retorna matches (top 20) con SKU/descripción/precio.
 *
 * agentId opcional — cuando se provee, se pasa a resolveFilesConnector para
 * habilitar lookup per-agent por capability='storage_google'/'storage_microsoft'
 * (Fase 2, 2026-09-04). Sin agentId usa el fallback org-level (retrocompat).
 */
export async function searchCatalog(portalEmail: string, config: CatalogConfig, query: string, opts: { exact?: boolean; limit?: number; agentId?: string } = {}): Promise<{ matches: CatalogMatch[]; total: number } | { error: string }> {
  const supabase = (await import('@/lib/supabase/admin')).createAdminClient();

  const cacheKey = `${portalEmail}:${config.provider}:${config.doc_path}`;
  const cached = CACHE.get(cacheKey);
  const now = Date.now();

  let entries: CatalogMatch[];
  if (cached && now - cached.cachedAt < TTL_MS) {
    entries = cached.entries;
  } else {
    // TTL vencido: intenta verificar fingerprint sin descargar
    if (cached) {
      const currentFp = await checkFingerprint(portalEmail, config, supabase);
      if (currentFp && currentFp === cached.fingerprint) {
        cached.cachedAt = now;
        entries = cached.entries;
        const filtered = filterMatches(entries, query, opts);
        return { matches: filtered.slice(0, opts.limit ?? 20), total: filtered.length };
      }
    }
    const dl = await downloadWithFingerprint(portalEmail, config, supabase, opts.agentId);
    if ('error' in dl) return dl;
    const ext = config.doc_path.toLowerCase().split('.').pop() ?? '';
    const rows = ext === 'csv' ? parseCsv(dl.buffer) : parseXlsx(dl.buffer);
    entries = rowsToEntries(rows, config);
    CACHE.set(cacheKey, { fingerprint: dl.fingerprint, entries, cachedAt: now });
  }

  const filtered = filterMatches(entries, query, opts);
  return { matches: filtered.slice(0, opts.limit ?? 20), total: filtered.length };
}

function filterMatches(entries: CatalogMatch[], query: string, opts: { exact?: boolean }): CatalogMatch[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  if (opts.exact) {
    return entries.filter(e => e.sku.toLowerCase() === q);
  }
  return entries.filter(e =>
    e.sku.toLowerCase().includes(q) ||
    e.descripcion.toLowerCase().includes(q)
  );
}

/** Testing helper. */
export function _clearCatalogCache(): void {
  CACHE.clear();
}
