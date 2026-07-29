import { NextRequest, NextResponse } from 'next/server';
import { listApprovals, createApproval, type ApprovalStatus, type CreateApprovalInput } from '@/lib/admin/approvals';

export const dynamic = 'force-dynamic';

const ADMIN_COOKIE = 'Centinelia_admin';

function requireAdmin(req: NextRequest): boolean {
  const c = req.cookies.get(ADMIN_COOKIE)?.value;
  return !!c && c === process.env.ADMIN_SECRET;
}

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const status = req.nextUrl.searchParams.get('status') as ApprovalStatus | null;
  try {
    const items = await listApprovals(status ?? undefined);
    return NextResponse.json({ ok: true, items });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

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
