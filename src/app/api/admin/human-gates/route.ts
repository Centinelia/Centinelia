import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp     = req.nextUrl.searchParams;
  const window = sp.get('window') ?? '7d';
  const type   = sp.get('gate_type');

  const hours = { '1h': 1, '24h': 24, '7d': 24 * 7, '30d': 24 * 30 }[window] ?? 24 * 7;
  const since = new Date(Date.now() - hours * 3_600_000).toISOString();

  const supabase = createAdminClient();
  let q = supabase
    .from('human_gate_decisions')
    .select('*')
    .gte('decided_at', since)
    .order('decided_at', { ascending: false })
    .limit(500);
  if (type) q = q.eq('gate_type', type);

  const { data: decisions } = await q;
  const rows = (decisions ?? []) as Array<Record<string, unknown>>;

  // Aggregate by gate_type + decision
  const byType: Record<string, Record<string, number>> = {};
  const byActor: Record<string, number> = {};
  const byChannel: Record<string, number> = {};
  for (const d of rows) {
    const gt = (d.gate_type as string) ?? 'unknown';
    const dc = (d.decision  as string) ?? 'unknown';
    const ac = (d.actor     as string) ?? 'unknown';
    const ch = (d.channel   as string) ?? 'unknown';
    if (!byType[gt]) byType[gt] = {};
    byType[gt][dc] = (byType[gt][dc] ?? 0) + 1;
    byActor[ac] = (byActor[ac] ?? 0) + 1;
    byChannel[ch] = (byChannel[ch] ?? 0) + 1;
  }

  return NextResponse.json({
    total:    rows.length,
    window,
    by_type:    byType,
    by_actor:   byActor,
    by_channel: byChannel,
    decisions:  rows.slice(0, 100),
  });
}
