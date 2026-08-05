import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/** GET: agregado del DAG. Cuántos handoffs por par (from, to) + edges declarativos. */
export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp     = req.nextUrl.searchParams;
  const window = sp.get('window') ?? '7d';
  const hours  = { '24h': 24, '7d': 24 * 7, '30d': 24 * 30 }[window] ?? 24 * 7;
  const since  = new Date(Date.now() - hours * 3_600_000).toISOString();

  const supabase = createAdminClient();

  const { count: logsTotal, error: countErr } = await supabase
    .from('meerkat_handoff_log')
    .select('id', { count: 'exact', head: true })
    .gte('handoff_at', since);

  const { data: logs, error: logsErr } = await supabase
    .from('meerkat_handoff_log')
    .select('portal_email, from_meerkat, to_meerkat, tool_name, outcome, handoff_at')
    .gte('handoff_at', since)
    .order('handoff_at', { ascending: false })
    .limit(5000);
  if (countErr || logsErr) return NextResponse.json({ error: (countErr ?? logsErr)!.message }, { status: 500 });

  // Agregar por par
  const pairs: Record<string, { from: string; to: string; total: number; success: number; rejected: number; failed: number; by_tool: Record<string, number> }> = {};
  for (const r of (logs ?? []) as Record<string, unknown>[]) {
    const from = r.from_meerkat as string;
    const to   = r.to_meerkat   as string;
    const key  = `${from}::${to}`;
    if (!pairs[key]) pairs[key] = { from, to, total: 0, success: 0, rejected: 0, failed: 0, by_tool: {} };
    pairs[key].total++;
    const oc = (r.outcome as string) ?? 'unknown';
    if (oc === 'success')  pairs[key].success++;
    if (oc === 'rejected') pairs[key].rejected++;
    if (oc === 'failed')   pairs[key].failed++;
    const tn = (r.tool_name as string) ?? 'unknown';
    pairs[key].by_tool[tn] = (pairs[key].by_tool[tn] ?? 0) + 1;
  }

  const { data: edges, error: edgesErr } = await supabase
    .from('meerkat_handoff_edges')
    .select('id, portal_email, from_meerkat, to_meerkat, tool_name, enabled, reason, updated_at')
    .order('updated_at', { ascending: false });
  if (edgesErr) return NextResponse.json({ error: edgesErr.message }, { status: 500 });

  const recentLogs = (logs ?? []).slice(0, 50);

  return NextResponse.json({
    window,
    total:      logsTotal ?? (logs?.length ?? 0),
    aggregated: logs?.length ?? 0,
    truncated:  (logsTotal ?? 0) > (logs?.length ?? 0),
    pairs: Object.values(pairs).sort((a, b) => b.total - a.total),
    edges: edges ?? [],
    recent: recentLogs,
  });
}

/** POST: crear/actualizar un edge (from, to, tool?, enabled). */
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    portal_email?: string | null;
    from_meerkat:  string;
    to_meerkat:    string;
    tool_name?:    string | null;
    enabled:       boolean;
    reason?:       string | null;
  };
  const { from_meerkat, to_meerkat, tool_name, enabled, reason, portal_email } = body;
  if (!from_meerkat || !to_meerkat) return NextResponse.json({ error: 'from_meerkat + to_meerkat requeridos' }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase.from('meerkat_handoff_edges').upsert({
    portal_email: portal_email ?? null,
    from_meerkat,
    to_meerkat,
    tool_name:    tool_name ?? null,
    enabled,
    reason:       reason ?? null,
    updated_at:   new Date().toISOString(),
  }, { onConflict: 'portal_email,from_meerkat,to_meerkat,tool_name' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** DELETE: borra edge por id. */
export async function DELETE(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase.from('meerkat_handoff_edges').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
