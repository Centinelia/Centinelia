import type { createAdminClient } from '@/lib/supabase/admin';
import type { Tramite } from './types';
import { callTramiteEndpoint } from './client';
import { isMockMode, loadFixture } from './mock';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export type FetchLookupResult =
  | { ok: true;  found: true;  data: Record<string, unknown> }
  | { ok: true;  found: false; data: null }
  | { ok: false; error: string };

/**
 * Lee un valor de un objeto anidado usando un path con puntos.
 *
 * readByPath({ response: { folio: "123" } }, "response.folio") → "123"
 * readByPath({ folio: "X" }, "folio")                          → "X"
 * readByPath({}, "missing.key")                                → null
 */
function readByPath(obj: unknown, path: string): unknown {
  const segments = path.split('.');
  let current: unknown = obj;
  for (const seg of segments) {
    if (current == null || typeof current !== 'object') return null;
    current = (current as Record<string, unknown>)[seg];
  }
  return current ?? null;
}

/**
 * Consulta un lookup (padrón, CURP, RFC, etc.) para un trámite.
 *
 * @param tramite   - Configuración del trámite.
 * @param lookupKey - Valor de `Lookup.key` a buscar en `tramite.lookups`.
 * @param valor     - Valor a consultar (ej. CURP, RFC, número de cuenta).
 * @param supabase  - Cliente admin de Supabase (para auth secrets).
 *
 * Comportamiento:
 * - 404 o body null → found: false (el agente decide si rechazar o continuar
 *   según `lookup.not_found_action`).
 * - 2xx → found: true, `data` mapeado desde `response_fields`.
 * - Timeout / 5xx → ok: false con mensaje descriptivo.
 *
 * En modo mock:
 * - Si `valor` termina en `_MISS` → carga fixture `{key}_miss.json`.
 * - De lo contrario → carga fixture `{key}_hit.json`.
 */
export async function fetchLookup(
  tramite:   Tramite,
  lookupKey: string,
  valor:     string,
  supabase:  SupabaseClient,
): Promise<FetchLookupResult> {
  const lookup = tramite.lookups.find(l => l.key === lookupKey);
  if (!lookup) {
    return {
      ok:    false,
      error: `Lookup '${lookupKey}' no encontrado en la configuración del trámite '${tramite.slug}'.`,
    };
  }

  // Modo mock
  if (isMockMode()) {
    const fixtureName = valor.endsWith('_MISS') ? `${lookupKey}_miss` : `${lookupKey}_hit`;
    const fixture = await loadFixture(tramite.slug, 'lookups', fixtureName);

    if (fixture === null || valor.endsWith('_MISS')) {
      // Miss explícito o fixture de miss no encontrada
      return { ok: true, found: false, data: null };
    }

    const data: Record<string, unknown> = {};
    for (const [outputKey, sourcePath] of Object.entries(lookup.response_fields)) {
      data[outputKey] = readByPath(fixture, sourcePath);
    }
    return { ok: true, found: true, data };
  }

  // Modo real: construir path + query string (GET siempre)
  let pathAndQuery = lookup.endpoint;
  const sep = pathAndQuery.includes('?') ? '&' : '?';
  if (lookup.method === 'GET') {
    pathAndQuery = `${pathAndQuery}${sep}${encodeURIComponent(lookup.query_param)}=${encodeURIComponent(valor)}`;
  }

  const result = await callTramiteEndpoint(
    tramite,
    pathAndQuery,
    { method: lookup.method, body: lookup.method === 'POST' ? { [lookup.query_param]: valor } : undefined },
    supabase,
  );

  if (result.timedOut) {
    return {
      ok:    false,
      error: `El servicio de verificación '${lookupKey}' no respondió a tiempo. Intenta de nuevo en unos momentos.`,
    };
  }

  // 404 o body null → no encontrado
  if (result.status === 404 || result.body === null) {
    return { ok: true, found: false, data: null };
  }

  if (result.status < 200 || result.status >= 300) {
    return {
      ok:    false,
      error: `El servicio '${lookupKey}' respondió con error ${result.status}. Intenta de nuevo o contacta a soporte técnico.`,
    };
  }

  const data: Record<string, unknown> = {};
  for (const [outputKey, sourcePath] of Object.entries(lookup.response_fields)) {
    data[outputKey] = readByPath(result.body, sourcePath);
  }
  return { ok: true, found: true, data };
}
