import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin/auth';
import { fetchToolMetrics, type ToolMetricWindow } from '@/lib/observability/tool-metrics';

export const dynamic = 'force-dynamic';

const WINDOWS: ToolMetricWindow[] = ['1h', '24h', '7d', '30d'];

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp     = req.nextUrl.searchParams;
  const raw    = (sp.get('window') ?? '24h') as ToolMetricWindow;
  const window = WINDOWS.includes(raw) ? raw : '24h';

  try {
    const rows = await fetchToolMetrics({
      window,
      agentId:  sp.get('agent_id')  || null,
      channel:  sp.get('channel')   || null,
      toolName: sp.get('tool_name') || null,
    });
    return NextResponse.json({ rows });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
