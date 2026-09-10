import { createClient } from '@supabase/supabase-js';

export async function executeMeefiSearchHelpCenter(
  _ctx: any,
  input: { query: string },
) {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data, error } = await supabase.rpc('search_meefi_help_center', {
    q: input.query,
    top_k: 3,
  });
  if (error) return { ok: false as const, reason: 'search_failed', message: error.message };
  if (!data || data.length === 0) return { ok: false as const, reason: 'no_results' };
  return { ok: true as const, articles: data as unknown[] };
}
