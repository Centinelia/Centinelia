export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth/admin';
import { getContract, updateContract, AnnualContractError } from '@/lib/annual-contracts/service';
import type { AnnualContract } from '@/types/annual-contract';

interface Ctx { params: Promise<{ id: string }> }

// GET /api/admin/annual-contracts/[id]
export async function GET(_req: NextRequest, ctx: Ctx) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const contract = await getContract(id);
  if (!contract) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ contract });
}

// PATCH /api/admin/annual-contracts/[id] → edita campos permitidos
export async function PATCH(req: NextRequest, ctx: Ctx) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const patch = (await req.json().catch(() => ({}))) as Partial<AnnualContract>;

  try {
    const contract = await updateContract(id, patch);
    return NextResponse.json({ contract });
  } catch (err) {
    if (err instanceof AnnualContractError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: 400 });
    }
    console.error('[admin/annual-contracts PATCH] unexpected:', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
