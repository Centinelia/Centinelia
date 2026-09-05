import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// Bug reports que llegaron por el footer del portal (o vía el tool reportar_falla
// de un agente) pero que Nash aún no convirtió en platform_incidents. Sirve para
// que Nazre vea reportes crudos cuando Nash está pausado o corriendo detrás.
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();

  const sinceIso = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const { data: rawReports, error: rawErr } = await supabase
    .from('tool_call_log')
    .select('id, agent_id, portal_email, input_json, created_at')
    .eq('tool_name', 'reportar_falla')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(100);

  if (rawErr) return NextResponse.json({ error: rawErr.message }, { status: 500 });
  if (!rawReports || rawReports.length === 0) return NextResponse.json({ items: [] });

  const ids = rawReports.map(r => r.id as string);
  const { data: processed, error: procErr } = await supabase
    .from('platform_incidents')
    .select('source_id')
    .eq('source', 'bug_report')
    .in('source_id', ids);

  if (procErr) return NextResponse.json({ error: procErr.message }, { status: 500 });

  const processedSet = new Set((processed ?? []).map(p => p.source_id as string));

  const items = rawReports
    .filter(r => !processedSet.has(r.id as string))
    .map(r => {
      const input = (r.input_json ?? {}) as Record<string, unknown>;
      return {
        id:           r.id as string,
        created_at:   r.created_at as string,
        portal_email: r.portal_email as string | null,
        agent_id:     r.agent_id as string | null,
        tipo:         (input.tipo as string | null) ?? 'General',
        descripcion:  (input.descripcion as string | null) ?? '',
        source:       (input.source as string | null) ?? null,
      };
    });

  return NextResponse.json({ items });
}
