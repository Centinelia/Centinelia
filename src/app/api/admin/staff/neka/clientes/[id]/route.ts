import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin/auth';
import { getClienteById, updateCliente, type CentineliaClienteInput } from '@/lib/billing/centinelia-clientes';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdmin()) return NextResponse.json({ error: 'admin only' }, { status: 401 });
  const { id } = await params;
  const cliente = await getClienteById(id);
  if (!cliente) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ cliente });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdmin()) return NextResponse.json({ error: 'admin only' }, { status: 401 });
  const { id } = await params;
  const patch = await req.json() as Partial<CentineliaClienteInput>;
  try {
    const cliente = await updateCliente(id, patch);
    return NextResponse.json({ cliente });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
