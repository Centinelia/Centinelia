/**
 * Guard para tests de integración que insertan en Supabase real.
 * Llama a assertNotProdOrAllowed() en beforeAll de cualquier test que mute
 * datos en Supabase para evitar escribir en la base de producción por error.
 *
 * Sólo permite la ejecución si:
 *   1. SUPABASE_URL NO contiene ".supabase.co" (ambiente de dev local), O
 *   2. La variable de entorno TEST_ALLOW_PROD=true está explícitamente activada.
 *
 * Ver feedback: smoke_guard_prod_db (sesión 2026-09-17).
 */

export async function assertNotProdOrAllowed(): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const allowProd = process.env.TEST_ALLOW_PROD === 'true';

  if (allowProd) return;

  // La URL de producción de Supabase hosted termina en .supabase.co
  if (supabaseUrl.includes('.supabase.co')) {
    throw new Error(
      '[prod-guard] BLOQUEADO: SUPABASE_URL apunta a un proyecto hosted en Supabase (.supabase.co). ' +
      'Este test inserta/modifica datos reales. ' +
      'Usa un ambiente de dev local o activa TEST_ALLOW_PROD=true solo si sabes lo que haces.',
    );
  }
}
