import type { createAdminClient } from '@/lib/supabase/admin';
import type { Tramite, CatalogoItemFields } from './types';
import { callTramiteEndpoint } from './client';
import { isMockMode, loadFixture } from './mock';

type SupabaseClient = ReturnType<typeof createAdminClient>;

const MAX_ITEMS = 20;

/**
 * Extrae un arreglo de items desde el body de una respuesta siguiendo un path
 * con puntos (dot-separated). Si path es undefined el body mismo es el arreglo.
 *
 * Ejemplos:
 *   extractItems({ data: [...] }, "data")           → [...]
 *   extractItems({ result: { items: [...] } }, "result.items") → [...]
 *   extractItems([...], undefined)                   → [...]
 */
function extractItems(body: unknown, path: string | undefined): unknown[] {
  if (path === undefined || path === '') {
    return Array.isArray(body) ? body : [];
  }
  const segments = path.split('.');
  let current: unknown = body;
  for (const seg of segments) {
    if (current == null || typeof current !== 'object') return [];
    current = (current as Record<string, unknown>)[seg];
  }
  return Array.isArray(current) ? current : [];
}

/**
 * Mapea un item raw a { id, label, extra } según la config `item_fields`.
 */
function mapItem(
  raw:    unknown,
  fields: CatalogoItemFields,
): { id: string; label: string; extra?: string[] } | null {
  if (raw == null || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const id    = String(obj[fields.id]    ?? '');
  const label = String(obj[fields.label] ?? '');
  if (!id && !label) return null;
  const extra = fields.extra?.map(f => String(obj[f] ?? ''));
  return { id, label, ...(extra?.length ? { extra } : {}) };
}

/**
 * Resuelve path params estilo `{escuela_id}` en la URL del endpoint de catálogo
 * usando el mapa `filtros`. Los parámetros no resueltos se dejan tal cual.
 */
function resolvePath(endpointTemplate: string, filtros: Record<string, string>): string {
  return endpointTemplate.replace(/\{(\w+)\}/g, (_, key) =>
    key in filtros ? encodeURIComponent(filtros[key]) : `{${key}}`,
  );
}

/**
 * Obtiene los items de un catálogo para un trámite.
 *
 * @param tramite     - Configuración del trámite.
 * @param catalogoKey - Valor de `Catalogo.key` a buscar.
 * @param filtros     - Mapa de valores usados para: path params, y query_param search.
 *                      Si el catálogo tiene `query_param`, el valor bajo ese mismo
 *                      key de `filtros` se envía como query string o body.
 * @param supabase    - Cliente admin de Supabase (para auth secrets).
 */
export async function fetchCatalogo(
  tramite:     Tramite,
  catalogoKey: string,
  filtros:     Record<string, string>,
  supabase:    SupabaseClient,
): Promise<
  | { ok: true;  items: { id: string; label: string; extra?: string[] }[]; truncated: boolean }
  | { ok: false; error: string }
> {
  const catalogo = tramite.catalogos.find(c => c.key === catalogoKey);
  if (!catalogo) {
    return {
      ok:    false,
      error: `Catálogo '${catalogoKey}' no encontrado en la configuración del trámite '${tramite.slug}'.`,
    };
  }

  // Validar longitud mínima del query si aplica
  if (catalogo.query_param && catalogo.min_query_length) {
    const queryValue = filtros[catalogo.query_param] ?? '';
    if (queryValue.length < catalogo.min_query_length) {
      return {
        ok:    false,
        error: `Se requieren al menos ${catalogo.min_query_length} caracteres para buscar en el catálogo '${catalogoKey}'. Proporciona más texto.`,
      };
    }
  }

  // Modo mock
  if (isMockMode()) {
    const fixture = await loadFixture(tramite.slug, 'catalogos', catalogoKey);
    if (fixture === null) {
      return {
        ok:    false,
        error: `Fixture de catálogo '${catalogoKey}' no encontrada para el trámite '${tramite.slug}'.`,
      };
    }
    const allItems = extractItems(fixture, catalogo.response_items_path);
    const mapped   = allItems
      .map(r => mapItem(r, catalogo.item_fields))
      .filter((x): x is { id: string; label: string; extra?: string[] } => x !== null);
    const truncated = mapped.length > MAX_ITEMS;
    return { ok: true, items: mapped.slice(0, MAX_ITEMS), truncated };
  }

  // Modo real: construir path y query
  let resolvedPath = resolvePath(catalogo.endpoint, filtros);

  let body: unknown = undefined;
  if (catalogo.query_param) {
    const queryValue = filtros[catalogo.query_param] ?? '';
    if (catalogo.method === 'GET') {
      const sep = resolvedPath.includes('?') ? '&' : '?';
      resolvedPath = `${resolvedPath}${sep}${encodeURIComponent(catalogo.query_param)}=${encodeURIComponent(queryValue)}`;
    } else {
      body = { [catalogo.query_param]: queryValue };
    }
  }

  const result = await callTramiteEndpoint(
    tramite,
    resolvedPath,
    { method: catalogo.method, body },
    supabase,
  );

  if (result.timedOut) {
    return {
      ok:    false,
      error: `El catálogo '${catalogoKey}' tardó demasiado en responder. Intenta de nuevo en unos momentos.`,
    };
  }
  if (result.status < 200 || result.status >= 300) {
    return {
      ok:    false,
      error: `El catálogo '${catalogoKey}' respondió con error ${result.status}. Intenta de nuevo o contacta a soporte.`,
    };
  }

  // Envelope-aware: HTTP 200 + {exito:false, ...} = soft error del servidor.
  const envelope = tramite.response_envelope;
  if (envelope && result.body && typeof result.body === 'object') {
    const record = result.body as Record<string, unknown>;
    if (record[envelope.success_field] === false) {
      const messageField = envelope.message_field ?? 'mensaje';
      const message = typeof record[messageField] === 'string' ? String(record[messageField]) : '';
      return {
        ok:    false,
        error: message || `El catálogo '${catalogoKey}' respondió sin éxito.`,
      };
    }
  }

  const allItems = extractItems(result.body, catalogo.response_items_path);
  const mapped   = allItems
    .map(r => mapItem(r, catalogo.item_fields))
    .filter((x): x is { id: string; label: string; extra?: string[] } => x !== null);
  const truncated = mapped.length > MAX_ITEMS;
  return { ok: true, items: mapped.slice(0, MAX_ITEMS), truncated };
}
