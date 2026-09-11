import { createClient } from '@supabase/supabase-js';

// Convención de ok/outcome en executors mock:
// - ok=true, outcome='found' | 'no_results' | 'account_not_verified' | 'transfer_not_found' etc.
//   Respuestas semánticas legítimas — la tool corrió bien, el resultado es una
//   señal para que el LLM decida qué hacer.
// - ok=false: reservado para errores técnicos reales (RPC crash, DB down, tool
//   no encontrada). Estos SÍ deben disparar alertas en Nash / pilot-monitor.
export async function executeMeefiSearchHelpCenter(
  _ctx: any,
  input: { query: string },
) {
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data, error } = await supabase.rpc('search_meefi_help_center', {
    q: input.query,
    top_k: 3,
  });
  if (error) return { ok: false as const, reason: 'search_failed', message: error.message };
  if (!data || data.length === 0) return { ok: true as const, outcome: 'no_results' as const, articles: [] };
  return { ok: true as const, outcome: 'found' as const, articles: data as unknown[] };
}
