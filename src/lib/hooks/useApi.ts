/**
 * useApi — wrapper delgado sobre SWR con las defaults de Centinelia.
 *
 * Reemplaza el pattern `refresh() + useEffect + setState` a lo largo del
 * portal/admin. Centraliza:
 *   - Fetcher común con JSON parsing + error handling consistente.
 *   - Extracción del payload `data.<key>` para APIs que envuelven la respuesta.
 *   - Errores de red (network) separados de errores lógicos (`data.error`).
 *   - Interfaz uniforme: `{ data, error, isLoading, mutate }`.
 *
 * Ejemplo mínimo:
 *   const { data, error, isLoading, mutate } = useApi<Factura[]>(
 *     `/api/admin/staff/neka/clientes/${clienteId}/facturas`,
 *     { key: 'facturas' },
 *   );
 *
 * Después de un side-effect (POST, PATCH) que cambia el server-side:
 *   await mutate();  // re-fetch. Opcional: mutate(nuevoData, { revalidate: false })
 *
 * Deshabilitar el fetch condicionalmente (ej. hasta tener un id):
 *   useApi(clienteId ? `/api/…/${clienteId}` : null);
 *
 * Cuándo usar esto vs fetch manual:
 *   - Data que la UI consume + puede necesitar re-fetch → useApi.
 *   - Side-effect one-shot (POST, DELETE) → fetch directo + mutate() del useApi correspondiente.
 */

import useSWR, { type SWRConfiguration, type SWRResponse } from 'swr';

// ─── Error class ──────────────────────────────────────────────────────────────

/**
 * Errores del helper: network (fetch falló) o lógico (API devolvió {error}).
 * Ambos se representan con la misma clase para que el consumer solo lea .message.
 */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// ─── Fetcher ──────────────────────────────────────────────────────────────────

interface FetcherOptions {
  /** Si el payload viene envuelto: `{ facturas: [...] }` → key = 'facturas'. Sin key devuelve el JSON completo. */
  key?: string;
}

async function jsonFetcher<T>(url: string, options: FetcherOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (e) {
    throw new ApiError(`Error de red: ${(e as Error).message}`, 0);
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    if (!res.ok) throw new ApiError(`HTTP ${res.status}`, res.status);
    throw new ApiError('Respuesta no es JSON', res.status);
  }
  // Preferimos el error del payload (más descriptivo) sobre HTTP status
  const errorField = (json as Record<string, unknown>)?.error;
  if (!res.ok || typeof errorField === 'string') {
    const message = typeof errorField === 'string' ? errorField : `HTTP ${res.status}`;
    throw new ApiError(message, res.status);
  }
  if (options.key) {
    const value = (json as Record<string, unknown>)[options.key];
    if (value === undefined) throw new ApiError(`Campo "${options.key}" ausente en la respuesta`, res.status);
    return value as T;
  }
  return json as T;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseApiOptions<T> extends Omit<SWRConfiguration<T, ApiError>, 'fetcher'> {
  /** Nombre del campo a extraer del payload envolvente (ej. 'facturas'). */
  key?: string;
}

/**
 * Wrapper de useSWR. Devuelve la interfaz estándar más un `isLoading` derivado
 * (SWR ya lo expone en v2, lo reforzamos para el caso `data === undefined`).
 *
 * Pasar `null` como URL deshabilita el fetch — útil para condicionales.
 */
export function useApi<T = unknown>(
  url: string | null,
  options: UseApiOptions<T> = {},
): SWRResponse<T, ApiError> & { isLoading: boolean } {
  const { key, ...swrOptions } = options;
  const swr = useSWR<T, ApiError>(
    url,
    url ? () => jsonFetcher<T>(url, { key }) : null,
    swrOptions,
  );
  return {
    ...swr,
    isLoading: !!url && swr.data === undefined && !swr.error,
  };
}
