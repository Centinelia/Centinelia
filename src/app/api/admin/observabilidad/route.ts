import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin/auth';
import { fetchObservabilityData } from '@/app/admin/observabilidad/queries';
import type { ObsFilters, ObsWindow } from '@/app/admin/observabilidad/types';


const VALID_WINDOWS: ObsWindow[] = ['24h', '7d', '30d', 'since_activation'];

export async function GET(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const w = url.searchParams.get('window') as ObsWindow | null;
  const window: ObsWindow = w && VALID_WINDOWS.includes(w) ? w : '24h';
  const meerkatIdsParam = url.searchParams.get('meerkat_ids');
  const meerkatIds = meerkatIdsParam ? meerkatIdsParam.split(',').filter(Boolean) : null;
  const flagKey = url.searchParams.get('flag_key');
  const includeUnattributed = url.searchParams.get('include_unattributed') === '1';

  const filters: ObsFilters = { window, meerkatIds, flagKey, includeUnattributed };

  try {
    const data = await fetchObservabilityData(filters);
    return NextResponse.json({ rows: data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
