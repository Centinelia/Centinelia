import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin/auth';
import { MEERKAT_IDS, type MeerkatId, type GateStatus } from '@/lib/golden-tests/types';
import { computeGateVerdict } from '@/lib/golden-tests/gate';

interface Params { params: Promise<{ meerkat: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { meerkat } = await params;
  const target = Number(new URL(req.url).searchParams.get('target'));

  if (!MEERKAT_IDS.includes(meerkat as MeerkatId)) {
    return NextResponse.json({ error: `Unknown meerkat: ${meerkat}` }, { status: 400 });
  }
  if (!Number.isInteger(target) || target < 1) {
    return NextResponse.json({ error: 'target must be integer >= 1' }, { status: 400 });
  }

  const meerkatId = meerkat as MeerkatId;
  const result = await computeGateVerdict(meerkatId, target);

  const response: GateStatus = {
    meerkat_id: meerkatId,
    active: result.active,
    target: result.target,
    delta: result.delta,
    verdict: result.verdict,
  };

  return NextResponse.json(response);
}
