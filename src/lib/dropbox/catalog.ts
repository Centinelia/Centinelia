/**
 * Dropbox catalog lookup — el meerkat consulta un documento Excel/CSV que el
 * cliente mantiene en su Dropbox (códigos de productos + descripciones) para
 * llenar OCs y facturas.
 *
 * Fuente de verdad: organizations.dropbox_catalog_config JSONB con
 *   { doc_path, sku_column, desc_column, price_column? }
 *
 * Cache in-memory por org+path, TTL 60s. Al vencer, verificamos filesGetMetadata
 * para leer `rev`; si no cambió extendemos TTL sin re-descargar. Esto minimiza
 * ancho de banda cuando el cliente NO edita constantemente.
 *
 * Requiere feature flag organizations.features.dropbox_catalog = true y una
 * integration_accounts activa con provider='dropbox'.
 */
import { Dropbox } from 'dropbox';
import * as XLSX from 'xlsx';
import { decrypt } from '@/lib/crypto';
import { dropboxRefreshToken } from './oauth';
import type { createAdminClient } from '@/lib/supabase/admin';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export interface DropboxCatalogConfig {
  doc_path:      string;   // p. ej. "/Catalogo/codigos.xlsx"
  sku_column:    string;   // header exacto
  desc_column:   string;
  price_column?: string | null;
}

export interface CatalogMatch {
  sku:         string;
  descripcion: string;
  precio?:     string;
  row:         number;
}

interface CacheEntry {
  rev:      string;
  entries:  CatalogMatch[];
  cachedAt: number;
}

const CACHE = new Map<string, CacheEntry>();
const TTL_MS = 60 * 1000;

/** Devuelve access_token válido, refrescando si expiró. Persiste el refresh. */
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
    console.error('[dropbox-catalog] refresh failed:', err);
    await supabase.from('integration_accounts')
      .update({ status: 'needs_reauth' })
      .eq('portal_email', portalEmail)
      .eq('provider', 'dropbox');
    return null;
  }
}

interface Client { client: Dropbox; token: string }

async function getClient(portalEmail: string, supabase: SupabaseClient): Promise<Client | null> {
  const token = await getDropboxAccessToken(portalEmail, supabase);
  if (!token) return null;
  return { client: new Dropbox({ accessToken: token, fetch }), token };
}

/** Baja el archivo y parsea según extension. Retorna filas + rev. */
async function downloadAndParse(client: Dropbox, docPath: string, config: DropboxCatalogConfig): Promise<{ rev: string; entries: CatalogMatch[] }> {
  const res = await client.filesDownload({ path: docPath });
  const rev = (res.result as { rev: string }).rev;
  const fileBinary = (res.result as unknown as { fileBinary: ArrayBuffer | Buffer }).fileBinary;
  const buffer = Buffer.isBuffer(fileBinary) ? fileBinary : Buffer.from(fileBinary);

  const ext = docPath.toLowerCase().split('.').pop() ?? '';
  const rows = ext === 'csv'
    ? parseCsv(buffer)
    : parseXlsx(buffer);

  const entries = rowsToEntries(rows, config);
  return { rev, entries };
}

function parseXlsx(buffer: Buffer): Record<string, unknown>[] {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

function parseCsv(buffer: Buffer): Record<string, unknown>[] {
  // xlsx maneja CSV también vía type: 'string'
  const text = buffer.toString('utf-8');
  const wb = XLSX.read(text, { type: 'string' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  return XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
}

function rowsToEntries(rows: Record<string, unknown>[], config: DropboxCatalogConfig): CatalogMatch[] {
  const out: CatalogMatch[] = [];
  rows.forEach((row, i) => {
    const sku = String(row[config.sku_column] ?? '').trim();
    const desc = String(row[config.desc_column] ?? '').trim();
    if (!sku && !desc) return;
    const entry: CatalogMatch = {
      sku,
      descripcion: desc,
      row: i + 2,  // +2 porque header es fila 1
    };
    if (config.price_column) {
      const p = row[config.price_column];
      if (p !== '' && p != null) entry.precio = String(p);
    }
    out.push(entry);
  });
  return out;
}

/** Lee headers del doc (para poblar dropdowns de config en portal). */
export async function getCatalogHeaders(portalEmail: string, docPath: string, supabase: SupabaseClient): Promise<string[] | null> {
  const client = await getClient(portalEmail, supabase);
  if (!client) return null;

  const res = await client.client.filesDownload({ path: docPath });
  const fileBinary = (res.result as unknown as { fileBinary: ArrayBuffer | Buffer }).fileBinary;
  const buffer = Buffer.isBuffer(fileBinary) ? fileBinary : Buffer.from(fileBinary);

  const ext = docPath.toLowerCase().split('.').pop() ?? '';
  const rows = ext === 'csv' ? parseCsv(buffer) : parseXlsx(buffer);
  const first = rows[0];
  if (!first) return [];
  return Object.keys(first);
}

/** Busca en el catálogo. Retorna matches (top 20) con SKU/descripción/precio. */
export async function searchCatalog(portalEmail: string, config: DropboxCatalogConfig, query: string, opts: { exact?: boolean; limit?: number } = {}): Promise<{ matches: CatalogMatch[]; total: number } | { error: string }> {
  const supabase = (await import('@/lib/supabase/admin')).createAdminClient();
  const client = await getClient(portalEmail, supabase);
  if (!client) return { error: 'Dropbox no conectado o token invalido' };

  const cacheKey = `${portalEmail}:${config.doc_path}`;
  const cached = CACHE.get(cacheKey);
  const now = Date.now();

  let entries: CatalogMatch[];
  if (cached && now - cached.cachedAt < TTL_MS) {
    entries = cached.entries;
  } else {
    // Verifica rev primero — evita re-descarga si el archivo no cambió
    if (cached) {
      try {
        const meta = await client.client.filesGetMetadata({ path: config.doc_path });
        const currentRev = (meta.result as { rev?: string }).rev;
        if (currentRev && currentRev === cached.rev) {
          cached.cachedAt = now;
          entries = cached.entries;
          const filtered = filterMatches(entries, query, opts);
          return { matches: filtered.slice(0, opts.limit ?? 20), total: filtered.length };
        }
      } catch {
        // Ignoramos error de metadata check — caemos a re-download abajo
      }
    }
    try {
      const parsed = await downloadAndParse(client.client, config.doc_path, config);
      CACHE.set(cacheKey, { rev: parsed.rev, entries: parsed.entries, cachedAt: now });
      entries = parsed.entries;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      return { error: `No se pudo leer ${config.doc_path}: ${msg}` };
    }
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

/** Testing helper — vaciar cache. */
export function _clearCatalogCache(): void {
  CACHE.clear();
}
