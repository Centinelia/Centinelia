export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest, adminActor } from '@/lib/auth/admin';
import { renewContract, AnnualContractError } from '@/lib/annual-contracts/service';
import type { CreateAnnualContractInput } from '@/types/annual-contract';

interface Ctx { params: Promise<{ id: string }> }

// POST /api/admin/annual-contracts/[id]/renew → crea nuevo contrato con start = end previo
export async function POST(req: NextRequest, ctx: Ctx) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;

  const overrides = (await req.json().catch(() => ({}))) as Partial<CreateAnnualContractInput>;
  if (!overrides.contract_folio) {
    return NextResponse.json({ error: 'missing_contract_folio' }, { status: 400 });
  }

  try {
    const contract = await renewContract(id, overrides, adminActor());
    return NextResponse.json({ contract }, { status: 201 });
  } catch (err) {
    if (err instanceof AnnualContractError) {
      const status = err.code === 'not_found' ? 404 : err.code === 'folio_duplicate' ? 409 : 400;
      return NextResponse.json({ error: err.code, message: err.message }, { status });
    }
    console.error('[admin/annual-contracts renew] unexpected:', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
