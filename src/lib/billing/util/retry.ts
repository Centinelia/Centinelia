/**
 * retry.ts — Utilidad de reintento con backoff exponencial.
 *
 * Uso tipico para llamadas a Supabase que pueden fallar por errores transientes de red.
 *
 * @example
 *   const result = await retryWithBackoff(() =>
 *     supabase.from('tabla').select('campo').single()
 *   );
 */

export interface RetryOptions {
  /** Numero maximo de intentos (incluye el primero). Default: 3. */
  maxAttempts?: number;
  /** Delay inicial en ms antes del primer reintento. Default: 100. */
  initialDelayMs?: number;
  /** Delay maximo en ms entre reintentos. Default: 2000. */
  maxDelayMs?: number;
  /** Multiplicador de backoff. Default: 2. */
  backoff?: number;
  /**
   * Predicado opcional para decidir si un error es reintentable.
   * Si devuelve false, el error se propaga inmediatamente sin mas intentos.
   * Si se omite, todos los errores se reintentan (comportamiento original).
   */
  isRetryable?: (error: unknown) => boolean;
}

/**
 * Ejecuta `fn` con reintentos y backoff exponencial.
 *
 * Reintenta cuando `fn` lanza cualquier error. Si se agotan los intentos,
 * propaga el ultimo error recibido.
 *
 * @param fn    Funcion async a ejecutar. Puede lanzar en caso de fallo transiente.
 * @param opts  Opciones de reintento. Todos los campos son opcionales.
 * @returns     El valor resuelto de `fn` al primer intento exitoso.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const initialDelayMs = opts.initialDelayMs ?? 100;
  const maxDelayMs = opts.maxDelayMs ?? 2000;
  const backoff = opts.backoff ?? 2;
  const { isRetryable } = opts;

  let lastError: unknown;
  let delayMs = initialDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      // If a retryable predicate is provided and the error is not retryable,
      // throw immediately without sleeping or consuming remaining attempts.
      if (isRetryable !== undefined && !isRetryable(err)) {
        throw err;
      }
      if (attempt < maxAttempts) {
        await sleep(Math.min(delayMs, maxDelayMs));
        delayMs *= backoff;
      }
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
