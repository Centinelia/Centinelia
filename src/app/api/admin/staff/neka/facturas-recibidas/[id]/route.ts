import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin/auth';
import { updateFacturaRecibida, deleteFacturaRecibida } from '@/lib/billing/centinelia-facturas-recibidas';

export const dynamic     = 'force-dynamic';
export const maxDuration = 15;

/** PATCH — actualiza categoria_gasto, deducible y/o notas. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdmin()) return NextResponse.json({ error: 'admin only' }, { status: 401 });
  const { id } = await params;

  let body: { categoriaGasto?: string | null; deducible?: boolean; notas?: string | null } = {};
  try { body = await req.json(); } catch { /* body opcional pero implica no-op */ }

  const result = await updateFacturaRecibida(id, body);
  if (!result.ok) {
    const status = result.code === 'not_found' ? 404 : 500;
    return NextResponse.json({ error: result.message, code: result.code }, { status });
  }
  return NextResponse.json({ factura: result.factura });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdmin()) return NextResponse.json({ error: 'admin only' }, { status: 401 });
  const { id } = await params;

  const result = await deleteFacturaRecibida(id);
  if (!result.ok) {
    const status = result.code === 'not_found' ? 404 : 500;
    return NextResponse.json({ error: result.message, code: result.code }, { status });
  }
  return NextResponse.json({ deletedId: result.deletedId });
}
