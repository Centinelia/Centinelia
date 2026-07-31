import { NextRequest, NextResponse } from 'next/server';
import { listApprovals, createApproval, type ApprovalStatus, type CreateApprovalInput } from '@/lib/admin/approvals';
import { isAdmin } from '@/lib/admin/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!await isAdmin()) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const status = req.nextUrl.searchParams.get('status') as ApprovalStatus | null;
  try {
    const items = await listApprovals(status ?? undefined);
    return NextResponse.json({ ok: true, items });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!await isAdmin()) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  let body: CreateApprovalInput;
  try {
    body = await req.json() as CreateApprovalInput;
  } catch {
    return NextResponse.json({ ok: false, error: 'Body inválido' }, { status: 400 });
  }

  try {
    const item = await createApproval(body);
    return NextResponse.json({ ok: true, item });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
