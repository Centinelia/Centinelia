export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth/admin';
import { activateContract, AnnualContractError } from '@/lib/annual-contracts/service';

interface Ctx { params: Promise<{ id: string }> }

// POST /api/admin/annual-contracts/[id]/activate → transición draft → active
export async function POST(_req: NextRequest, ctx: Ctx) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const contract = await activateContract(id);
    return NextResponse.json({ contract });
  } catch (err) {
    if (err instanceof AnnualContractError) {
      const status = err.code === 'already_active' ? 409 : err.code === 'not_found' ? 404 : 400;
      return NextResponse.json({ error: err.code, message: err.message }, { status });
    }
    console.error('[admin/annual-contracts activate] unexpected:', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
