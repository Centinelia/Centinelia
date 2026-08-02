export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest, adminActor } from '@/lib/auth/admin';
import { createContract, listContracts, AnnualContractError } from '@/lib/annual-contracts/service';
import type { CreateAnnualContractInput } from '@/types/annual-contract';

// GET /api/admin/annual-contracts → lista completa
export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const contracts = await listContracts();
    return NextResponse.json({ contracts });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'list_failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/admin/annual-contracts → crea (draft o activa según body.activate)
export async function POST(req: NextRequest) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Partial<CreateAnnualContractInput>;

  const required = ['organization_email', 'contract_folio', 'start_date', 'end_date', 'amount_mxn', 'monthly_minutes_pool', 'monthly_ops_pool'] as const;
  for (const key of required) {
    if (body[key] === undefined || body[key] === null || body[key] === '') {
      return NextResponse.json({ error: `missing_${key}` }, { status: 400 });
    }
  }

  try {
    const contract = await createContract(body as CreateAnnualContractInput, adminActor());
    return NextResponse.json({ contract }, { status: 201 });
  } catch (err) {
    if (err instanceof AnnualContractError) {
      const status = err.code === 'folio_duplicate' || err.code === 'already_active' ? 409
                   : err.code === 'org_not_found' ? 404
                   : 400;
      return NextResponse.json({ error: err.code, message: err.message }, { status });
    }
    console.error('[admin/annual-contracts POST] unexpected:', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
