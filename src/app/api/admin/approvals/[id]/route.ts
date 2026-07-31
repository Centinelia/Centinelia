import { NextRequest, NextResponse } from 'next/server';
import { decideApproval, executeApproval, getApproval } from '@/lib/admin/approvals';
import { isAdmin } from '@/lib/admin/auth';

export const dynamic = 'force-dynamic';

interface Params { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  if (!await isAdmin()) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const item = await getApproval(id);
  if (!item) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true, item });
}

/**
 * PATCH — decide un approval. Body: { approve: boolean, note?: string }.
 * Si approve=true, ejecuta la acción respaldada por el approval.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  if (!await isAdmin()) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  let body: { approve?: boolean; note?: string };
  try {
    body = await req.json() as { approve?: boolean; note?: string };
  } catch {
    return NextResponse.json({ ok: false, error: 'Body inválido' }, { status: 400 });
  }

  if (typeof body.approve !== 'boolean') {
    return NextResponse.json({ ok: false, error: 'Falta approve: boolean' }, { status: 400 });
  }

  try {
    const decided = await decideApproval({
      id,
      approve:   body.approve,
      decidedBy: 'admin',
      note:      body.note,
    });

    if (!body.approve) {
      return NextResponse.json({ ok: true, item: decided, executed: null });
    }

    // Ejecutar la acción respaldada
    const executed = await executeApproval(decided);
    return NextResponse.json({ ok: executed.ok, item: decided, executed });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
