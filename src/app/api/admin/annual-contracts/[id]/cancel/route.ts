export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth/admin';
import { cancelContract, AnnualContractError } from '@/lib/annual-contracts/service';

interface Ctx { params: Promise<{ id: string }> }

// POST /api/admin/annual-contracts/[id]/cancel → cancela con reason obligatorio
export async function POST(req: NextRequest, ctx: Ctx) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;

  const { reason } = (await req.json().catch(() => ({}))) as { reason?: string };
  if (!reason || reason.trim().length < 5) {
    return NextResponse.json({ error: 'missing_reason', message: 'La razón de cancelación es obligatoria (mínimo 5 caracteres)' }, { status: 400 });
  }

  try {
    const contract = await cancelContract(id, reason.trim());
    return NextResponse.json({ contract });
  } catch (err) {
    if (err instanceof AnnualContractError) {
      const status = err.code === 'not_found' ? 404 : 400;
      return NextResponse.json({ error: err.code, message: err.message }, { status });
    }
    console.error('[admin/annual-contracts cancel] unexpected:', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
