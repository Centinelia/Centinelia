import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin/auth';
import { deleteClienteDoc } from '@/lib/billing/centinelia-clientes-docs';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  if (!await isAdmin()) return NextResponse.json({ error: 'admin only' }, { status: 401 });

  const { id, docId } = await params;
  const result = await deleteClienteDoc(id, docId);

  if (!result.ok) {
    const status = result.code === 'not_found' ? 404 : 500;
    return NextResponse.json({ error: result.message, code: result.code }, { status });
  }

  return NextResponse.json({ deleted: result.deleted });
}
